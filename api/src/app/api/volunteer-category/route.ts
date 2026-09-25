import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit } from "../../../server/rateLimit";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { destroyAsset, uploadTargetFor } from "../../../server/cloudinary";

export const runtime = "nodejs";

/**
 * A volunteer changes their professional role (category).
 *
 * WHY THIS IS AN ENDPOINT AND NOT A COLUMN WRITE (owner, 2026-09-25: "Someone
 * who changes the role needs to be reverified... they upload a new document
 * to be approved").
 *
 * Verification means an admin read ONE document against ONE claimed role and
 * found they agree. Until now `category` was a plain client-writable column,
 * so a volunteer verified as a health student could switch to "Doctor" the
 * next day and keep the verified tick, and with it access to clinical Full
 * Applications for doctors. The tick then vouched for a claim nobody had
 * checked.
 *
 * So a role change and the loss of verification are ONE server operation:
 *   - the new role is written;
 *   - if the volunteer was verified, waiting on review, or holding a document,
 *     their status drops to `unverified` and the old document is cleared,
 *     because it was evidence for the old role and a reviewer must not approve
 *     the new role on it;
 *   - the old file is removed from storage afterwards, best-effort, exactly as
 *     /api/verification-document does when a document is withdrawn.
 *
 * Nothing else about the account changes: V-Score, history, applications
 * already made. Moving from student to doctor is progress, not misconduct, so
 * there is no penalty; the volunteer simply uploads the new qualification and
 * joins the review queue again.
 *
 * `verification_status` and `credential_document_id` are absent from the
 * client's grant lists, which is why this needs the service role.
 */

const Body = z.object({
  category: z.enum([
    "doctor",
    "nurse",
    "midwife",
    "pharmacist",
    "allied_health",
    "student",
    "first_aider",
    "other",
  ]),
});

export async function POST(req: Request): Promise<Response> {
  try {
    enforceIpRateLimit(req);
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = Body.parse(json);
    const caller = await authenticate(req);
    const admin = getSupabaseAdmin();

    const { data: volunteer } = await admin
      .from("volunteer_profiles")
      .select("category, verification_status, credential_document_id")
      .eq("id", caller.userId)
      .maybeSingle();

    if (!volunteer) {
      throw Errors.forbidden("Only a volunteer can change their professional role.");
    }

    if (volunteer.category === body.category) {
      return Response.json({
        category: body.category,
        verificationStatus: volunteer.verification_status,
        reverificationRequired: false,
      });
    }

    const existingDocument = volunteer.credential_document_id as string | null;
    const reverificationRequired =
      volunteer.verification_status !== "unverified" || !!existingDocument;

    const { error } = await admin
      .from("volunteer_profiles")
      .update({
        category: body.category,
        ...(reverificationRequired
          ? {
              verification_status: "unverified",
              credential_document_id: null,
              verification_submitted_at: null,
              verification_decided_at: null,
              // A previous rejection reason was about the old role's document.
              verification_reason: null,
            }
          : {}),
      })
      .eq("id", caller.userId);

    if (error) throw Errors.internal("Could not change your role.");

    let storageCleared = true;
    if (existingDocument) {
      const { resourceType, deliveryType } = uploadTargetFor("credential", caller.userId);
      storageCleared = await destroyAsset(existingDocument, resourceType, deliveryType);
    }

    return Response.json({
      category: body.category,
      verificationStatus: reverificationRequired ? "unverified" : volunteer.verification_status,
      reverificationRequired,
      storageCleared,
    });
  } catch (err) {
    return errorResponse(err, req);
  }
}
