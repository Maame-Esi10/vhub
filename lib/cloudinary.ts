import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { getUploadSignature, type UploadKind } from '@/lib/api-client';

/**
 * Cloudinary uploads from the device.
 *
 * NEVER import this from components/ui/index.ts or any other barrel. It pulls
 * in expo-image-picker and expo-document-picker, both NATIVE modules — a
 * barrel that every screen imports would throw at import time on a dev client
 * built before they were added, taking the whole app down instead of the one
 * screen that uses them. Same rule as DateTimeField; see the note in
 * components/ui/index.ts.
 *
 * The file goes straight from the device to Cloudinary. It never passes
 * through the serverless API, which only signs the request — Vercel's free
 * tier caps request bodies and bills execution time, and proxying a multi-
 * megabyte document through it would burn both for no benefit.
 */

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

export interface UploadResult {
  secureUrl: string;
  publicId: string;
}

/** Result of a pick step the user can simply back out of. */
export type PickOutcome = { cancelled: true } | { cancelled: false; file: PickedFile };

/**
 * Photo picker for avatars and outreach flyers.
 *
 * Images are cropped to a square for avatars and 16:9 for flyers at PICK time
 * rather than by a Cloudinary transformation, so what the user approves is
 * exactly what is stored — and so a wildly oversized camera original is never
 * uploaded over a Ghanaian mobile connection in the first place.
 */
export async function pickImage(kind: 'avatar' | 'flyer'): Promise<PickOutcome> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('V-HUB needs permission to open your photos.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: kind === 'avatar' ? [1, 1] : [16, 9],
    quality: 0.8,
  });

  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset) return { cancelled: true };

  return {
    cancelled: false,
    file: {
      uri: asset.uri,
      name: asset.fileName ?? `${kind}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
    },
  };
}

/** Document picker for credential files (PDF or image). */
export async function pickCredentialDocument(): Promise<PickOutcome> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
  });

  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset) return { cancelled: true };

  return {
    cancelled: false,
    file: {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
    },
  };
}

/**
 * Uploads a picked file using a server-issued signature.
 *
 * The multipart field set must match the parameters the server signed exactly
 * — `folder` and `timestamp` are signed, while `file` and `api_key` are not.
 * Adding another signed-eligible field here without adding it to signUpload()
 * in api/src/server/cloudinary.ts changes the hash Cloudinary computes and
 * every upload starts failing with 401.
 */
export async function uploadToCloudinary(
  kind: UploadKind,
  file: PickedFile
): Promise<UploadResult> {
  const signature = await getUploadSignature(kind);

  const form = new FormData();
  // React Native's FormData accepts this {uri, name, type} shape for files;
  // it is not the web File object and does not read the file into JS memory,
  // which is what keeps a large PDF from blowing the JS heap.
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`,
    { method: 'POST', body: form }
  );

  if (!response.ok) {
    // Cloudinary's own error text is developer-facing ("Invalid signature ..."),
    // so it is logged rather than shown.
    console.warn('[cloudinary] upload failed:', response.status, await response.text());
    throw new Error('That upload did not go through. Please try again.');
  }

  const json = (await response.json()) as { secure_url?: string; public_id?: string };
  if (!json.secure_url || !json.public_id) {
    throw new Error('Storage returned an unexpected response. Please try again.');
  }

  return { secureUrl: json.secure_url, publicId: json.public_id };
}
