import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteVerificationDocument, recordVerificationDocument } from '@/lib/api-client';
import {
  pickCredentialDocument,
  pickImage,
  pickImages,
  uploadToCloudinary,
  type UploadResult,
} from '@/lib/cloudinary';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { profileEditorKeys } from '@/hooks/useProfileEditor';
import type { Profile, VolunteerProfile } from '@/types/database';

/**
 * The three upload flows, each ending in a different place.
 *
 * They are separate hooks rather than one parameterised hook because what
 * happens AFTER the bytes land differs in kind, not degree: an avatar is a
 * client-writable column, a credential is a server-only column behind an
 * endpoint that also moves verification_status, and a flyer is just a string
 * handed back to a form that has not been submitted yet.
 */

/** `null` means the user backed out of the picker — not an error to report. */
export function useAvatarUpload() {
  const setProfile = useAuthStore((state) => state.setProfile);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string): Promise<Profile | null> => {
      const picked = await pickImage('avatar');
      if (picked.cancelled) return null;

      const { secureUrl } = await uploadToCloudinary('avatar', picked.file);

      // avatar_url is in profiles' UPDATE grant list, so the client writes it
      // directly — no endpoint needed.
      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: secureUrl })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw new Error(error.message || 'Could not save your new photo.');
      return data as Profile;
    },
    onSuccess: (updated) => {
      if (!updated) return;
      setProfile(updated);
      queryClient.invalidateQueries({ queryKey: profileEditorKeys.all });
    },
  });
}

/**
 * Clears the profile photo (an organisation's logo is the same column).
 *
 * The Cloudinary asset is deliberately left behind. Destroying it needs the API
 * secret and therefore a server round-trip, and an orphan on the free tier is
 * cheap — whereas a delete that succeeds remotely and then fails to clear the
 * row leaves the app pointing at an image that no longer exists. The gallery
 * makes the same trade for the same reason.
 */
export function useRemoveAvatar() {
  const setProfile = useAuthStore((state) => state.setProfile);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw new Error(error.message || 'Could not remove your photo.');
      return data as Profile;
    },
    onSuccess: (updated) => {
      setProfile(updated);
      queryClient.invalidateQueries({ queryKey: profileEditorKeys.all });
    },
  });
}

/**
 * Picks and uploads a credential, then records it through
 * /api/verification-document — which is what advances verification_status to
 * 'documents_pending'. Neither column is client-writable, so this cannot be
 * short-circuited by the app.
 */
export function useCredentialUpload() {
  const setVolunteerProfile = useAuthStore((state) => state.setVolunteerProfile);

  return useMutation({
    mutationFn: async (userId: string): Promise<VolunteerProfile | null> => {
      const picked = await pickCredentialDocument();
      if (picked.cancelled) return null;

      // Only the public_id is kept. The upload's secure_url is deliberately
      // discarded here and nowhere stored: a credential is a private Cloudinary
      // asset now, so that URL would not work for anyone anyway — and a stored
      // URL was precisely the leak package B closed.
      const { publicId } = await uploadToCloudinary('credential', picked.file);
      await recordVerificationDocument(publicId);

      // Re-read rather than trusting the endpoint's echo: the server may have
      // written more than the status (it also stores the document id), and the
      // store should hold the row as the database now actually has it.
      const { data, error } = await supabase
        .from('volunteer_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw new Error(error.message || 'Document saved, but the status could not be refreshed.');
      return data as VolunteerProfile;
    },
    onSuccess: (updated) => {
      if (updated) setVolunteerProfile(updated);
    },
  });
}

/**
 * Withdraws the credential document.
 *
 * Goes through the same endpoint as the upload, and for the same reason: both
 * columns it touches are server-only. The volunteer returns to `unverified`,
 * which is deliberate — `documents_pending` means a reviewer has something to
 * read, and with the document gone they would sit in a queue for a decision
 * nobody can make.
 */
export function useDeleteCredential() {
  const setVolunteerProfile = useAuthStore((state) => state.setVolunteerProfile);

  return useMutation({
    mutationFn: async (userId: string): Promise<VolunteerProfile> => {
      const result = await deleteVerificationDocument();

      const { data, error } = await supabase
        .from('volunteer_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        throw new Error(error.message || 'Document removed, but the status could not be refreshed.');
      }

      // Surfaced rather than swallowed: the row is authoritative and has been
      // cleared, but the file may still exist in storage, and a volunteer
      // withdrawing an identity document deserves to know that.
      if (!result.storageCleared) {
        console.warn('Credential row cleared but the stored file could not be deleted.');
      }
      return data as VolunteerProfile;
    },
    onSuccess: (updated) => {
      setVolunteerProfile(updated);
    },
  });
}

/**
 * Uploads an outreach flyer and returns the URL for the create/edit form to
 * hold until it submits. Nothing is written to the database here — the
 * outreach row may not exist yet.
 */
export function useFlyerUpload() {
  return useMutation({
    mutationFn: async (): Promise<UploadResult | null> => {
      const picked = await pickImage('flyer');
      if (picked.cancelled) return null;
      return uploadToCloudinary('flyer', picked.file);
    },
  });
}

/**
 * Uploads one gallery image and returns its URL.
 *
 * Deliberately separate from `useFlyerUpload` even though the flow is the
 * same shape: the two are different things on the outreach (one banner versus
 * several supporting images), they crop to different aspects, and they land in
 * different Cloudinary folders. Sharing the hook would make it one edit away
 * from a gallery upload overwriting a flyer.
 *
 * Writes nothing to the database — the caller decides where the URL goes,
 * because in the wizard the outreach row does not exist yet.
 */
export function useGalleryImageUpload() {
  return useMutation({
    mutationFn: async (remaining: number): Promise<UploadResult[]> => {
      const picked = await pickImages('gallery', Math.max(1, remaining));
      if (picked.cancelled) return [];

      // Sequential, not Promise.all. Each upload is a signature request plus a
      // multipart POST, and firing eight at once over a Ghanaian mobile
      // connection is how they all time out together. The organisation sees
      // them appear one by one instead, which also makes a partial failure
      // legible: what arrived stays.
      const uploaded: UploadResult[] = [];
      for (const file of picked.files) {
        uploaded.push(await uploadToCloudinary('gallery', file));
      }
      return uploaded;
    },
  });
}

/**
 * Uploads one organisation verification document and hands back its Cloudinary
 * NAME for the form to hold until it submits.
 *
 * Nothing is written to the database here, the same shape as the flyer upload
 * and for the same reason: the submission is a single act, and a document row
 * written before the organisation presses Submit would put evidence in front of
 * a reviewer for a submission that never happened.
 *
 * A public_id comes back rather than a URL, because the asset is private and a
 * URL for it would not work for anybody. `null` means the picker was dismissed.
 */
export function useOrganisationDocumentUpload() {
  return useMutation({
    mutationFn: async (): Promise<{ publicId: string; name: string } | null> => {
      const picked = await pickCredentialDocument();
      if (picked.cancelled) return null;

      const { publicId } = await uploadToCloudinary('organisation_document', picked.file);
      return { publicId, name: picked.file.name };
    },
  });
}
