import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { assertAdmin, recordAdminAction } from "../../../server/adminAudit";
import { notifyUsers } from "../../../server/notify";

export const runtime = "nodejs";

/**
 * Gate 1: an admin's decision on a volunteer's credential document.
 *
 * GATE 1 IS A BASIC CHECK, PLATFORM-WIDE — is the document real, legible,
 * unexpired, and does it plausibly match the claimed category? It is
 * explicitly NOT a judgement about clinical competence, and this endpoint is
 * deliberately incapable of expressing one: there is no score, no note about
 * skill, nothing but approved or not and why.
 *
 * Gate 2 is the organisation's own clinical judgement, per application. It
 * reads the same document through /api/document-url and changes no platform
 * status at all, which is why it has no endpoint of its own.
 *
 * REJECTION SETS `unverified`, NOT A NEW STATUS. A volunteer whose document was
 * declined is unverified — that is the state they are in and the thing they can
 * act on. What they need is the reason, which travels with it.
 *
 * THE DOCUMENT IS KEPT ON A REJECTION, deliberately. Destroying it would leave
 * the volunteer unable to see what they had sent, and would erase the evidence
 * behind a decision that has just been recorded in the audit trail. They can
 * replace or withdraw it themselves, which they could always do.
 */

const Body = z.object({
  volunteerId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  /** Required either way — see the organisation-verification route for why. */
  reason: z.string().trim().min(3).max(1000),
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
    const { data: volunteer } = await admin
      .from("volunteer_profiles")
      .select("id, verification_status, credential_document_id, category")
      .eq("id", body.volunteerId)
      .maybeSingle();

    if (!volunteer) throw Errors.notFound("Volunteer not found.");

    // Only a submission that is actually waiting can be decided. Without this,
    // two admins opening the same queue could each approve it, writing two
    // audit rows for one decision — and worse, an already-verified volunteer
    // could be silently un-verified by a stale screen.
    if (volunteer.verification_status !== "documents_pending") {
      throw Errors.conflict(
        volunteer.verification_status === "verified"
          ? "This volunteer is already verified."
          : "This volunteer has no document waiting for review. Their submission may have been withdrawn."
      );
    }

    const nextStatus = body.decision === "approve" ? "verified" : "unverified";

    const { error } = await admin
      .from("volunteer_profiles")
      .update({
        verification_status: nextStatus,
        verification_reason: body.reason,
        verification_decided_at: new Date().toISOString(),
      })
      .eq("id", body.volunteerId)
      // Re-asserted in the WHERE clause, not just checked above: between the
      // read and the write the volunteer could have withdrawn the document.
      // This makes the update a no-op in that case rather than a decision about
      // something that is no longer there.
      .eq("verification_status", "documents_pending");

    if (error) throw Errors.internal("Could not record the decision.");

    await recordAdminAction(caller, {
      targetType: "volunteer",
      targetId: body.volunteerId,
      action:
        body.decision === "approve"
          ? "approved credential (Gate 1)"
          : "rejected credential (Gate 1)",
      reason: body.reason,
      payload: {
        nextStatus,
        category: volunteer.category,
        documentId: volunteer.credential_document_id,
      },
    });

    const { data: tokens } = await admin
      .from("push_tokens")
      .select("expo_push_token")
      .eq("user_id", body.volunteerId);

    await notifyUsers([
      {
        userId: body.volunteerId,
        type: "application_status",
        title:
          body.decision === "approve" ? "Your identity is verified" : "Your document was not approved",
        body:
          body.decision === "approve"
            ? "You can now submit full applications to clinical outreaches."
            : `${body.reason} You can upload a different document from Settings.`,
        data: { kind: "credential_review", decision: body.decision },
        tokens: (tokens ?? []).map((t) => t.expo_push_token as string),
      },
    ]);

    return Response.json({ verificationStatus: nextStatus });
  } catch (err) {
    return errorResponse(err);
  }
}
