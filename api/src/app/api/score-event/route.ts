import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit } from "../../../server/rateLimit";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { assertAdmin, recordAdminAction } from "../../../server/adminAudit";
import { notifyUsers } from "../../../server/notify";
import { replayAndStoreVScore } from "../../../server/vscoreReplay";

export const runtime = "nodejs";

/**
 * An admin reversing one V-Score deduction.
 *
 * WHY THIS EXISTS. `score_events` was written by /api/vscore and read by the
 * replay, and shown to nobody. A deduction could be caused and then neither
 * inspected nor undone — the only irreversible thing left in a score model
 * whose whole point is that it is derived and therefore correctable. An upheld
 * dispute could reach back and void a REVIEW; nothing could reach a PENALTY.
 *
 * VOIDING IS AN UPDATE, NEVER A DELETE. The row stays, because a penalty is the
 * evidence behind a number somebody was shown. A voided row simply stops
 * counting in the replay — exactly the treatment an upheld dispute gives a
 * review — and the volunteer keeps seeing it, marked as reversed, so their
 * score's history stays readable rather than quietly re-written.
 *
 * IT IS ONE-WAY. There is no un-void. Re-applying a deduction that an admin
 * decided was wrong would need its own justification and its own audit row, and
 * the honest way to express that is a NEW penalty rather than resurrecting a
 * reversed one. The dedupe key would refuse a duplicate anyway, which is right.
 *
 * THE VOLUNTEER IS TOLD. A deduction reversed in silence is indistinguishable
 * from a score that drifted, and the person it was taken from is the one with
 * the most reason to know it was given back.
 */

const Body = z.object({
  scoreEventId: z.string().uuid(),
  /**
   * Shown to the volunteer verbatim, so write it to be read by them. Required
   * for the same reason a dispute's resolution and a moderation's reason are:
   * a reversal with no explanation is a number changing for reasons the person
   * it happened to cannot find out.
   */
  reason: z.string().trim().min(3).max(1000),
});

export async function POST(req: Request): Promise<Response> {
  try {
    // First, ahead of validation and of authentication, so a flood is refused
    // before this project spends anything on it. Counted once per request
    // however many times it is called -- see server/rateLimit.ts.
    enforceIpRateLimit(req);
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = Body.parse(json);

    const caller = await authenticate(req);
    assertAdmin(caller);

    const admin = getSupabaseAdmin();

    const { data: penalty } = await admin
      .from("score_events")
      .select("id, volunteer_id, kind, points, reason, voided_at, outreach_id")
      .eq("id", body.scoreEventId)
      .maybeSingle();

    if (!penalty) throw Errors.notFound("That deduction does not exist.");
    if (penalty.voided_at !== null) {
      throw Errors.conflict("That deduction has already been reversed.");
    }

    const { error } = await admin
      .from("score_events")
      .update({
        voided_at: new Date().toISOString(),
        voided_reason: body.reason,
      })
      .eq("id", body.scoreEventId)
      // Re-asserted rather than trusted from the read above: two admins working
      // the same list must not both reverse it, and the second update matching
      // nothing is how the second admin sees the conflict on refresh.
      .is("voided_at", null);

    if (error) throw Errors.internal("Could not reverse the deduction.");

    /*
      REPLAY, never an adjustment. Adding the points back onto the stored score
      would be wrong twice over: the clamp to [0, 100] may already have
      swallowed some of the deduction, and every review filed since has blended
      the penalty forward at 0.7x apiece. Only replaying the history without it
      produces the score the corrected history implies.

      It runs BEFORE the audit row so the audit can state what actually
      happened to the score rather than what was expected to.
    */
    const replay = await replayAndStoreVScore(admin, penalty.volunteer_id as string);

    await recordAdminAction(caller, {
      targetType: "score_event",
      targetId: body.scoreEventId,
      action: "reversed V-Score deduction",
      reason: body.reason,
      payload: {
        volunteerId: penalty.volunteer_id,
        kind: penalty.kind,
        points: penalty.points,
        originalReason: penalty.reason,
        outreachId: penalty.outreach_id,
        // Both numbers, so a later reader never has to recompute anything to
        // see what the reversal was worth.
        vScoreFrom: replay.previousScore,
        vScoreTo: replay.score,
      },
    });

    const { data: tokens } = await admin
      .from("push_tokens")
      .select("expo_push_token")
      .eq("user_id", penalty.volunteer_id);

    await notifyUsers([
      {
        userId: penalty.volunteer_id as string,
        // Reuses the existing `application_status` type rather than adding a
        // new one, exactly as the dispute decision does. The type is a
        // `notifications` column with a CHECK on it, and a new value would be a
        // migration for a message the volunteer reads as ordinary news about
        // their standing.
        type: "application_status" as const,
        tokens: (tokens ?? []).map((row) => row.expo_push_token as string),
        title: "A deduction was reversed",
        // The amount and the new score are both named. "Your score was
        // adjusted" tells somebody something changed without telling them what,
        // which is the thing this whole feature exists to stop.
        body:
          `${Math.abs(Number(penalty.points))} points were put back on your ` +
          `V-Score, now ${Math.round(replay.score)}. ${body.reason}`,
        outreachId: (penalty.outreach_id as string | null) ?? null,
        data: { kind: "score_event_voided", scoreEventId: body.scoreEventId },
      },
    ]);

    return Response.json({
      scoreEventId: body.scoreEventId,
      volunteerId: penalty.volunteer_id,
      pointsReturned: Math.abs(Number(penalty.points)),
      oldScore: replay.previousScore,
      newScore: replay.score,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
