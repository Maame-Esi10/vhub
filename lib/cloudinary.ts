import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File, UploadType } from 'expo-file-system';
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
export async function pickImage(kind: 'avatar' | 'flyer' | 'gallery'): Promise<PickOutcome> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('V-HUB needs permission to open your photos.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    // 4:3 for gallery images: a poster or a photograph from the day is
    // usually taller than the 16:9 the banner crops to, and cropping one to a
    // letterbox loses the top and bottom of it.
    aspect: kind === 'avatar' ? [1, 1] : kind === 'gallery' ? [4, 3] : [16, 9],
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

  // Uploaded by expo-file-system's NATIVE multipart task -- deliberately not
  // JS FormData + fetch.
  //
  // Two earlier attempts failed here, and the reason is worth recording. The
  // classic React Native file part, `{ uri, name, type }`, is valid for React
  // Native's own FormData polyfill, but Expo SDK 54+ replaces the global fetch
  // with its WinterCG implementation whose multipart encoder accepts only a
  // string, a Blob, or an object exposing bytes(); the uri form falls through
  // to its final `else` and throws "Unsupported FormDataPart implementation".
  // Expo's source says so outright -- "`uri` is not supported for React
  // Native's FormData" -- and its own tests assert that exact message.
  // Swapping in a bytes()-bearing object then depends on WHICH FormData is
  // installed as the global, since the encoder takes a different path for
  // React Native's polyfill than for Expo's own.
  //
  // File.upload() sidesteps the entire question: the multipart body is built
  // in Kotlin/Swift (see FileSystemUploadTask.kt), so no JS FormData and no
  // fetch is involved and there is no global to guess at. It also streams from
  // disk rather than reading the file into the JS heap, which matters for a
  // multi-megabyte credential PDF.
  //
  // `parameters` must carry exactly the fields the server signed (folder and
  // timestamp) plus the unsigned api_key. Adding a signed-eligible field here
  // without adding it to signUpload() in api/src/server/cloudinary.ts changes
  // the hash Cloudinary recomputes, and every upload starts failing with 401.
  const source = new File(file.uri);
  const result = await source.upload(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`,
    {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: file.mimeType,
      parameters: {
        api_key: signature.apiKey,
        timestamp: String(signature.timestamp),
        signature: signature.signature,
        folder: signature.folder,
      },
    }
  );

  if (result.status < 200 || result.status >= 300) {
    // Cloudinary's own error text is developer-facing ("Invalid signature ..."),
    // so it is logged rather than shown.
    //
    // cloudName and apiKey are logged alongside it because a 401 here is almost
    // always a credential-pairing problem, and neither value is secret -- the
    // api_key travels in the upload request in plain sight. Seeing WHICH key
    // the server signed with is the difference between diagnosing this in one
    // upload and guessing at a dashboard. The secret is never logged, not even
    // its length.
    console.warn('[cloudinary] upload failed:', result.status, result.body);
    console.warn(
      '[cloudinary] signed by cloud=%s api_key=%s folder=%s',
      signature.cloudName,
      signature.apiKey,
      signature.folder
    );
    throw new Error('That upload did not go through. Please try again.');
  }

  const json = JSON.parse(result.body) as { secure_url?: string; public_id?: string };
  if (!json.secure_url || !json.public_id) {
    throw new Error('Storage returned an unexpected response. Please try again.');
  }

  return { secureUrl: json.secure_url, publicId: json.public_id };
}
