import { z } from "zod";
import { computeEventOutcome, getVScoreBand } from "@/lib/vscore";
import { recordLateReleasePenalty } from "../../../server/scorePenalties";
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
//   action "late_release": records the approved late per-day release deduction
//   as a `score_events` row. Auth: the owning organisation, or the volunteer
//   for their own application. Every number behind the amount is read from the
//   database here; none of it is taken from the request.
//
// THE "penalty" ACTION WAS REMOVED when penalties were wired live (2026-08-31),
// and its removal is a correctness fix rather than tidying. A cancellation is
// only penalised when the volunteer held an ACCEPTED place -- withdrawing a
// pending or waitlisted application costs nobody anything -- and that fact is
// gone the moment `status` reads 'cancelled', because the row does not record
// what it was before. An endpoint called after the fact could therefore not
// tell a fair penalty from an unfair one. The cancellation and its deduction
// are now ONE server operation, in /api/application-status, where the previous
// status is still in hand.
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
 * The late per-day release deduction, approved 2026-08-21.
 *
 * The caller names WHICH DAY was dropped and nothing else. `daysReleased` and
 * `daysCommitted` used to be request fields, which was a hole: they are the
 * numerator and denominator of the deduction, so a client that could send them
 * could choose its own penalty. Both are now counted server-side, along with
 * the rolling 90-day allowance, from rows the client cannot write.
 */
const LateReleaseAction = z.object({
  action: z.literal("late_release"),
  outreachId: z.string().uuid(),
  volunteerId: z.string().uuid(),
  applicationId: z.string().uuid(),
  /** Which day was dropped. It is what makes the deduction deduplicable. */
  outreachDayId: z.string().uuid(),
});

const VScoreRequestBody = z.discriminatedUnion("action", [ReviewAction, LateReleaseAction]);

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
    return Response.json(await handleLateRelease(caller, body));
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
// action: late_release
//
// Writes a `score_events` row and then replays. The row is the penalty's home
// in the replayable history; before it existed, a deduction was arithmetic on
// the stored score and the next replay erased it silently.
//
// `dedupe_key` is what makes a retry safe. A dropped connection, a double tap,
// a nightly sweep catching up on a call that failed -- any of them would
// otherwise charge somebody twice for one act.
// ---------------------------------------------------------------------------

async function handleLateRelease(
  caller: { userId: string; role: string },
  body: z.infer<typeof LateReleaseAction>
) {
  const admin = getSupabaseAdmin();

  const { data: application, error } = await admin
    .from("applications")
    .select("id, outreach_id, volunteer_id, status")
    .eq("id", body.applicationId)
    .maybeSingle();
  if (error || !application) throw Errors.notFound("Application not found.");
  if (
    application.outreach_id !== body.outreachId ||
    application.volunteer_id !== body.volunteerId
  ) {
    throw Errors.badRequest("applicationId does not match the given outreachId/volunteerId.");
  }

  const isOwningOrg = await isOrgOwner(caller, application.outreach_id as string);
  const isOwnVolunteer = caller.role === "volunteer" && caller.userId === body.volunteerId;
  if (!isOwningOrg && !isOwnVolunteer) {
    throw Errors.forbidden("You are not allowed to record a late release for this application.");
  }

  /*
    ONLY AN ACCEPTED APPLICATION IS PENALISED, the same rule a cancellation
    follows and for the same reason: a pending or waitlisted volunteer dropping
    a day has taken no place from anybody. Reported as a successful no-op rather
    than an error, because from the volunteer's side nothing went wrong.
  */
  if (application.status !== "accepted") {
    return {
      volunteerId: body.volunteerId,
      penalty: 0,
      withinFreeAllowance: false,
      skipped: "the volunteer did not hold an accepted place",
    };
  }

  const { data: outreach } = await admin
    .from("outreaches")
    .select("title")
    .eq("id", body.outreachId)
    .maybeSingle();

  const result = await recordLateReleasePenalty(admin, {
    volunteerId: body.volunteerId,
    applicationId: body.applicationId,
    outreachId: body.outreachId,
    outreachDayId: body.outreachDayId,
    outreachTitle: (outreach?.title as string | null) ?? null,
  });

  /*
    A FREE RELEASE WRITES NOTHING, and still reports the current score. The fact
    of it lives on `application_days.late_release`; a zero-point row would put
    an entry in the volunteer's list that deducted nothing, which reads as a
    punishment they cannot find.
  */
  if (!result.outcome) {
    const replay = await replayAndStoreVScore(admin, body.volunteerId);
    return {
      volunteerId: body.volunteerId,
      oldScore: replay.previousScore,
      newScore: replay.score,
      band: getVScoreBand(replay.score),
      penalty: 0,
      activePenalties: replay.activePenalties,
      withinFreeAllowance: result.skipped === "within the free allowance",
      skipped: result.skipped,
    };
  }

  return {
    volunteerId: body.volunteerId,
    oldScore: result.outcome.previousScore,
    newScore: result.outcome.score,
    band: getVScoreBand(result.outcome.score),
    penalty: result.points,
    activePenalties: result.outcome.activePenalties,
    withinFreeAllowance: false,
    skipped: null,
  };
}

async function isOrgOwner(caller: { userId: string; role: string }, outreachId: string): Promise<boolean> {
  if (caller.role !== "organisation") return false;
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("outreaches").select("organisation_id").eq("id", outreachId).maybeSingle();
  return data?.organisation_id === caller.userId;
}
