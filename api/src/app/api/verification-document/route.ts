import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { assetExists, uploadTargetFor } from "../../../server/cloudinary";

export const runtime = "nodejs";

/**
 * Records an uploaded credential document and moves the volunteer from
 * 'unverified' to 'documents_pending'.
 *
 * This endpoint is the ONLY writer of volunteer_profiles.credential_document_url
 * and verification_status, both of which are absent from that table's grant
 * lists. The two writes belong together: 'documents_pending' means "a document
 * is waiting for review", so it must not be reachable without one. If the URL
 * column were client-writable this route would be decorative -- a volunteer
 * could set it to any string and claim the status.
 *
 * It does NOT grant 'verified'. That remains a human decision made after
 * someone reads the document; nothing in the app can reach it.
 */

const VerificationDocumentBody = z.object({
  /** Cloudinary public_id, used to confirm the asset genuinely exists. */
  publicId: z.string().min(1).max(300),
  secureUrl: z.string().url().max(1000),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const { publicId, secureUrl } = VerificationDocumentBody.parse(json);

    const caller = await authenticate(req);
    const admin = getSupabaseAdmin();

    const { data: volunteer } = await admin
      .from("volunteer_profiles")
      .select("verification_status, declaration_signed")
      .eq("id", caller.userId)
      .maybeSingle();

    if (!volunteer) {
      throw Errors.forbidden("Only a volunteer can submit a credential document.");
    }
    if (volunteer.verification_status === "verified") {
      throw Errors.badRequest("Your identity is already verified.");
    }
    if (!volunteer.declaration_signed) {
      throw Errors.badRequest("Sign the accuracy declaration before submitting a document.");
    }

    // The public id must sit inside THIS caller's credential folder. Without
    // this check a volunteer could pass the public id of someone else's
    // already-uploaded document -- which does exist, so the existence check
    // below would pass -- and have it recorded as their own credential.
    const { folder, resourceType } = uploadTargetFor("credential", caller.userId);
    if (!publicId.startsWith(`${folder}/`)) {
      throw Errors.forbidden("That document does not belong to your account.");
    }

    if (!(await assetExists(publicId, resourceType))) {
      throw Errors.badRequest(
        "That document could not be found in storage. Please try the upload again."
      );
    }

    const { error } = await admin
      .from("volunteer_profiles")
      .update({
        credential_document_url: secureUrl,
        verification_status: "documents_pending",
      })
      .eq("id", caller.userId);

    if (error) throw Errors.internal("Could not record your document.");

    return Response.json({ verificationStatus: "documents_pending" });
  } catch (err) {
    return errorResponse(err);
  }
}
