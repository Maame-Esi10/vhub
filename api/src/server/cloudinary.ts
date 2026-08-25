import { createHash } from "node:crypto";
import { env } from "./env";

/**
 * Cloudinary signed-upload support.
 *
 * The app never holds CLOUDINARY_API_SECRET (Hard Rule 4). Instead it asks
 * this API to sign one specific upload, then posts the file straight to
 * Cloudinary with that signature. The file itself never passes through this
 * server, which matters on Vercel's free tier where request bodies are capped
 * and every byte is billable execution time.
 *
 * What a signature authorises is deliberately narrow: one folder, one public
 * id, one timestamp. Cloudinary rejects a signature whose timestamp is far
 * from its clock, so a leaked one cannot be replayed indefinitely, and it
 * cannot be pointed at a different folder without invalidating the hash.
 */

export type UploadKind = "avatar" | "flyer" | "credential" | "gallery";

/**
 * Cloudinary's storage/delivery type, which is a different axis from
 * resourceType and is what actually decides whether an asset is public.
 *
 *  - `upload`        — public delivery. Anyone with the URL can fetch it.
 *  - `authenticated` — cannot be fetched without a signature, whatever the URL.
 *
 * Credentials are `authenticated`. Avatars, flyers and gallery images are
 * `upload` BY DESIGN: they are shown to other users on screens with no session
 * of ours behind the image request, and signing every one of them would cost a
 * round trip per image for content that is meant to be seen.
 */
export type DeliveryType = "upload" | "authenticated";

export interface UploadTarget {
  /** Cloudinary folder. Namespaced per user so one account cannot overwrite another's asset. */
  folder: string;
  /** `image` for photos, `raw` for credential PDFs. */
  resourceType: "image" | "raw";
  /** Whether the stored asset is publicly fetchable. */
  deliveryType: DeliveryType;
}

export function uploadTargetFor(kind: UploadKind, userId: string): UploadTarget {
  switch (kind) {
    case "avatar":
      return { folder: `vhub/avatars/${userId}`, resourceType: "image", deliveryType: "upload" };
    case "flyer":
      return { folder: `vhub/flyers/${userId}`, resourceType: "image", deliveryType: "upload" };
    case "gallery":
      // Same treatment as a flyer -- a public image the organisation wants
      // seen -- in its own folder so the banner and the gallery stay
      // separable. Deliberately NOT the credential path: those are `raw`,
      // private evidence and must never share a route with promotional images.
      return { folder: `vhub/gallery/${userId}`, resourceType: "image", deliveryType: "upload" };
    case "credential":
      // `raw` because a credential is commonly a PDF rather than a photo.
      // Cloudinary will not apply image transformations to raw assets, which
      // is correct here -- a resized or re-encoded credential is evidence
      // that has been altered.
      //
      // `authenticated` is the whole point of package B. Before it, a
      // credential was an ordinary public asset and the permanent delivery URL
      // sat in the database: anyone holding the string could fetch somebody's
      // identity document, with no session and nothing to revoke. An
      // authenticated asset cannot be fetched without a signature, so the only
      // way in is /api/document-url, which authorises the requester first.
      return {
        folder: `vhub/credentials/${userId}`,
        resourceType: "raw",
        deliveryType: "authenticated",
      };
  }
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  resourceType: "image" | "raw";
  /**
   * Sent by the client as the `type` upload parameter when it is
   * "authenticated". It is part of the SIGNED set, so the client cannot
   * downgrade a credential to public delivery by dropping it — the hash would
   * no longer match and Cloudinary answers 401.
   */
  deliveryType: DeliveryType;
}

/**
 * Cloudinary's scheme: take every parameter that will be sent EXCEPT file,
 * api_key, resource_type and cloud_name; sort by key; join as `k=v` with `&`;
 * append the secret; SHA-1 the result.
 *
 * The parameter set here must stay exactly in step with what the client
 * actually posts -- an extra or missing field changes the hash and Cloudinary
 * answers 401. That coupling is why the client is handed `folder` back rather
 * than choosing its own.
 */
export function signUpload(kind: UploadKind, userId: string): UploadSignature {
  const { folder, resourceType, deliveryType } = uploadTargetFor(kind, userId);
  const timestamp = Math.floor(Date.now() / 1000);

  const signedParams: Record<string, string> = {
    folder,
    timestamp: String(timestamp),
  };

  // `upload` is Cloudinary's default, so it is omitted rather than sent as a
  // no-op — and omitting it keeps the signed set for avatars, flyers and
  // gallery images byte-for-byte what it was before package B, so none of
  // those three uploads can break on this change.
  if (deliveryType !== "upload") {
    signedParams.type = deliveryType;
  }

  const toSign = Object.keys(signedParams)
    .sort()
    .map((key) => `${key}=${signedParams[key]}`)
    .join("&");

  const signature = createHash("sha1")
    .update(toSign + env.cloudinaryApiSecret)
    .digest("hex");

  return {
    cloudName: env.cloudinaryCloudName,
    apiKey: env.cloudinaryApiKey,
    timestamp,
    signature,
    folder,
    resourceType,
    deliveryType,
  };
}

/**
 * Deletes an asset from Cloudinary. Returns false if it could not be removed.
 *
 * BEST-EFFORT ON PURPOSE. When a volunteer removes their credential document,
 * the thing that must succeed is clearing the database columns — that is what
 * decides what the app shows and what a reviewer can reach. If Cloudinary is
 * down, the delete still goes through and this returns false, leaving an
 * orphaned file rather than a row pointing at a document the volunteer
 * believes they removed. The alternative — refusing the delete — would leave
 * BOTH the row and the file in place, which is strictly worse for the person
 * asking to withdraw their own document.
 */
export async function destroyAsset(
  publicId: string,
  resourceType: "image" | "raw",
  deliveryType: DeliveryType = "upload"
): Promise<boolean> {
  const authorization =
    "Basic " + Buffer.from(`${env.cloudinaryApiKey}:${env.cloudinaryApiSecret}`).toString("base64");

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${env.cloudinaryCloudName}/resources/${resourceType}/${deliveryType}?public_ids[]=${encodeURIComponent(publicId)}`,
      { method: "DELETE", headers: { Authorization: authorization } }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function assetExists(
  publicId: string,
  resourceType: "image" | "raw",
  deliveryType: DeliveryType = "upload"
): Promise<boolean> {
  // Cloudinary's Admin API authenticates with HTTP Basic (key:secret), not
  // the upload signature scheme above -- no timestamp or hash is involved.
  const authorization =
    "Basic " + Buffer.from(`${env.cloudinaryApiKey}:${env.cloudinaryApiSecret}`).toString("base64");

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${env.cloudinaryCloudName}/resources/${resourceType}/${deliveryType}/${encodeURIComponent(publicId)}`,
      { method: "GET", headers: { Authorization: authorization } }
    );
    return res.ok;
  } catch {
    // A Cloudinary outage must not silently pass an unverifiable document.
    // Reported as "cannot confirm"; the caller refuses rather than accepts.
    return false;
  }
}


/**
 * A short-lived, signed URL for ONE private asset.
 *
 * This is the only way an `authenticated` credential can be read, and it is
 * what makes package B work: nothing durable ever names a fetchable address, so
 * there is no string to leak, forward or screenshot that still works tomorrow.
 *
 * It uses Cloudinary's private-download endpoint rather than a signed DELIVERY
 * url, and the difference is the whole point. A signed delivery url
 * (`/s--abc123--/`) authenticates but never expires — leak it once and it works
 * forever, which is the problem we are here to fix. This form carries
 * `expires_at` INSIDE the signed parameter set, so Cloudinary itself refuses it
 * afterwards. Nothing on our side has to remember to revoke anything.
 *
 * The signature is computed locally from the API secret; no call is made to
 * Cloudinary to mint it, so this costs nothing and cannot fail.
 *
 * Cloudinary's scheme, same as an upload signature: every parameter except
 * api_key/cloud_name/resource_type, sorted by key, joined `k=v` with `&`, the
 * secret appended, SHA-1 hex. For a `raw` asset the extension is part of the
 * public_id and `format` is therefore omitted — sending both would name the
 * extension twice and Cloudinary would answer 404 for an asset that exists.
 */
export interface SignedDocumentUrl {
  url: string;
  /** ISO timestamp. The client shows nothing of this; it decides when to refetch. */
  expiresAt: string;
}

export function signedDownloadUrl(
  publicId: string,
  resourceType: "image" | "raw",
  ttlSeconds = 15 * 60
): SignedDocumentUrl {
  const timestamp = Math.floor(Date.now() / 1000);
  const expiresAt = timestamp + ttlSeconds;

  const signedParams: Record<string, string> = {
    expires_at: String(expiresAt),
    public_id: publicId,
    timestamp: String(timestamp),
    type: "authenticated",
  };

  const toSign = Object.keys(signedParams)
    .sort()
    .map((key) => `${key}=${signedParams[key]}`)
    .join("&");

  const signature = createHash("sha1")
    .update(toSign + env.cloudinaryApiSecret)
    .digest("hex");

  const query = new URLSearchParams({
    ...signedParams,
    api_key: env.cloudinaryApiKey,
    signature,
  });

  return {
    url: `https://api.cloudinary.com/v1_1/${env.cloudinaryCloudName}/${resourceType}/download?${query.toString()}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}
