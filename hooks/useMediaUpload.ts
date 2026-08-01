import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recordVerificationDocument } from '@/lib/api-client';
import {
  pickCredentialDocument,
  pickImage,
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

      const { secureUrl, publicId } = await uploadToCloudinary('credential', picked.file);
      await recordVerificationDocument(publicId, secureUrl);

      // Re-read rather than trusting the endpoint's echo: the server may have
      // written more than the status (it also stores the URL), and the store
      // should hold the row as the database now actually has it.
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
