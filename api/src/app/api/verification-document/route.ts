import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { assetExists, destroyAsset, uploadTargetFor } from "../../../server/cloudinary";

export const runtime = "nodejs";

/**
 * The credential document behind identity verification: record, replace, remove.
 *
 * This endpoint is the ONLY writer of volunteer_profiles.credential_document_id
 * and verification_status, both of which are absent from that table's grant
 * lists. The two writes belong together: 'documents_pending' means "a document
 * is waiting for review", so it must not be reachable without one. If the id
 * column were client-writable this route would be decorative -- a volunteer
 * could set it to any string and claim the status.
 *
 * WHAT IS STORED IS A PUBLIC_ID, NEVER A URL (package B). The asset itself is
 * an `authenticated` one, unfetchable without a signature, and /api/document-url
 * mints a fifteen-minute link for a requester it has just authorised. A stored
 * URL was the leak: it named a fetchable address, permanently, in a column.
 *
 * It does NOT grant 'verified'. That remains a human decision made after
 * someone reads the document; nothing in the app can reach it.
 *
 * WHY REMOVAL DROPS THE STATUS BACK TO 'unverified': 'documents_pending' means
 * a reviewer has something to read. With the document withdrawn there is
 * nothing, so leaving the status would put the volunteer in a queue for a
 * review that can never happen -- they would wait indefinitely on a decision
 * nobody can make. Dropping to 'unverified' is the honest state and is exactly
 * where they were before uploading.
 *
 * A 'verified' volunteer cannot remove or replace their document. The document
 * is the evidence behind an approval a human already made; letting the subject
 * delete it afterwards would leave an approved status with nothing behind it,
 * and letting them swap it would let a reviewed document be quietly exchanged
 * for an unreviewed one while the badge stays lit.
 */

const RecordAction = z.object({
  action: z.literal("record").optional(),
  /**
   * Cloudinary public_id — checked for existence, then STORED. `secureUrl` used
   * to be sent alongside and is deliberately gone: the client no longer has a
   * durable address to hand us, because the asset it just uploaded cannot be
   * fetched without a signature this server issues.
   */
  publicId: z.string().min(1).max(300),
});

const DeleteAction = z.object({
  action: z.literal("delete"),
});

const VerificationDocumentBody = z.union([DeleteAction, RecordAction]);

export async function POST(req: Request): Promise<Response> {
  try {
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = VerificationDocumentBody.parse(json);

    const caller = await authenticate(req);
    const admin = getSupabaseAdmin();

    const { data: volunteer } = await admin
      .from("volunteer_profiles")
      .select("verification_status, declaration_signed, credential_document_id")
      .eq("id", caller.userId)
      .maybeSingle();

    if (!volunteer) {
      throw Errors.forbidden("Only a volunteer can manage a credential document.");
    }
    if (volunteer.verification_status === "verified") {
      throw Errors.badRequest(
        "Your identity is already verified, so this document cannot be changed or removed. Contact V-HUB if it needs to be updated."
      );
    }

    const existingId = volunteer.credential_document_id as string | null;
    const { folder, resourceType, deliveryType } = uploadTargetFor("credential", caller.userId);

    if (body.action === "delete") {
      if (!existingId) {
        throw Errors.badRequest("There is no document to remove.");
      }

      const { error } = await admin
        .from("volunteer_profiles")
        .update({
          credential_document_id: null,
          verification_status: "unverified",
        })
        .eq("id", caller.userId);
      if (error) throw Errors.internal("Could not remove your document.");

      // Best-effort, and deliberately AFTER the database write: the columns
      // are what the app and any reviewer actually read, so clearing them is
      // the part that must not fail. A Cloudinary outage leaves an orphaned
      // file rather than a row pointing at a document the volunteer believes
      // they withdrew.
      const storageCleared = await destroyAsset(existingId, resourceType, deliveryType);

      return Response.json({ verificationStatus: "unverified", storageCleared });
    }

    if (!volunteer.declaration_signed) {
      throw Errors.badRequest("Sign the accuracy declaration before submitting a document.");
    }

    // The public id must sit inside THIS caller's credential folder. Without
    // this check a volunteer could pass the public id of someone else's
    // already-uploaded document -- which does exist, so the existence check
    // below would pass -- and have it recorded as their own credential.
    if (!body.publicId.startsWith(`${folder}/`)) {
      throw Errors.forbidden("That document does not belong to your account.");
    }

    if (!(await assetExists(body.publicId, resourceType, deliveryType))) {
      throw Errors.badRequest(
        "That document could not be found in storage. Please try the upload again."
      );
    }

    const { error } = await admin
      .from("volunteer_profiles")
      .update({
        credential_document_id: body.publicId,
        verification_status: "documents_pending",
      })
      .eq("id", caller.userId);

    if (error) throw Errors.internal("Could not record your document.");

    // Replacing: clear the superseded file. Without this every re-upload left
    // the previous credential sitting in storage indefinitely -- unreferenced,
    // unreviewable, and still a copy of someone's identity document.
    // Best-effort for the same reason as delete, and guarded so a caller
    // re-recording the SAME url cannot destroy the file it just pointed at.
    if (existingId && existingId !== body.publicId) {
      await destroyAsset(existingId, resourceType, deliveryType);
    }

    return Response.json({ verificationStatus: "documents_pending" });
  } catch (err) {
    return errorResponse(err);
  }
}
