import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit, enforceUserRateLimit } from "../../../server/rateLimit";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { signUpload } from "../../../server/cloudinary";

export const runtime = "nodejs";

/**
 * Issues a short-lived Cloudinary upload signature for the CALLER's own
 * folder. The file itself goes straight from the device to Cloudinary and
 * never passes through this server.
 *
 * The folder is derived server-side from the authenticated user id, never
 * taken from the request: a client-supplied folder would let any account
 * write into (and overwrite) another user's avatar or credential.
 */

const UploadSignatureBody = z.object({
  kind: z.enum(["avatar", "flyer", "credential", "gallery", "organisation_document"]),
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
    const { kind } = UploadSignatureBody.parse(json);

    const caller = await authenticate(req);
    // Tighter than the default: every signature authorises an upload against a
    // Cloudinary free tier that is also finite.
    enforceUserRateLimit(caller.userId, "upload_signature");

    // Only organisations publish outreaches, so only they may put images in
    // the flyer and gallery folders. Checked here rather than left to RLS
    // because Cloudinary has no view of who we are -- once a signature is
    // issued, the upload succeeds regardless of what the database would have
    // allowed.
    if (kind === "flyer" || kind === "gallery" || kind === "organisation_document") {
      const admin = getSupabaseAdmin();
      const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", caller.userId)
        .maybeSingle();
      if (profile?.role !== "organisation") {
        throw Errors.forbidden(
          kind === "organisation_document"
            ? "Only an organisation can upload verification documents."
            : "Only an organisation can upload outreach images."
        );
      }
    }

    return Response.json(signUpload(kind, caller.userId));
  } catch (err) {
    return errorResponse(err);
  }
}
