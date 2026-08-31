import { z } from "zod";
import {
  computeEventOutcome,
  getVScoreBand,
  lateReleasePenalty,
  V_SCORE_PENALTIES,
} from "@/lib/vscore";
import { replayAndStoreVScore } from "../../../server/vscoreReplay";
import { REVIEW_REMARKS } from "@/constants/review-remarks";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";

export const runtime = "nodejs";

/** The remark vocabulary, as a set, so validation is a lookup rather than a scan. */
const VALID_REMARK_SLUGS = new Set(REVIEW_REMARKS.map((remark) => remark.slug));

// ---------------------------------------------------------------------------
// Request contract. Three actions, one endpoint, and exactly ONE writer of the
// score behind all of them.
//
//   action "review": the reviewing organisation files or updates its
//   post-event review of a volunteer (attended, reliability_score,
//   clinical_score). Auth: the caller must be the organisation that owns the
//   outreach being reviewed (mirroring event_reviews_insert_org's RLS check).
//
//   action "penalty": records a CANCELLATION deduction (-8 late, -2 on time)
//   as a `score_events` row. Auth: the owning organisation, or the volunteer
//   for their own cancellation and only at the timing the database itself
//   stamped.
//
//   action "late_release": records the approved late per-day release deduction
//   as a `score_events` row. Auth: the owning organisation, or the volunteer
//   for their own application.
//
// `no_show` IS REFUSED, and that is not an oversight. A no-show already moves
// the score through the review path -- a review filed with attended:false
// floors that event's outcome to 0 -- and CLAUDE.md requires one writer per
// change so that a single no-show cannot be punished twice.
//
// EVERY ACTION ENDS THE SAME WAY: write the fact, then REPLAY the volunteer's
// whole history and store the result. Nothing here ever does arithmetic on the
// stored score. That is what makes a penalty survive the next review, and what
// makes an upheld dispute able to reach backwards.
// ---------------------------------------------------------------------------

const ReviewAction = z.object({
  action: z.literal("review"),
  outreachId: z.string().uuid(),
  volunteerId: z.string().uuid(),
  attended: z.boolean(),
  reliabilityScore: z.number().int().min(1).max(5).nullable().optional(),
  clinicalScore: z.number().int().min(1).max(5).nullable().optional(),
  /**
   * Slugs from constants/review-remarks.ts, validated against that vocabulary
   * rather than accepted as free text.
   *
   * The check is worth making server-side: `volunteer_review_summary`
   * aggregates these by frequency across every review a volunteer has ever
   * received, so one client posting an off-vocabulary string would put a chip
   * in that aggregate which no screen can render a label for. Rejecting it
   * here keeps the summary meaningful without a database constraint that would
   * need a migration every time the wording list changes.
   */
  remarkChips: z
    .array(z.string())
    .max(REVIEW_REMARKS.length)
    .optional()
    .refine(
      (chips) => !chips || chips.every((chip) => VALID_REMARK_SLUGS.has(chip)),
      { message: "remarkChips contains a slug that is not in the review vocabulary." }
    ),
  notes: z.string().max(2000).optional(),
});

/**
 * `no_show` is absent from this enum on purpose, so the refusal is a
 * validation error naming the two legal values rather than a branch buried in
 * the handler. See the contract note above.
 */
const PenaltyAction = z.object({
  action: z.literal("penalty"),
  outreachId: z.string().uuid(),
  volunteerId: z.string().uuid(),
  applicationId: z.string().uuid(),
  penaltyType: z.enum(["late_cancellation", "on_time_cancellation"]),
});

/**
 * The late per-day release deduction, approved 2026-08-21 and homeless until
 * `score_events` existed.
 *
 * The caller sends the FACTS of the release; the amount is computed here from
 * `lateReleasePenalty` and the volunteer's own rolling 90-day count, never sent
 * by the client. A client that could name the figure could choose it.
 */
const LateReleaseAction = z.object({
  action: z.literal("late_release"),
  outreachId: z.string().uuid(),
  volunteerId: z.string().uuid(),
  applicationId: z.string().uuid(),
  /** Which day was dropped. It is what makes the deduction deduplicable. */
  outreachDayId: z.string().uuid(),
  daysReleased: z.number().int().min(1),
  daysCommitted: z.number().int().min(1),
});

const VScoreRequestBody = z.discriminatedUnion("action", [
  ReviewAction,
  PenaltyAction,
  LateReleaseAction,
]);

export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await authenticate(req);
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = VScoreRequestBody.parse(json);

    if (body.action === "review") {
      return Response.json(await handleReview(caller, body));
    }
    if (body.action === "late_release") {
      return Response.json(await handleLateRelease(caller, body));
    }
    return Response.json(await handlePenalty(caller, body));
  } catch (err) {
    return errorResponse(err);
  }
}

async function assertOrgOwnsOutreach(callerId: string, outreachId: string) {
  const admin = getSupabaseAdmin();
  const { data: outreach, error } = await admin
    .from("outreaches")
    .select("id, organisation_id")
    .eq("id", outreachId)
    .maybeSingle();
  if (error) throw Errors.internal("Could not load the outreach.");
  if (!outreach) throw Errors.notFound("Outreach not found.");
  if (outreach.organisation_id !== callerId) {
    throw Errors.forbidden("You do not own this outreach.");
  }
}

// ---------------------------------------------------------------------------
// action: review
// ---------------------------------------------------------------------------

async function handleReview(
  caller: { userId: string; role: string },
  body: z.infer<typeof ReviewAction>
) {
  if (caller.role !== "organisation") {
    throw Errors.forbidden("Only the organisation running this outreach can file a review.");
  }
  await assertOrgOwnsOutreach(caller.userId, body.outreachId);

  const admin = getSupabaseAdmin();

  const { error: reviewError } = await admin.from("event_reviews").upsert(
    {
      outreach_id: body.outreachId,
      volunteer_id: body.volunteerId,
      reviewed_by: caller.userId,
      attended: body.attended,
      reliability_score: body.reliabilityScore ?? null,
      clinical_score: body.clinicalScore ?? null,
      // Always written, never left undefined: re-filing a review that had
      // chips with one that has none must CLEAR them, and an omitted key in an
      // upsert payload would silently keep the old array.
      remark_chips: body.remarkChips ?? [],
      notes: body.notes ?? null,
    },
    { onConflict: "outreach_id,volunteer_id" }
  );
  if (reviewError) throw Errors.internal("Could not save the event review.");

  /*
    THE SCORE IS DERIVED NOW, so this REPLAYS the whole history rather than
    blending this one review into the stored number.

    It reads as more work for the same answer, and for a first review it is
    exactly the same answer. It differs in the case that was quietly broken:
    `event_reviews` is upserted on (outreach_id, volunteer_id), so an
    organisation EDITING a review it had already filed used to blend a second
    time into a score the first version had already moved -- and increment
    events_attended again. A replay produces the score the edited history
    implies, and the counter to match.

    It is also what makes an upheld dispute able to reach backwards at all: a
    correction to a March event cannot be expressed as an adjustment to today's
    number, because the blend has compounded March through everything since.
  */
  const replay = await replayAndStoreVScore(admin, body.volunteerId, body.outreachId);

  /*
    The outcome we REPORT is computed after the replay, and with the same day
    figures the replay used, so the number handed back is the one that actually
    moved the score rather than an unscaled version of it. Reporting 100 for a
    perfect review of 1 day out of 4 would be the endpoint contradicting itself.

    Still null when the review carries no scorable signal (attended but
    unrated), reported honestly rather than as a substituted number so a caller
    can tell "scored 60" from "not scored" -- see the note on the removed
    DEFAULT_MISSING_SUBSCORE in lib/vscore.ts.
  */
  const eventOutcome = computeEventOutcome({
    attended: body.attended,
    reliability_score: body.reliabilityScore ?? null,
    clinical_score: body.clinicalScore ?? null,
    daysAttended: replay.dayCommitment?.attended ?? null,
    daysCommitted: replay.dayCommitment?.committed ?? null,
  });

  return {
    volunteerId: body.volunteerId,
    oldScore: replay.previousScore,
    newScore: replay.score,
    band: getVScoreBand(replay.score),
    eventOutcome,
  };
}

// ---------------------------------------------------------------------------
// action: penalty  and  action: late_release
//
// Both write a `score_events` row and then replay. The row is the penalty's
// home in the replayable history; before it existed, a deduction was arithmetic
// on the stored score and the next replay erased it silently, which is why the
// action was disabled between 2026-08-26 and 2026-08-27.
//
// `dedupe_key` is what makes a retry safe. A dropped connection, a double tap,
// a cron that runs twice — any of them would otherwise charge somebody twice
// for one act. `ignoreDuplicates` turns the second write into a no-op, and the
// replay that follows is idempotent, so a retry converges on the same score
// rather than a lower one.
// ---------------------------------------------------------------------------

/** Writes one penalty, then rebuilds the score from history. Retry-safe. */
async function recordPenalty(input: {
  volunteerId: string;
  kind: "late_cancellation" | "on_time_cancellation" | "late_release";
  points: number;
  reason: string;
  dedupeKey: string;
  outreachId: string;
  applicationId: string;
  outreachDayId?: string;
}) {
  const admin = getSupabaseAdmin();

  const { error } = await admin.from("score_events").upsert(
    {
      volunteer_id: input.volunteerId,
      kind: input.kind,
      points: input.points,
      reason: input.reason,
      dedupe_key: input.dedupeKey,
      outreach_id: input.outreachId,
      application_id: input.applicationId,
      outreach_day_id: input.outreachDayId ?? null,
    },
    { onConflict: "volunteer_id,dedupe_key", ignoreDuplicates: true }
  );
  if (error) throw Errors.internal("Could not record the penalty.");

  const replay = await replayAndStoreVScore(admin, input.volunteerId);

  return {
    volunteerId: input.volunteerId,
    oldScore: replay.previousScore,
    newScore: replay.score,
    band: getVScoreBand(replay.score),
    penalty: input.points,
    activePenalties: replay.activePenalties,
  };
}

async function loadApplicationForPenalty(
  body: { applicationId: string; outreachId: string; volunteerId: string }
) {
  const admin = getSupabaseAdmin();
  const { data: application, error } = await admin
    .from("applications")
    .select("id, outreach_id, volunteer_id, status, late_cancellation")
    .eq("id", body.applicationId)
    .maybeSingle();
  if (error || !application) throw Errors.notFound("Application not found.");
  if (
    application.outreach_id !== body.outreachId ||
    application.volunteer_id !== body.volunteerId
  ) {
    throw Errors.badRequest("applicationId does not match the given outreachId/volunteerId.");
  }
  return application;
}

async function handlePenalty(
  caller: { userId: string; role: string },
  body: z.infer<typeof PenaltyAction>
) {
  const application = await loadApplicationForPenalty(body);

  const isOwningOrg = await isOrgOwner(caller, application.outreach_id as string);
  const isOwnVolunteer = caller.role === "volunteer" && caller.userId === body.volunteerId;

  if (!isOwningOrg && !isOwnVolunteer) {
    throw Errors.forbidden("You are not allowed to apply a V-Score penalty for this application.");
  }

  if (isOwnVolunteer && !isOwningOrg) {
    // A volunteer may only confirm the penalty the database itself already
    // stamped for their own cancellation -- never a claim that contradicts
    // applications.late_cancellation.
    if (application.status !== "cancelled") {
      throw Errors.badRequest("This application has not been cancelled.");
    }
    const expected = application.late_cancellation ? "late_cancellation" : "on_time_cancellation";
    if (body.penaltyType !== expected) {
      throw Errors.badRequest("penaltyType does not match this application's recorded cancellation timing.");
    }
  }

  return recordPenalty({
    volunteerId: body.volunteerId,
    kind: body.penaltyType,
    points: V_SCORE_PENALTIES[body.penaltyType],
    reason:
      body.penaltyType === "late_cancellation"
        ? "Cancelled an accepted place inside the late-cancellation window."
        : "Cancelled an accepted place in good time.",
    // One cancellation per application, because an application is cancelled
    // once and stays cancelled. The kind is deliberately NOT in the key: if the
    // timing were somehow reported both ways, the second must be refused rather
    // than charged on top of the first.
    dedupeKey: `cancellation:${body.applicationId}`,
    outreachId: body.outreachId,
    applicationId: body.applicationId,
  });
}

async function handleLateRelease(
  caller: { userId: string; role: string },
  body: z.infer<typeof LateReleaseAction>
) {
  const admin = getSupabaseAdmin();
  const application = await loadApplicationForPenalty(body);

  const isOwningOrg = await isOrgOwner(caller, application.outreach_id as string);
  const isOwnVolunteer = caller.role === "volunteer" && caller.userId === body.volunteerId;
  if (!isOwningOrg && !isOwnVolunteer) {
    throw Errors.forbidden("You are not allowed to record a late release for this application.");
  }

  /*
    THE DAY MUST ACTUALLY BE RELEASED AND FLAGGED LATE, and we read that from
    the database rather than trusting the request. `application_days.late_release`
    is set by the release path and is absent from the client's grant list
    precisely so nobody can declare their own lateness; re-reading it here is
    what stops a crafted call inventing a penalty against somebody.
  */
  const { data: day, error: dayError } = await admin
    .from("application_days")
    .select("id, released_at, late_release")
    .eq("application_id", body.applicationId)
    .eq("outreach_day_id", body.outreachDayId)
    .maybeSingle();
  if (dayError) throw Errors.internal("Could not load the committed day.");
  if (!day || day.released_at === null || day.late_release !== true) {
    throw Errors.badRequest("That day is not recorded as a late release.");
  }

  /*
    The allowance is counted BEFORE this release is charged, which is what
    "two free" means -- the third one pays. count_recent_late_releases counts
    released rows including this one, so the prior count is one less.
  */
  const { data: recent, error: countError } = await admin.rpc("count_recent_late_releases", {
    p_volunteer_id: body.volunteerId,
  });
  if (countError) throw Errors.internal("Could not count recent late releases.");
  const priorLateReleases = Math.max(0, Number(recent ?? 0) - 1);

  const points = lateReleasePenalty({
    priorLateReleases,
    daysReleased: body.daysReleased,
    daysCommitted: body.daysCommitted,
  });

  /*
    A FREE RELEASE WRITES NOTHING. score_events holds exactly the rows that move
    a score (`points < 0` is a check constraint), and the fact of the release is
    already recorded on application_days. Writing a zero row would put an entry
    in the volunteer's penalty list that deducted nothing, which reads as a
    punishment they cannot find.
  */
  if (points === 0) {
    const replay = await replayAndStoreVScore(admin, body.volunteerId);
    return {
      volunteerId: body.volunteerId,
      oldScore: replay.previousScore,
      newScore: replay.score,
      band: getVScoreBand(replay.score),
      penalty: 0,
      activePenalties: replay.activePenalties,
      withinFreeAllowance: true,
    };
  }

  return {
    ...(await recordPenalty({
      volunteerId: body.volunteerId,
      kind: "late_release",
      points,
      reason: `Dropped ${body.daysReleased} of ${body.daysCommitted} committed day(s) inside 24 hours of the day starting.`,
      // Keyed on the released day AND the moment it was released: a day can be
      // taken back on and dropped late again, and that second drop is a
      // genuinely new act rather than a repeat of the first.
      dedupeKey: `late_release:${day.id}:${day.released_at as string}`,
      outreachId: body.outreachId,
      applicationId: body.applicationId,
      outreachDayId: body.outreachDayId,
    })),
    withinFreeAllowance: false,
  };
}

async function isOrgOwner(caller: { userId: string; role: string }, outreachId: string): Promise<boolean> {
  if (caller.role !== "organisation") return false;
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("outreaches").select("organisation_id").eq("id", outreachId).maybeSingle();
  return data?.organisation_id === caller.userId;
}
