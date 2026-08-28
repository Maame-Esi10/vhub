import { z } from "zod";
import { computeEventOutcome, getVScoreBand } from "@/lib/vscore";
import { replayAndStoreVScore } from "../../../server/vscoreReplay";
import { REVIEW_REMARKS } from "@/constants/review-remarks";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";

export const runtime = "nodejs";

/** The remark vocabulary, as a set, so validation is a lookup rather than a scan. */
const VALID_REMARK_SLUGS = new Set(REVIEW_REMARKS.map((remark) => remark.slug));

// ---------------------------------------------------------------------------
// Request contract. Two actions, and only one of them still writes.
//
//   action "review": the reviewing organisation files or updates its
//   post-event review of a volunteer (attended, reliability_score,
//   clinical_score). The review is upserted, and the volunteer's v_score and
//   events_attended are then REBUILT by replaying their whole review history
//   from 70 -- not by blending this one review into the stored number. Auth:
//   the caller must be the organisation that owns the outreach being reviewed
//   (mirroring event_reviews_insert_org's RLS check).
//
//   action "penalty": REFUSED with a 409 since the V-Score became a derived
//   value (owner-approved 2026-08-26). A flat penalty written by arithmetic on
//   the stored score is in no history, so the next replay erases it. The long
//   note above handlePenalty gives the full reasoning, including what is
//   genuinely lost (the two cancellation penalties) and what is not (the
//   no-show, which a review filed with attended:false already expresses).
//   Nothing in the app has ever called it.
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

const PenaltyAction = z.object({
  action: z.literal("penalty"),
  outreachId: z.string().uuid(),
  volunteerId: z.string().uuid(),
  applicationId: z.string().uuid(),
  penaltyType: z.enum(["no_show", "late_cancellation", "on_time_cancellation"]),
});

const VScoreRequestBody = z.discriminatedUnion("action", [ReviewAction, PenaltyAction]);

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

  // null when the review carries no scorable signal (attended but unrated).
  // Reported honestly rather than as a substituted number, so a caller can
  // tell "scored 60" from "not scored" -- see the note on the removed
  // DEFAULT_MISSING_SUBSCORE in lib/vscore.ts.
  const eventOutcome = computeEventOutcome({
    attended: body.attended,
    reliability_score: body.reliabilityScore ?? null,
    clinical_score: body.clinicalScore ?? null,
  });

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
  const replay = await replayAndStoreVScore(admin, body.volunteerId);

  return {
    volunteerId: body.volunteerId,
    oldScore: replay.previousScore,
    newScore: replay.score,
    band: getVScoreBand(replay.score),
    eventOutcome,
  };
}

// ---------------------------------------------------------------------------
// action: penalty -- REFUSED, and deliberately so.
//
// The three flat penalties (no-show -15, late cancellation -8, on-time
// cancellation -2) are still defined and still unit-tested in lib/vscore.ts.
// This ENDPOINT can no longer apply one, because as of the V-Score reversal
// (owner-approved 2026-08-26) it would be a SECOND writer of a value that is
// now derived, and the second writer always loses:
//
//   `volunteer_profiles.v_score` is a CACHE of replayVScore(event history).
//   A penalty written by arithmetic on the stored number is in no history, so
//   the very next review -- or the next upheld dispute, or a re-run of the
//   recompute migration -- replays from 70 and the penalty silently vanishes.
//   A deduction that disappears without anybody noticing is worse than one
//   that was never applied, because a screen showed it.
//
// It also restores the rule CLAUDE.md already states: one writer owns every
// score change, so a single no-show cannot be punished twice. The no-show
// deduction ALREADY has a home in the replayable history -- a review filed
// with attended:false floors that event's outcome at 0 -- so this action was
// a second route to the same punishment even before the score became derived.
//
// WHAT IS GENUINELY LOST: the two CANCELLATION penalties, which have no home
// in the history because a cancellation produces no `event_reviews` row.
// Giving them one needs a table of score events, which is a schema change and
// therefore gated. Nothing in the app has ever called this action, so nothing
// stops working today -- see docs/REPORT_NOTES.md.
//
// It returns a considered 409 rather than being deleted from the request
// contract: a caller that reaches it deserves to be told why, not handed a
// validation error about an unrecognised action.
// ---------------------------------------------------------------------------

async function handlePenalty(
  _caller: { userId: string; role: string },
  _body: z.infer<typeof PenaltyAction>
): Promise<never> {
  throw Errors.conflict(
    "V-Scores are derived from event history and can no longer be adjusted by a flat penalty. " +
      "A no-show is recorded by filing the event review with attended = false."
  );
}
