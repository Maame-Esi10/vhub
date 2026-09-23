import { z } from "zod";
import {
  type Layer1MatchResult,
  type Layer1OutreachInput,
  type Layer1VolunteerInput,
} from "@/lib/matching/layer1";
import { shouldWidenFeedSearch } from "@/lib/matching/feedFilter";
import { computeMultiRoleMatchScore, type RoleInput } from "@/lib/matching/multiRole";
import { computeRankingScore } from "@/lib/vscore";
import { getReachableRegions } from "@/constants/ghana-locations";
import { authenticate, assertOwnsOutreach, type AuthedCaller } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit, enforceUserRateLimit } from "../../../server/rateLimit";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import {
  fetchDaysByOutreach,
  fetchRolesByOutreach,
  toOutreachInput,
} from "../../../server/outreachInput";
import { checkSkillEquivalences, type SkillPair } from "../../../server/gemini";
import {
  dedupePairs,
  lookupSkillCache,
  normalizeSkill,
  orderPair,
  upsertSkillCacheResults,
  type OrderedSkillPair,
} from "../../../server/skillCache";
import { notifyUsers, type UserNotification } from "../../../server/notify";
import { env } from "../../../server/env";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Request contract
//
// Three modes, two audiences:
//
//   mode "score_applicants" (ORGANISATION): given an outreachId the caller's
//   organisation owns, (re)compute match_score for that outreach's
//   applications (all of them, or a supplied volunteerIds subset -- e.g.
//   right after a single new application comes in) and persist it to
//   `applications.match_score` with the service-role key, since that column
//   is service-role write-only. Returns the scored applicants sorted
//   descending, which is exactly the order hooks/useApplications.ts's
//   useOutreachApplications already expects (`.order('match_score', ...)`).
//
//   mode "rank_feed" (VOLUNTEER): the mirror image -- given the caller's own
//   volunteer profile, rank every OPEN outreach for them and return the
//   outreaches themselves, best match first. Owner decision (2026-07-29, see
//   docs/REPORT_NOTES.md): the volunteer feed is where AI matching adds the
//   most value, so it runs the SAME Layer 1 + Layer 2 pipeline as the
//   organisation side rather than a cheaper client-side Layer-1-only ranking.
//   Nothing is persisted -- a feed ranking is a read, and
//   `applications.match_score` only means "score at apply time".
//
//   mode "notify_candidates" (ORGANISATION, extension -- see
//   docs/REPORT_NOTES.md): a broad Layer-1-only scan over verified volunteers
//   who haven't yet applied, to push a "new high-match outreach"
//   notification. This is /api/notifications' "new high-match outreach"
//   trigger, implemented here (not in /api/notifications) because it needs
//   the matching engine, and kept Layer-1-only (no Gemini) since it is a
//   broad, low-stakes scan rather than a per-applicant decision.
// ---------------------------------------------------------------------------

const ScoreApplicantsBody = z.object({
  mode: z.literal("score_applicants"),
  outreachId: z.string().uuid(),
  /** Optional -- restrict scoring to these volunteers' applications (e.g. one new application) instead of every applicant. */
  volunteerIds: z.array(z.string().uuid()).max(200).optional(),
});

const NotifyCandidatesBody = z.object({
  mode: z.literal("notify_candidates"),
  outreachId: z.string().uuid(),
});

const ScoreMyApplicationBody = z.object({
  mode: z.literal("score_my_application"),
  outreachId: z.string().uuid(),
});

const RankFeedBody = z.object({
  mode: z.literal("rank_feed"),
  /** Ghana region name, or null/absent for every region. Mirrors the feed's own filter chips. */
  region: z.string().min(1).nullish(),
  roleType: z.enum(["clinical", "support"]).nullish(),
  /** Hard-capped: the whole feed is ranked in one request, so this also bounds the Layer 2 fan-out. */
  limit: z.number().int().min(1).max(100).optional(),
});

const FEED_DEFAULT_LIMIT = 50;

const MatchRequestBody = z.discriminatedUnion("mode", [
  ScoreApplicantsBody,
  ScoreMyApplicationBody,
  RankFeedBody,
  NotifyCandidatesBody,
]);

// ---------------------------------------------------------------------------
// Shared shapes fetched from Supabase
// ---------------------------------------------------------------------------

interface ApplicantRow {
  id: string;
  volunteer_id: string;
  status: string;
  /** The role this application is for. Null in single-role mode. */
  outreach_role_id: string | null;
  volunteer: {
    id: string;
    category: Layer1VolunteerInput["category"];
    skill_tags: string[] | null;
    experience_level: Layer1VolunteerInput["experience_level"];
    availability_slots: string[] | null;
    /** Drives the reliability multiplier; NOT part of Layer1VolunteerInput. */
    v_score: number | null;
    profile: { region: string | null; district: string | null } | null;
  } | null;
}

function toVolunteerInput(volunteer: ApplicantRow["volunteer"]): Layer1VolunteerInput {
  return {
    category: volunteer?.category ?? null,
    skill_tags: volunteer?.skill_tags ?? null,
    experience_level: volunteer?.experience_level ?? null,
    availability_slots: volunteer?.availability_slots ?? null,
    region: volunteer?.profile?.region ?? null,
    district: volunteer?.profile?.district ?? null,
  };
}

// toOutreachInput moved to ../../../server/outreachInput so the
// under-subscription pass scores candidates through the same mapper. It had
// already silently lost `role_type` once; one definition means that class of
// bug cannot recur in only one of the two callers.

export async function POST(req: Request): Promise<Response> {
  try {
    // First, ahead of validation and of authentication, so a flood is refused
    // before this project spends anything on it. Counted once per request
    // however many times it is called -- see server/rateLimit.ts.
    enforceIpRateLimit(req);
    const caller = await authenticate(req);
    // Tighter than the default: every call here may spend Gemini quota, which
    // is ~1,500 a DAY for the whole platform (Layer 2 falls back to Layer 1 when
    // it runs out, so this protects match QUALITY, not availability).
    enforceUserRateLimit(caller.userId, "match");
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = MatchRequestBody.parse(json);

    // The two volunteer-facing modes are dispatched before the
    // organisation-ownership check that the other two share.
    if (body.mode === "rank_feed") {
      return Response.json(await rankFeed(caller, body));
    }
    if (body.mode === "score_my_application") {
      return Response.json(await scoreMyApplication(caller, body.outreachId));
    }

    const outreach = await assertOwnsOutreach(caller, body.outreachId);

    if (body.mode === "score_applicants") {
      return Response.json(await scoreApplicants(outreach, body.volunteerIds));
    }
    return Response.json(await notifyCandidates(outreach));
  } catch (err) {
    return errorResponse(err, req);
  }
}

// ---------------------------------------------------------------------------
// mode: score_applicants
// ---------------------------------------------------------------------------

const APPLICANT_SELECT = `
  id, volunteer_id, status, outreach_role_id,
  volunteer:volunteer_profiles (
    id, category, skill_tags, experience_level, availability_slots, v_score,
    profile:profiles ( region, district )
  )
`;

/**
 * The roles a given application should be scored against.
 *
 * An applicant who CHOSE a role is scored against that role alone — they are
 * not competing for the others, and reporting their fit for a role they did
 * not apply for would misrepresent the decision the organisation is making.
 * An applicant with no chosen role (single-role mode, or an application made
 * before roles existed) is scored against the best role available to them.
 */
function rolesForApplication(
  allRoles: readonly RoleInput[],
  chosenRoleId: string | null | undefined
): RoleInput[] {
  if (!chosenRoleId) return [...allRoles];
  const chosen = allRoles.find((role) => role.id === chosenRoleId);
  return chosen ? [chosen] : [...allRoles];
}

async function scoreApplicants(outreach: Record<string, unknown>, volunteerIds?: string[]) {
  const admin = getSupabaseAdmin();
  let query = admin.from("applications").select(APPLICANT_SELECT).eq("outreach_id", outreach.id as string);
  if (volunteerIds?.length) {
    query = query.in("volunteer_id", volunteerIds);
  }

  const { data, error } = await query;
  if (error) throw Errors.internal("Could not load applicants for this outreach.");

  const applications = (data ?? []) as unknown as ApplicantRow[];
  if (applications.length === 0) {
    return { outreachId: outreach.id, layer2Applied: true, results: [] as ScoredApplicant[] };
  }

  // The day rows, for the availability component: it is now scored across
  // every day the event runs on rather than against its first. A read that
  // fails leaves the map empty and the scorer falls back to `date`, which is
  // the behaviour availability had before this change.
  const daysByOutreach = await fetchDaysByOutreach(admin, [outreach.id as string]);
  const outreachInput = toOutreachInput(outreach, daysByOutreach.get(outreach.id as string));

  // Roles, if this is a multi-role outreach. Empty means single-role mode and
  // computeMultiRoleMatchScore delegates to the original scorer unchanged.
  const rolesByOutreach = await fetchRolesByOutreach(admin, [outreach.id as string]);
  const allRoles = rolesByOutreach.get(outreach.id as string) ?? [];

  // Layer 1 ALWAYS runs first, for every applicant -- this is the result
  // every applicant gets if Layer 2 is unavailable for any reason at all.
  const layer1Results = new Map<string, Layer1MatchResult & { bestRoleId: string | null }>();
  for (const application of applications) {
    layer1Results.set(
      application.id,
      computeMultiRoleMatchScore(
        toVolunteerInput(application.volunteer),
        outreachInput,
        rolesForApplication(allRoles, application.outreach_role_id)
      )
    );
  }

  // Layer 2 is entirely best-effort: any failure anywhere in this block
  // leaves layer1Results (and therefore the final scores) untouched.
  let layer2: Layer2Outcome = { byKey: new Map(), applied: false };
  try {
    layer2 = await computeLayer2Equivalences(
      admin,
      applications.map((application) => ({
        key: application.id,
        // The winning role's requirement, falling back to the outreach's when
        // the role does not state its own. Sending the outreach's list for a
        // role that overrides it would have Gemini compare the wrong skills.
        requiredSkills:
          allRoles.find((role) => role.id === layer1Results.get(application.id)?.bestRoleId)
            ?.required_skills ??
          outreachInput.required_skills ??
          [],
        volunteerSkills: application.volunteer?.skill_tags ?? [],
      }))
    );
  } catch (err) {
    console.error("[match] Layer 2 failed, falling back to Layer 1:", err instanceof Error ? err.message : err);
    layer2 = { byKey: new Map(), applied: false };
  }

  const results: ScoredApplicant[] = applications.map((application) => {
    const equivalences = layer2.byKey.get(application.id);
    const final = equivalences
      ? computeMultiRoleMatchScore(
          toVolunteerInput(application.volunteer),
          outreachInput,
          rolesForApplication(allRoles, application.outreach_role_id),
          { skillEquivalences: equivalences }
        )
      : layer1Results.get(application.id)!;

    const vScore = application.volunteer?.v_score ?? null;

    return {
      applicationId: application.id,
      volunteerId: application.volunteer_id,
      matchScore: final.total,
      breakdown: final,
      // Which role this score is FOR. Without it an organisation sees a 92%
      // with no way to know which of its four requirements it refers to.
      bestRoleId: "bestRoleId" in final ? final.bestRoleId : null,
      vScore,
      rankingScore: computeRankingScore(final.total, vScore),
    };
  });

  // Persist match_score -- service-role write-only column (see
  // supabase/schema.sql). The RAW score is what gets stored: match_score is a
  // record of FIT at apply time, and reliability is already recorded, and
  // changes independently, on volunteer_profiles.v_score. Writing the
  // multiplied value would conflate the two and silently rewrite history every
  // time a volunteer's V-Score moved.
  await Promise.all(
    results.map((r) => admin.from("applications").update({ match_score: r.matchScore }).eq("id", r.applicationId))
  );

  // Ordered by rankingScore (fit x reliability), so a chronic no-show sinks
  // below a reliable candidate of moderately lower fit. Ties fall back to raw
  // fit. Both numbers travel to the client: the organisation still sees the
  // true match percentage and the V-Score separately, and the multiplier is
  // never presented as the volunteer's match.
  results.sort((a, b) => {
    if (b.rankingScore !== a.rankingScore) return b.rankingScore - a.rankingScore;
    return b.matchScore - a.matchScore;
  });
  return { outreachId: outreach.id, layer2Applied: layer2.applied, results };
}

interface ScoredApplicant {
  applicationId: string;
  volunteerId: string;
  /** Raw fit, 0-100. This is what the organisation sees as "match". */
  matchScore: number;
  breakdown: Layer1MatchResult;
  /** The volunteer's reliability score, shown alongside -- never folded in. */
  vScore: number | null;
  /** matchScore x reliability multiplier. Ordering only; never displayed. */
  rankingScore: number;
}

// ---------------------------------------------------------------------------
// mode: score_my_application
// ---------------------------------------------------------------------------

/**
 * Scores the caller's OWN application to one outreach and persists
 * `applications.match_score`.
 *
 * This exists because match_score is service-role write-only, so a volunteer
 * cannot set it themselves under RLS, and `score_applicants` is deliberately
 * organisation-only. Without this, a new application would sit unscored until
 * the organisation happened to open its applicant list -- which is exactly
 * when a fair, best-match-first ordering matters most.
 *
 * The volunteer can only ever reach their own row: the application is looked
 * up by (outreachId, caller.userId), never by a client-supplied application
 * id, so there is nothing to tamper with. The score is computed here from the
 * database's own copy of both profiles, never from anything the client sent.
 */
async function scoreMyApplication(caller: AuthedCaller, outreachId: string) {
  if (caller.role !== "volunteer") {
    throw Errors.forbidden("Only a volunteer can score their own application.");
  }

  const admin = getSupabaseAdmin();

  const { data: outreach, error: outreachError } = await admin
    .from("outreaches")
    .select("*")
    .eq("id", outreachId)
    .maybeSingle();
  if (outreachError) throw Errors.internal("Could not load the outreach.");
  if (!outreach) throw Errors.notFound("Outreach not found.");

  const { data: application, error: applicationError } = await admin
    .from("applications")
    .select(APPLICANT_SELECT)
    .eq("outreach_id", outreachId)
    .eq("volunteer_id", caller.userId)
    .maybeSingle();
  if (applicationError) throw Errors.internal("Could not load your application.");
  if (!application) throw Errors.notFound("You have not applied to this outreach.");

  const applicant = application as unknown as ApplicantRow;
  const daysByOutreach = await fetchDaysByOutreach(admin, [outreachId]);
  const outreachInput = toOutreachInput(outreach, daysByOutreach.get(outreachId));
  const volunteerInput = toVolunteerInput(applicant.volunteer);

  // Scored against the role the volunteer actually applied for, when they
  // chose one — not against the best role on the event, which they are not
  // competing for.
  const rolesByOutreach = await fetchRolesByOutreach(admin, [outreachId]);
  const roles = rolesForApplication(
    rolesByOutreach.get(outreachId) ?? [],
    applicant.outreach_role_id
  );

  // Layer 1 first, always -- the score that stands if Layer 2 is unavailable.
  let result = computeMultiRoleMatchScore(volunteerInput, outreachInput, roles);
  let layer2Applied = false;

  try {
    const layer2 = await computeLayer2Equivalences(admin, [
      {
        key: applicant.id,
        requiredSkills:
          roles.find((role) => role.id === result.bestRoleId)?.required_skills ??
          outreachInput.required_skills ??
          [],
        volunteerSkills: applicant.volunteer?.skill_tags ?? [],
      },
    ]);
    layer2Applied = layer2.applied;
    const equivalences = layer2.byKey.get(applicant.id);
    if (equivalences) {
      result = computeMultiRoleMatchScore(volunteerInput, outreachInput, roles, {
        skillEquivalences: equivalences,
      });
    }
  } catch (err) {
    console.error("[match] Layer 2 failed, falling back to Layer 1:", err instanceof Error ? err.message : err);
  }

  const { error: updateError } = await admin
    .from("applications")
    .update({ match_score: result.total })
    .eq("id", applicant.id);
  if (updateError) throw Errors.internal("Could not save your match score.");

  return {
    applicationId: applicant.id,
    outreachId,
    matchScore: result.total,
    breakdown: result,
    layer2Applied,
  };
}

// ---------------------------------------------------------------------------
// mode: rank_feed
// ---------------------------------------------------------------------------

/**
 * Mirrors hooks/useOutreaches.ts's OUTREACH_WITH_ORGANISATION_SELECT so the
 * ranked rows drop straight into the feed's existing card component.
 * `organisation_profiles` holds no PII and is readable by every authenticated
 * user under RLS, so embedding it here exposes nothing the app could not
 * already read for itself.
 */
const FEED_OUTREACH_SELECT = `
  *,
  organisation:organisation_profiles ( id, org_name, org_type, verified )
`;

interface RankedOutreach {
  outreachId: string;
  matchScore: number;
  breakdown: Layer1MatchResult;
  outreach: Record<string, unknown>;
}

/**
 * Drops outreaches with no remaining slots.
 *
 * Done here rather than in the query because PostgREST cannot express a
 * column-to-column comparison (`slots_filled < slots_total`) -- it filters
 * columns against literals only. It still runs BEFORE any scoring, so the
 * scoring cost is over relevant N either way; only the transferred row count
 * is unaffected. Moving it into the database would mean a generated
 * `has_open_slots` column, which is a schema change and not worth one for a
 * predicate this cheap.
 */
function withOpenSlots(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.filter((row) => {
    const filled = Number(row.slots_filled ?? 0);
    const total = Number(row.slots_total ?? 0);
    if (!Number.isFinite(filled) || !Number.isFinite(total)) return true;
    return filled < total;
  });
}

/**
 * One page of open, non-full outreaches, optionally restricted to `regions`.
 *
 * `body.region` is the volunteer's OWN explicit filter and always wins: if
 * they asked for one region, they get that region and no widening.
 */
async function fetchFeedCandidates(
  admin: ReturnType<typeof getSupabaseAdmin>,
  body: z.infer<typeof RankFeedBody>,
  regions: readonly string[] | null
) {
  // The date bound is load-bearing here in a way it is not on the client.
  // Candidates are ordered by date ASCENDING and then LIMITED, so without it
  // every past outreach sorted to the TOP and consumed the candidate budget
  // before a single upcoming event was considered — a feed could be filled
  // entirely with events that had already happened. `status = 'open'` did not
  // exclude them because nothing closed an outreach when its date passed.
  //
  // `gte`, not `gt` — an event happening TODAY is still happening. Ghana is
  // UTC+0 year-round, so the server's UTC date matches the event's local date.
  const today = new Date().toISOString().slice(0, 10);

  let query = admin
    .from("outreaches")
    .select(FEED_OUTREACH_SELECT)
    .eq("status", "open")
    .gte("date", today);
  if (body.region) query = query.eq("region", body.region);
  else if (regions && regions.length > 0) query = query.in("region", regions as string[]);
  if (body.roleType) query = query.eq("role_type", body.roleType);

  // Soonest first, which is now genuinely soonest rather than longest-ago.
  const { data, error } = await query
    .order("date", { ascending: true })
    .limit(body.limit ?? FEED_DEFAULT_LIMIT);
  if (error) throw Errors.internal("Could not load open outreaches.");

  return withOpenSlots((data ?? []) as Record<string, unknown>[]);
}

/**
 * Ranks every open outreach for the signed-in volunteer.
 *
 * Reads only: unlike score_applicants this writes nothing back, because a
 * feed ranking is transient (it changes whenever the volunteer edits their
 * skills) whereas `applications.match_score` is a record of the score AT
 * APPLY TIME. The two must not be conflated.
 *
 * Cost control -- the reason this can be a live Gemini-backed ranking rather
 * than a nightly batch:
 *   1. One request ranks the WHOLE feed, so scrolling costs nothing: the
 *      client holds the ranked list and never pages back to this endpoint.
 *   2. Every (skill, skill) verdict Gemini returns is written to
 *      `skill_match_cache`, which is shared across all volunteers and all
 *      outreaches. The vocabulary in constants/skills.ts is small and closed,
 *      so the cache saturates quickly and steady-state refetches make ZERO
 *      Gemini calls.
 *   3. Only skills that don't literally match are ever sent (see
 *      computeLayer2Equivalences), and the whole feed is batched into a
 *      single call rather than one per outreach.
 */
async function rankFeed(caller: AuthedCaller, body: z.infer<typeof RankFeedBody>) {
  if (caller.role !== "volunteer") {
    throw Errors.forbidden("Only a volunteer can rank their own feed.");
  }

  const admin = getSupabaseAdmin();

  const { data: volunteerRow, error: volunteerError } = await admin
    .from("volunteer_profiles")
    .select(
      `
      id, category, skill_tags, experience_level, availability_slots,
      profile:profiles ( region, district )
    `
    )
    .eq("id", caller.userId)
    .maybeSingle();

  if (volunteerError) throw Errors.internal("Could not load your volunteer profile.");
  if (!volunteerRow) throw Errors.notFound("Volunteer profile not found. Finish onboarding first.");

  const volunteer = toVolunteerInput(volunteerRow as unknown as ApplicantRow["volunteer"]);

  // Pre-filter, THEN score. Scoring is O(N x S) and sorting O(N log N) over
  // RELEVANT N -- open, still-recruiting, and in a region the volunteer could
  // actually travel to -- not over every outreach on the platform. At 10,000
  // outreaches, scoring the ~200 relevant ones is a ~50x saving, and it is
  // also what keeps the Gemini call in computeLayer2Equivalences small.
  //
  // Only the genuinely impossible is excluded. Deliberately NOT pre-filtered:
  //   - category: a related category still scores 0.5, and support roles match
  //     everyone, so an exact-category filter would drop valid matches.
  //   - skills: a partial overlap is a legitimate match.
  //   - availability: an event spanning slots, or a storage quirk, could hide
  //     a valid outreach. Let it score 0 instead of vanishing.
  // Anything that could plausibly score above zero still gets scored. The
  // pre-filter changes what is CHEAP to rank, never what is DISCOVERABLE.
  const reachableRegions = getReachableRegions(volunteer.region);
  let outreaches = await fetchFeedCandidates(admin, body, reachableRegions);

  // Widen to the whole platform when the neighbourhood is thin. Without this,
  // a strict filter and a quiet region combine into an empty feed -- the one
  // outcome this optimisation must never cause. An unrecognised or missing
  // region yields no reachable set at all, and lands here too.
  if (
    shouldWidenFeedSearch({
      hasExplicitRegionFilter: Boolean(body.region),
      reachableRegionCount: reachableRegions.length,
      candidateCount: outreaches.length,
    })
  ) {
    outreaches = await fetchFeedCandidates(admin, body, null);
  }

  if (outreaches.length === 0) {
    return { volunteerId: caller.userId, layer2Applied: true, results: [] as RankedOutreach[] };
  }

  const candidateIds = outreaches.map((outreach) => outreach.id as string);

  // Days for every candidate, in ONE batched query, for the same reason the
  // roles below are batched: the feed scores every open outreach in a region,
  // so a query per row would turn one request into dozens.
  const daysByOutreach = await fetchDaysByOutreach(admin, candidateIds);

  const inputs = new Map<string, Layer1OutreachInput>();
  for (const outreach of outreaches) {
    const id = outreach.id as string;
    inputs.set(id, toOutreachInput(outreach, daysByOutreach.get(id)));
  }

  // Roles for every candidate, in ONE batched query, so the ranked feed stays
  // a fixed number of round trips regardless of how many are multi-role.
  const rolesByOutreach = await fetchRolesByOutreach(admin, candidateIds);

  // Layer 1 first, always -- the ranking that survives any Layer 2 failure.
  const layer1Results = new Map<string, Layer1MatchResult & { bestRoleId: string | null }>();
  for (const outreach of outreaches) {
    const id = outreach.id as string;
    layer1Results.set(
      id,
      computeMultiRoleMatchScore(volunteer, inputs.get(id)!, rolesByOutreach.get(id) ?? [])
    );
  }

  let layer2: Layer2Outcome = { byKey: new Map(), applied: false };
  try {
    layer2 = await computeLayer2Equivalences(
      admin,
      outreaches.map((outreach) => {
        const id = outreach.id as string;
        const bestRoleId = layer1Results.get(id)?.bestRoleId;
        return {
          key: id,
          // The winning role's own skills where it states them, so Gemini
          // compares against what the volunteer would actually be doing.
          requiredSkills:
            (rolesByOutreach.get(id) ?? []).find((role) => role.id === bestRoleId)?.required_skills ??
            inputs.get(id)?.required_skills ??
            [],
          volunteerSkills: volunteer.skill_tags ?? [],
        };
      })
    );
  } catch (err) {
    console.error("[match] Layer 2 failed, falling back to Layer 1:", err instanceof Error ? err.message : err);
    layer2 = { byKey: new Map(), applied: false };
  }

  const results: RankedOutreach[] = outreaches.map((outreach) => {
    const id = outreach.id as string;
    const equivalences = layer2.byKey.get(id);
    const final = equivalences
      ? computeMultiRoleMatchScore(volunteer, inputs.get(id)!, rolesByOutreach.get(id) ?? [], {
          skillEquivalences: equivalences,
        })
      : layer1Results.get(id)!;

    return {
      outreachId: id,
      matchScore: final.total,
      breakdown: final,
      bestRoleId: "bestRoleId" in final ? final.bestRoleId : null,
      outreach,
    };
  });

  // No reliability multiplier here, deliberately. In this direction the
  // volunteer is ranking OUTREACHES, so the multiplier would be their own
  // single V-Score applied identically to every row -- a positive constant,
  // which leaves the order untouched. It belongs in scoreApplicants, where it
  // varies BETWEEN the things being compared. Applying it here would only risk
  // a deflated number leaking into the feed's displayed match percentage.
  //
  // Best match first; ties broken by the soonest event, so an equally-good
  // pair of outreaches surfaces the one the volunteer must decide about first.
  results.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    const dateA = (a.outreach.date as string | null) ?? "";
    const dateB = (b.outreach.date as string | null) ?? "";
    return dateA.localeCompare(dateB);
  });

  return { volunteerId: caller.userId, layer2Applied: layer2.applied, results };
}

// ---------------------------------------------------------------------------
// Layer 2 (shared by score_applicants and rank_feed)
// ---------------------------------------------------------------------------

/** One thing to be scored: a set of required skills vs a set of volunteer skills. */
interface Layer2Subject {
  /** Opaque identifier the caller uses to get its equivalence map back (an applicationId, or an outreachId). */
  key: string;
  requiredSkills: readonly string[];
  volunteerSkills: readonly string[];
}

interface Layer2Outcome {
  /** key -> (required skill -> volunteer skills Gemini judged equivalent). Ready for `computeLayer1MatchScore`'s `skillEquivalences`. */
  byKey: Map<string, Map<string, Set<string>>>;
  /**
   * True when the Layer 2 step completed -- either the cache answered
   * everything (including "there was nothing to ask") or Gemini responded.
   * False means Gemini was needed and unavailable, so the caller's scores are
   * pure Layer 1. Surfaced in the response purely for observability; it never
   * changes whether a result is returned.
   */
  applied: boolean;
}

/**
 * For each subject, finds required skills the volunteer doesn't literally
 * have and volunteer skills that aren't literally required, checks
 * `skill_match_cache` for each (required, volunteer) pair first, asks Gemini
 * ONLY for the pairs still missing (one batched call for ALL subjects, not
 * one per subject, to conserve the ~1,500/day free-tier quota), writes new
 * results back to the cache, and returns a per-subject equivalence map.
 *
 * If Gemini is unavailable, uncached pairs are simply left out of the map
 * (equivalent to "no semantic match found") rather than blocking -- CLAUDE.md's
 * "matching must never halt" rule.
 */
async function computeLayer2Equivalences(
  admin: ReturnType<typeof getSupabaseAdmin>,
  subjects: readonly Layer2Subject[]
): Promise<Layer2Outcome> {
  const byKey = new Map<string, Map<string, Set<string>>>();

  interface PendingPair extends OrderedSkillPair {
    key: string;
    required: string;
    volunteer: string;
  }
  const pending: PendingPair[] = [];

  for (const subject of subjects) {
    const requiredSkills = [...new Set(subject.requiredSkills.map(normalizeSkill).filter(Boolean))];
    if (requiredSkills.length === 0) continue;
    const requiredSet = new Set(requiredSkills);

    const volunteerTags = [...new Set(subject.volunteerSkills.map(normalizeSkill).filter(Boolean))];
    const volunteerSet = new Set(volunteerTags);

    const unmatchedRequired = requiredSkills.filter((r) => !volunteerSet.has(r));
    const unmatchedVolunteer = volunteerTags.filter((v) => !requiredSet.has(v));
    if (unmatchedRequired.length === 0 || unmatchedVolunteer.length === 0) continue;

    for (const required of unmatchedRequired) {
      for (const volunteer of unmatchedVolunteer) {
        pending.push({ ...orderPair(required, volunteer), key: subject.key, required, volunteer });
      }
    }
  }

  // Nothing semantically ambiguous anywhere -- Layer 1 was already exact.
  if (pending.length === 0) return { byKey, applied: true };

  const distinctPairs = dedupePairs(pending);
  const cacheMap = await lookupSkillCache(admin, distinctPairs);

  let applied = true;
  const uncached = distinctPairs.filter((p) => !cacheMap.has(`${p.skillA}::${p.skillB}`));
  if (uncached.length > 0) {
    const geminiPairs: SkillPair[] = uncached.map((p) => ({ skillA: p.skillA, skillB: p.skillB }));
    const geminiResults = await checkSkillEquivalences(geminiPairs);
    if (geminiResults) {
      for (const r of geminiResults) cacheMap.set(`${r.skillA}::${r.skillB}`, r.isMatch);
      await upsertSkillCacheResults(
        admin,
        geminiResults.map((r) => ({ skillA: r.skillA, skillB: r.skillB, isMatch: r.isMatch }))
      );
    } else {
      // Layer 2 unavailable (no key, quota, timeout, bad shape). Those pairs
      // stay absent from cacheMap, i.e. "no equivalence found" below.
      applied = false;
    }
  }

  for (const pair of pending) {
    const isMatch = cacheMap.get(`${pair.skillA}::${pair.skillB}`);
    if (!isMatch) continue;
    const perSubject = byKey.get(pair.key) ?? new Map<string, Set<string>>();
    const set = perSubject.get(pair.required) ?? new Set<string>();
    set.add(pair.volunteer);
    perSubject.set(pair.required, set);
    byKey.set(pair.key, perSubject);
  }

  return { byKey, applied };
}

// ---------------------------------------------------------------------------
// mode: notify_candidates
// ---------------------------------------------------------------------------

interface CandidateRow {
  id: string;
  category: Layer1VolunteerInput["category"];
  skill_tags: string[] | null;
  experience_level: Layer1VolunteerInput["experience_level"];
  availability_slots: string[] | null;
  profile: {
    region: string | null;
    district: string | null;
    push_tokens: { expo_push_token: string }[] | null;
  } | null;
}

async function notifyCandidates(outreach: Record<string, unknown>) {
  if (outreach.status !== "open") {
    throw Errors.badRequest("Only a published (open) outreach can notify candidates.");
  }

  const admin = getSupabaseAdmin();
  const outreachId = outreach.id as string;

  const { data: existingApplications } = await admin
    .from("applications")
    .select("volunteer_id")
    .eq("outreach_id", outreachId);
  const alreadyApplied = new Set((existingApplications ?? []).map((a) => a.volunteer_id as string));

  // Candidate pool: verified volunteers in the outreach's region who haven't
  // already applied. Bounded to `region` (rather than every volunteer
  // nationwide) to keep this scan cheap; a null outreach region matches no
  // one here (nothing to bound the pool by) rather than notifying everyone.
  let candidateQuery = admin
    .from("volunteer_profiles")
    .select(
      `
      id, category, skill_tags, experience_level, availability_slots,
      profile:profiles!inner ( region, district, push_tokens ( expo_push_token ) )
    `
    )
      // A closed account is never a candidate. Its profile row survives so the
      // event history of everyone it worked with survives with it, but the
      // person is gone -- matching them, or pushing them a new outreach, would
      // be the app addressing somebody who asked to be removed.
    .is("profile.closed_at", null);

  // UNVERIFIED VOLUNTEERS ARE NOTIFIED ABOUT SUPPORT-ROLE OUTREACHES, because
  // they may Quick Join those -- the same condition the under-subscription
  // ladder applies. This filter used to be unconditional, so publishing a
  // support-role event told none of the students and first aiders it exists
  // for, and the first they heard of it was the shortfall escalation a week
  // later. Two pools answering one question differently is the bug.
  if (outreach.role_type !== "support") {
    candidateQuery = candidateQuery.eq("verification_status", "verified");
  }

  if (outreach.region) {
    candidateQuery = candidateQuery.eq("profile.region", outreach.region as string);
  } else {
    return { outreachId, notified: [] as string[] };
  }

  const { data, error } = await candidateQuery;
  if (error) throw Errors.internal("Could not load candidate volunteers.");

  const candidates = (data ?? []) as unknown as CandidateRow[];
  const daysByOutreach = await fetchDaysByOutreach(admin, [outreachId]);
  const outreachInput = toOutreachInput(outreach, daysByOutreach.get(outreachId));
  // ROLES TOO. Skipping Layer 2 here is a quota decision and a sound one, but
  // it never extended to the multi-role scorer: that is pure code with no I/O
  // and no quota cost, and this is one extra batched query for one outreach.
  // Without it a multi-role outreach carries `required_category = null` (the
  // roles hold the categories instead), so the 20-point category component was
  // a guaranteed zero for every candidate and nothing could score above 80
  // against a threshold of 75 -- an exactly-matching nurse one district away
  // scored 70 and was never told the event existed.
  const rolesByOutreach = await fetchRolesByOutreach(admin, [outreachId]);
  const roles = rolesByOutreach.get(outreachId) ?? [];
  const threshold = env.notifyMatchThreshold;

  const pending: UserNotification[] = [];
  const notifiedVolunteerIds: string[] = [];

  for (const candidate of candidates) {
    if (alreadyApplied.has(candidate.id)) continue;
    // Nested under `profile`, not a sibling embed: push_tokens.user_id points
    // at profiles(id), and volunteer_profiles does too, so the two are
    // siblings rather than directly related -- PostgREST cannot hop straight
    // from volunteer_profiles to push_tokens. See supabase/schema.sql.
    //
    // No longer skipped when empty: a tokenless volunteer still gets the
    // in-app notification row, which is the durable record. `notified` in the
    // response therefore now means "recorded for", not "pushed to".
    const tokens = candidate.profile?.push_tokens ?? [];

    const volunteerInput: Layer1VolunteerInput = {
      category: candidate.category,
      skill_tags: candidate.skill_tags,
      experience_level: candidate.experience_level,
      availability_slots: candidate.availability_slots,
      region: candidate.profile?.region ?? null,
      district: candidate.profile?.district ?? null,
    };

    // Layer 1 only -- this is a broad scan over many candidates, not a
    // per-applicant decision, so Gemini is deliberately skipped here to
    // conserve the daily quota for the higher-value score_applicants path.
    // Multi-role aware, though: an empty `roles` delegates straight back to
    // the single-role scorer, so a single-role outreach scores identically.
    const { total } = computeMultiRoleMatchScore(volunteerInput, outreachInput, roles);
    if (total < threshold) continue;

    notifiedVolunteerIds.push(candidate.id);
    pending.push({
      userId: candidate.id,
      type: "new_match",
      title: "New high-match outreach",
      body: `${outreach.title as string} - ${Math.round(total)}% match for your profile.`,
      outreachId,
      data: { outreachId, matchScore: Math.round(total) },
      tokens: tokens.map((t) => t.expo_push_token),
    });
  }

  await notifyUsers(pending);
  return { outreachId, notified: notifiedVolunteerIds };
}
