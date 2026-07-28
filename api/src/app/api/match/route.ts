import { z } from "zod";
import {
  computeLayer1MatchScore,
  type Layer1MatchResult,
  type Layer1OutreachInput,
  type Layer1VolunteerInput,
} from "@/lib/matching/layer1";
import { authenticate, assertOwnsOutreach } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { checkSkillEquivalences, type SkillPair } from "../../../server/gemini";
import {
  dedupePairs,
  lookupSkillCache,
  normalizeSkill,
  orderPair,
  upsertSkillCacheResults,
  type OrderedSkillPair,
} from "../../../server/skillCache";
import { dispatchExpoPush } from "../../../server/expoPush";
import { env } from "../../../server/env";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Request contract
//
// The generic CLAUDE.md sketch ("body: { volunteerProfile, outreaches[] }")
// describes a stateless volunteer-feed ranking call. This endpoint
// implements a DIFFERENT, deliberately chosen contract per this task's
// explicit brief ("Auth: caller must be the organisation that owns the
// outreach... you choose a sane contract and document it"):
//
//   mode "score_applicants" (primary): given an outreachId the caller's
//   organisation owns, (re)compute match_score for that outreach's
//   applications (all of them, or a supplied volunteerIds subset -- e.g.
//   right after a single new application comes in) and persist it to
//   `applications.match_score` with the service-role key, since that column
//   is service-role write-only. Returns the scored applicants sorted
//   descending, which is exactly the order hooks/useApplications.ts's
//   useOutreachApplications already expects (`.order('match_score', ...)`).
//
//   mode "notify_candidates" (extension, see docs/REPORT_NOTES.md /
//   the final report's "assumptions" section): a broad Layer-1-only scan
//   over verified volunteers who haven't yet applied, to push a "new
//   high-match outreach" notification -- this is /api/notifications'
//   "new high-match outreach" trigger, implemented here (not in
//   /api/notifications) because it needs the matching engine, and kept
//   Layer-1-only (no Gemini) since it is a broad, low-stakes scan rather
//   than a per-applicant decision.
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

const MatchRequestBody = z.discriminatedUnion("mode", [ScoreApplicantsBody, NotifyCandidatesBody]);

// ---------------------------------------------------------------------------
// Shared shapes fetched from Supabase
// ---------------------------------------------------------------------------

interface ApplicantRow {
  id: string;
  volunteer_id: string;
  status: string;
  volunteer: {
    id: string;
    category: Layer1VolunteerInput["category"];
    skill_tags: string[] | null;
    experience_level: Layer1VolunteerInput["experience_level"];
    availability_slots: string[] | null;
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

function toOutreachInput(outreach: Record<string, unknown>): Layer1OutreachInput {
  return {
    required_skills: (outreach.required_skills as string[] | null) ?? null,
    required_category: (outreach.required_category as string | null) ?? null,
    region: (outreach.region as string | null) ?? null,
    district: (outreach.district as string | null) ?? null,
    date: (outreach.date as string | null) ?? null,
    start_time: (outreach.start_time as string | null) ?? null,
    end_time: (outreach.end_time as string | null) ?? null,
  };
}

export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await authenticate(req);
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = MatchRequestBody.parse(json);

    const outreach = await assertOwnsOutreach(caller, body.outreachId);

    if (body.mode === "score_applicants") {
      return Response.json(await scoreApplicants(outreach, body.volunteerIds));
    }
    return Response.json(await notifyCandidates(outreach));
  } catch (err) {
    return errorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// mode: score_applicants
// ---------------------------------------------------------------------------

const APPLICANT_SELECT = `
  id, volunteer_id, status,
  volunteer:volunteer_profiles (
    id, category, skill_tags, experience_level, availability_slots,
    profile:profiles ( region, district )
  )
`;

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
    return { outreachId: outreach.id, results: [] as ScoredApplicant[] };
  }

  const outreachInput = toOutreachInput(outreach);

  // Layer 1 ALWAYS runs first, for every applicant -- this is the result
  // every applicant gets if Layer 2 is unavailable for any reason at all.
  const layer1Results = new Map<string, Layer1MatchResult>();
  for (const application of applications) {
    layer1Results.set(
      application.id,
      computeLayer1MatchScore(toVolunteerInput(application.volunteer), outreachInput)
    );
  }

  // Layer 2 is entirely best-effort: any failure anywhere in this block
  // leaves layer1Results (and therefore the final scores) untouched.
  let equivalencesByApplication = new Map<string, Map<string, Set<string>>>();
  try {
    equivalencesByApplication = await computeLayer2Equivalences(admin, outreachInput, applications);
  } catch (err) {
    console.error("[match] Layer 2 failed, falling back to Layer 1:", err instanceof Error ? err.message : err);
    equivalencesByApplication = new Map();
  }

  const results: ScoredApplicant[] = applications.map((application) => {
    const equivalences = equivalencesByApplication.get(application.id);
    const final = equivalences
      ? computeLayer1MatchScore(toVolunteerInput(application.volunteer), outreachInput, {
          skillEquivalences: equivalences,
        })
      : layer1Results.get(application.id)!;

    return {
      applicationId: application.id,
      volunteerId: application.volunteer_id,
      matchScore: final.total,
      breakdown: final,
    };
  });

  // Persist match_score -- service-role write-only column (see supabase/schema.sql).
  await Promise.all(
    results.map((r) => admin.from("applications").update({ match_score: r.matchScore }).eq("id", r.applicationId))
  );

  results.sort((a, b) => b.matchScore - a.matchScore);
  return { outreachId: outreach.id, results };
}

interface ScoredApplicant {
  applicationId: string;
  volunteerId: string;
  matchScore: number;
  breakdown: Layer1MatchResult;
}

/**
 * Layer 2: for every applicant, finds required skills the volunteer doesn't
 * literally have and volunteer skills that aren't literally required, checks
 * `skill_match_cache` for each (required, volunteer) pair first, asks Gemini
 * ONLY for the pairs still missing (one batched call for the whole
 * outreach, not one call per applicant, to conserve the ~1,500/day free-tier
 * quota), writes new results back to the cache, and returns a per-application
 * equivalence map ready for `computeLayer1MatchScore`'s `skillEquivalences`
 * option. If Gemini is unavailable, uncached pairs are simply left out of
 * the map (equivalent to "no semantic match found") rather than blocking.
 */
async function computeLayer2Equivalences(
  admin: ReturnType<typeof getSupabaseAdmin>,
  outreachInput: Layer1OutreachInput,
  applications: ApplicantRow[]
): Promise<Map<string, Map<string, Set<string>>>> {
  const result = new Map<string, Map<string, Set<string>>>();
  const requiredSkills = [...new Set((outreachInput.required_skills ?? []).map(normalizeSkill).filter(Boolean))];
  if (requiredSkills.length === 0) return result;
  const requiredSet = new Set(requiredSkills);

  interface PendingPair extends OrderedSkillPair {
    applicationId: string;
    required: string;
    volunteer: string;
  }
  const pending: PendingPair[] = [];

  for (const application of applications) {
    const volunteerTags = [
      ...new Set((application.volunteer?.skill_tags ?? []).map(normalizeSkill).filter(Boolean)),
    ];
    const volunteerSet = new Set(volunteerTags);
    const unmatchedRequired = requiredSkills.filter((r) => !volunteerSet.has(r));
    const unmatchedVolunteer = volunteerTags.filter((v) => !requiredSet.has(v));
    if (unmatchedRequired.length === 0 || unmatchedVolunteer.length === 0) continue;

    for (const required of unmatchedRequired) {
      for (const volunteer of unmatchedVolunteer) {
        const ordered = orderPair(required, volunteer);
        pending.push({ ...ordered, applicationId: application.id, required, volunteer });
      }
    }
  }

  if (pending.length === 0) return result;

  const distinctPairs = dedupePairs(pending);
  const cacheMap = await lookupSkillCache(admin, distinctPairs);

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
    }
    // geminiResults === null -> Layer 2 unavailable; those pairs simply stay
    // absent from cacheMap, i.e. "no equivalence found" below.
  }

  for (const pair of pending) {
    const isMatch = cacheMap.get(`${pair.skillA}::${pair.skillB}`);
    if (!isMatch) continue;
    const perApp = result.get(pair.applicationId) ?? new Map<string, Set<string>>();
    const set = perApp.get(pair.required) ?? new Set<string>();
    set.add(pair.volunteer);
    perApp.set(pair.required, set);
    result.set(pair.applicationId, perApp);
  }

  return result;
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
  profile: { region: string | null; district: string | null } | null;
  push_tokens: Array<{ expo_push_token: string }> | null;
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
      profile:profiles!inner ( region, district ),
      push_tokens ( expo_push_token )
    `
    )
    .eq("verification_status", "verified");

  if (outreach.region) {
    candidateQuery = candidateQuery.eq("profile.region", outreach.region as string);
  } else {
    return { outreachId, notified: [] as string[] };
  }

  const { data, error } = await candidateQuery;
  if (error) throw Errors.internal("Could not load candidate volunteers.");

  const candidates = (data ?? []) as unknown as CandidateRow[];
  const outreachInput = toOutreachInput(outreach);
  const threshold = env.notifyMatchThreshold;

  const messages: Array<{ to: string; title: string; body: string; data: Record<string, unknown> }> = [];
  const notifiedVolunteerIds: string[] = [];

  for (const candidate of candidates) {
    if (alreadyApplied.has(candidate.id)) continue;
    const tokens = candidate.push_tokens ?? [];
    if (tokens.length === 0) continue;

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
    const { total } = computeLayer1MatchScore(volunteerInput, outreachInput);
    if (total < threshold) continue;

    notifiedVolunteerIds.push(candidate.id);
    for (const token of tokens) {
      messages.push({
        to: token.expo_push_token,
        title: "New high-match outreach",
        body: `${outreach.title as string} - ${Math.round(total)}% match for your profile.`,
        data: { type: "new_match", outreachId },
      });
    }
  }

  await dispatchExpoPush(messages);
  return { outreachId, notified: notifiedVolunteerIds };
}
