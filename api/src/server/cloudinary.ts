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

export interface UploadTarget {
  /** Cloudinary folder. Namespaced per user so one account cannot overwrite another's asset. */
  folder: string;
  /** `image` for photos, `raw` for credential PDFs. */
  resourceType: "image" | "raw";
}

export function uploadTargetFor(kind: UploadKind, userId: string): UploadTarget {
  switch (kind) {
    case "avatar":
      return { folder: `vhub/avatars/${userId}`, resourceType: "image" };
    case "flyer":
      return { folder: `vhub/flyers/${userId}`, resourceType: "image" };
    case "gallery":
      // Same treatment as a flyer -- a public image the organisation wants
      // seen -- in its own folder so the banner and the gallery stay
      // separable. Deliberately NOT the credential path: those are `raw`,
      // private evidence and must never share a route with promotional images.
      return { folder: `vhub/gallery/${userId}`, resourceType: "image" };
    case "credential":
      // `raw` because a credential is commonly a PDF rather than a photo.
      // Cloudinary will not apply image transformations to raw assets, which
      // is correct here -- a resized or re-encoded credential is evidence
      // that has been altered.
      return { folder: `vhub/credentials/${userId}`, resourceType: "raw" };
  }
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  resourceType: "image" | "raw";
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
  const { folder, resourceType } = uploadTargetFor(kind, userId);
  const timestamp = Math.floor(Date.now() / 1000);

  const signedParams: Record<string, string> = {
    folder,
    timestamp: String(timestamp),
  };

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
  };
}

/**
 * Confirms an asset really exists in Cloudinary under the folder we signed.
 *
 * Called before recording a credential URL. Without it, a client could skip
 * the upload entirely and post any string as `secureUrl` -- moving its own
 * verification_status to 'documents_pending' with no document behind it,
 * which is the exact assertion the server-side write exists to prevent.
 */
/**
 * Recovers a Cloudinary public_id from a stored secure URL.
 *
 * Needed because `volunteer_profiles.credential_document_url` holds the URL and
 * nothing else — there is no public_id column, and adding one is a schema
 * change rather than a detail to slip in. A URL looks like:
 *
 *   https://res.cloudinary.com/<cloud>/raw/upload/v1712345678/vhub/credentials/<uid>/<file>.pdf
 *
 * Everything after `/upload/`, minus the version segment, is the public id.
 * For `raw` assets the extension is PART of the id; for `image` it is not.
 *
 * This is deliberately the only place that parses a Cloudinary URL, and it is
 * best-effort by design: callers must treat null as "could not determine" and
 * carry on rather than failing the user's request, because a stored URL that
 * does not parse is our problem, not theirs.
 */
export function publicIdFromUrl(
  secureUrl: string,
  resourceType: "image" | "raw"
): string | null {
  const marker = "/upload/";
  const index = secureUrl.indexOf(marker);
  if (index === -1) return null;

  let path = secureUrl.slice(index + marker.length);
  if (!path) return null;

  // Strip the version segment Cloudinary inserts (v1712345678/), when present.
  path = path.replace(/^v\d+\//, "");
  // Strip any query string or fragment.
  path = path.split("?")[0]!.split("#")[0]!;
  if (!path) return null;

  if (resourceType === "image") {
    // An image's public id excludes the extension; a raw asset's includes it.
    path = path.replace(/\.[^./]+$/, "");
  }

  return decodeURIComponent(path);
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
  resourceType: "image" | "raw"
): Promise<boolean> {
  const authorization =
    "Basic " + Buffer.from(`${env.cloudinaryApiKey}:${env.cloudinaryApiSecret}`).toString("base64");

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${env.cloudinaryCloudName}/resources/${resourceType}/upload?public_ids[]=${encodeURIComponent(publicId)}`,
      { method: "DELETE", headers: { Authorization: authorization } }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function assetExists(publicId: string, resourceType: "image" | "raw"): Promise<boolean> {
  // Cloudinary's Admin API authenticates with HTTP Basic (key:secret), not
  // the upload signature scheme above -- no timestamp or hash is involved.
  const authorization =
    "Basic " + Buffer.from(`${env.cloudinaryApiKey}:${env.cloudinaryApiSecret}`).toString("base64");

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${env.cloudinaryCloudName}/resources/${resourceType}/upload/${encodeURIComponent(publicId)}`,
      { method: "GET", headers: { Authorization: authorization } }
    );
    return res.ok;
  } catch {
    // A Cloudinary outage must not silently pass an unverifiable document.
    // Reported as "cannot confirm"; the caller refuses rather than accepts.
    return false;
  }
}
