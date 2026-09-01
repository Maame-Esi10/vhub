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
 * An admin's decision on one dispute.
 *
 * WHAT UPHOLDING DOES. It records that the volunteer was right, tells both
 * parties in the same words, and RECOMPUTES their V-Score from full history
 * (owner-approved 2026-08-26) — the disputed event stops counting, and every
 * event after it is replayed on top of that.
 *
 * WHAT IT STILL DOES NOT DO: flip the attendance row or rewrite the review.
 * That was considered and rejected for the same reason those rows are
 * service-role-only in the first place — they are the evidence a score is
 * derived from, and an admin overwriting one would destroy the record of what
 * actually happened in favour of a conclusion about it. The dispute sits
 * BESIDE the record; the replay reads both and lets the dispute win.
 *
 * The recompute is a REPLAY, not an adjustment, and it has to be: a correction
 * to a March event cannot be expressed as a number added to today's score,
 * because the blend has compounded March through every event since.
 *
 * THE SCORE MOVES ONLY WHEN A DISPUTE IS UPHELD. A rejected dispute changes
 * nothing, which is right — nothing about the history was found to be wrong.
 */

const Body = z.object({
  disputeId: z.string().uuid(),
  decision: z.enum(["uphold", "reject"]),
  /** Sent verbatim to BOTH parties, so write it to be read by them. */
  resolution: z.string().trim().min(3).max(1000),
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
    const { data: dispute } = await admin
      .from("disputes")
      .select("id, volunteer_id, outreach_id, type, status")
      .eq("id", body.disputeId)
      .maybeSingle();

    if (!dispute) throw Errors.notFound("Dispute not found.");
    if (dispute.status !== "open") {
      throw Errors.conflict("This dispute has already been decided.");
    }

    const nextStatus = body.decision === "uphold" ? "upheld" : "rejected";

    const { error } = await admin
      .from("disputes")
      .update({
        status: nextStatus,
        resolution: body.resolution,
        resolved_by: caller.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", body.disputeId)
      // Re-asserted, so two admins working the same queue cannot both decide
      // it: the second update matches nothing and the conflict above is what
      // the second admin sees on refresh.
      .eq("status", "open");

    if (error) throw Errors.internal("Could not record the decision.");

    /*
      THE RECOMPUTE, and only on an uphold. It runs BEFORE the audit row so the
      audit can state what actually happened to the score rather than what was
      expected to; if the replay were to fail, the decision is already written
      and the failure surfaces to the admin rather than being buried.
    */
    let scoreMove: { from: number; to: number } | null = null;
    if (body.decision === "uphold") {
      const replay = await replayAndStoreVScore(admin, dispute.volunteer_id as string);
      scoreMove = { from: replay.previousScore, to: replay.score };
    }

    await recordAdminAction(caller, {
      targetType: "dispute",
      targetId: body.disputeId,
      action: body.decision === "uphold" ? "upheld dispute" : "rejected dispute",
      reason: body.resolution,
      payload: {
        disputeType: dispute.type,
        outreachId: dispute.outreach_id,
        volunteerId: dispute.volunteer_id,
        // Recorded explicitly, both ways round, so a later reader of the audit
        // trail never has to wonder whether a score moved — and, if it did, can
        // see the two numbers without recomputing anything.
        vScoreRecalculated: body.decision === "uphold",
        vScoreFrom: scoreMove?.from ?? null,
        vScoreTo: scoreMove?.to ?? null,
      },
    });

    // BOTH PARTIES, in the same words. A dispute decided in private is a
    // decision the loser learns about by noticing something changed — and the
    // organisation needs to know as much as the volunteer does, because an
    // upheld attendance dispute says their record was wrong.
    const { data: outreach } = await admin
      .from("outreaches")
      .select("id, title, organisation_id")
      .eq("id", dispute.outreach_id)
      .maybeSingle();

    const recipients = [dispute.volunteer_id as string];
    if (outreach?.organisation_id) recipients.push(outreach.organisation_id as string);

    const { data: tokens } = await admin
      .from("push_tokens")
      .select("user_id, expo_push_token")
      .in("user_id", recipients);

    const tokensByUser = new Map<string, string[]>();
    for (const row of tokens ?? []) {
      const list = tokensByUser.get(row.user_id as string) ?? [];
      list.push(row.expo_push_token as string);
      tokensByUser.set(row.user_id as string, list);
    }

    const subject = dispute.type === "attendance" ? "attendance record" : "review";
    const title = body.decision === "uphold" ? "A dispute was upheld" : "A dispute was not upheld";

    await notifyUsers(
      recipients.map((userId) => ({
        userId,
        type: "application_status" as const,
        title,
        body:
          `${outreach?.title ?? "An outreach"}: the ${subject} dispute was ` +
          `${body.decision === "uphold" ? "upheld" : "not upheld"}. ${body.resolution}` +
          // The score change is the redress, so it is said out loud rather than
          // left for the volunteer to spot on their profile later.
          (scoreMove && Math.abs(scoreMove.to - scoreMove.from) >= 0.01
            ? ` V-Score updated from ${Math.round(scoreMove.from)} to ${Math.round(scoreMove.to)}.`
            : ""),
        outreachId: dispute.outreach_id as string,
        data: { kind: "dispute", disputeId: body.disputeId, decision: nextStatus },
        tokens: tokensByUser.get(userId) ?? [],
      }))
    );

    return Response.json({
      status: nextStatus,
      vScoreFrom: scoreMove?.from ?? null,
      vScoreTo: scoreMove?.to ?? null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
