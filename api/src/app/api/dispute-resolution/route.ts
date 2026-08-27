import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { assertAdmin, recordAdminAction } from "../../../server/adminAudit";
import { notifyUsers } from "../../../server/notify";

export const runtime = "nodejs";

/**
 * An admin's decision on one dispute.
 *
 * WHAT UPHOLDING DOES, AND DOES NOT DO. It records that the volunteer was
 * right, tells both parties in the same words, and leaves the record itself
 * alone. It does NOT recompute a V-Score, and it does not flip an attendance
 * row or rewrite a review.
 *
 * That is a deliberate limit, not an unfinished edge. Making the V-Score
 * derivable — replaying every event from 70 rather than keeping a running
 * total — is a change to something already built, working and tested, and it
 * is its own approval gate (docs/ADMIN_PHASE_PLAN.md). Nothing about the queue,
 * the evidence or the decision depends on how the score is stored, which is
 * exactly why disputes can ship against the current model and gain the
 * recalculation later without any of this changing.
 *
 * Editing the attendance row directly was considered and rejected for the same
 * reason it is service-role-only in the first place: that row is the evidence a
 * score is derived from, and an admin overwriting it would destroy the record
 * of what actually happened in favour of a conclusion about it. The dispute IS
 * the correction, and it sits beside the record rather than on top of it.
 */

const Body = z.object({
  disputeId: z.string().uuid(),
  decision: z.enum(["uphold", "reject"]),
  /** Sent verbatim to BOTH parties, so write it to be read by them. */
  resolution: z.string().trim().min(3).max(1000),
});

export async function POST(req: Request): Promise<Response> {
  try {
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

    await recordAdminAction(caller, {
      targetType: "dispute",
      targetId: body.disputeId,
      action: body.decision === "uphold" ? "upheld dispute" : "rejected dispute",
      reason: body.resolution,
      payload: {
        disputeType: dispute.type,
        outreachId: dispute.outreach_id,
        volunteerId: dispute.volunteer_id,
        // Recorded explicitly so a later reader of the audit trail is not left
        // wondering whether a score moved. It did not.
        vScoreRecalculated: false,
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
        body: `${outreach?.title ?? "An outreach"}: the ${subject} dispute was ${
          body.decision === "uphold" ? "upheld" : "not upheld"
        }. ${body.resolution}`,
        outreachId: dispute.outreach_id as string,
        data: { kind: "dispute", disputeId: body.disputeId, decision: nextStatus },
        tokens: tokensByUser.get(userId) ?? [],
      }))
    );

    return Response.json({ status: nextStatus });
  } catch (err) {
    return errorResponse(err);
  }
}
