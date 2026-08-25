import { z } from "zod";
import { authenticate, type AuthedCaller } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { signedDownloadUrl, uploadTargetFor } from "../../../server/cloudinary";

export const runtime = "nodejs";

/**
 * The ONLY way to read a private document.
 *
 * Credentials are stored as Cloudinary `authenticated` assets and the database
 * holds their public_id — a name, not an address. Nothing durable anywhere
 * names a fetchable URL, so there is no string to leak. To see a document you
 * ask here, this route decides whether you may, and it mints a link that stops
 * working in fifteen minutes.
 *
 * WHO MAY SEE A CREDENTIAL (the access rules, enforced HERE and not in the UI):
 *
 *  - The volunteer themselves. Always. It is their document.
 *  - An admin. This is the credential review, and it is the reason the admin
 *    role exists.
 *  - An organisation, ONLY if that volunteer has applied to one of that
 *    organisation's outreaches. This is Gate 2 — the organisation's own
 *    clinical judgement on someone it is actually considering. An organisation
 *    that has never met this volunteer has no business reading their licence.
 *  - Nobody else, by any path.
 *
 * A refusal is deliberately a flat 403 with the same wording whatever the
 * reason. Distinguishing "no such document" from "not yours to see" would
 * confirm to a stranger that a particular person has uploaded a credential.
 */

const DocumentUrlBody = z.object({
  kind: z.literal("credential"),
  /** Whose document. Omit for your own. */
  ownerId: z.string().uuid().optional(),
});

/** Is this organisation allowed to look at this volunteer's credential? */
async function organisationMayView(caller: AuthedCaller, volunteerId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();

  // "Has this volunteer applied to anything of mine" — the applications table
  // joined to the organisation's own outreaches. Deliberately ANY application,
  // in any status: a rejected or withdrawn applicant was still someone this
  // organisation was asked to make a decision about, and the decision may need
  // revisiting. Deliberately NOT "any organisation with any open outreach",
  // which would be every organisation on the platform.
  const { data, error } = await admin
    .from("applications")
    .select("id, outreaches!inner(organisation_id)")
    .eq("volunteer_id", volunteerId)
    .eq("outreaches.organisation_id", caller.userId)
    .limit(1);

  if (error) throw Errors.internal("Could not check your access to this document.");
  return (data ?? []).length > 0;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = DocumentUrlBody.parse(json);

    const caller = await authenticate(req);
    const ownerId = body.ownerId ?? caller.userId;

    const isOwner = ownerId === caller.userId;
    const allowed =
      isOwner ||
      caller.role === "admin" ||
      (caller.role === "organisation" && (await organisationMayView(caller, ownerId)));

    if (!allowed) {
      throw Errors.forbidden("You are not allowed to view this document.");
    }

    const admin = getSupabaseAdmin();
    const { data: volunteer, error } = await admin
      .from("volunteer_profiles")
      .select("credential_document_id")
      .eq("id", ownerId)
      .maybeSingle();

    if (error) throw Errors.internal("Could not load the document.");

    const publicId = volunteer?.credential_document_id as string | null | undefined;
    if (!publicId) {
      // Same wording to an authorised viewer and to a stranger, for the reason
      // in the header comment.
      throw Errors.notFound("There is no document to view.");
    }

    const { resourceType } = uploadTargetFor("credential", ownerId);
    const signed = signedDownloadUrl(publicId, resourceType);

    return Response.json({
      ...signed,
      /**
       * Whether the document is a photo rather than a PDF, so the screen knows
       * if it can render it inline. Derived from the public_id's extension —
       * for a `raw` asset the extension is part of the id — rather than stored,
       * because a second column recording the same fact could disagree with it.
       */
      isImage: /\.(png|jpe?g|webp|heic|heif)$/i.test(publicId),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
