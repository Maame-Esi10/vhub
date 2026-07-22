import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

interface CompleteOnboardingParams {
  userId: string;
  region: string | null;
  district: string | null;
  category: string | null;
  skillTags: string[];
  specialties: string[];
  availabilitySlots: string[];
  declarationSigned: boolean;
}

/**
 * Persists the volunteer onboarding wizard's accumulated selections
 * (region/district on `profiles`, everything else on `volunteer_profiles`)
 * in a single mutation, called from the final step (verify-identity.tsx)
 * regardless of whether the volunteer completed identity verification or
 * chose "Complete Later".
 */
export function useCompleteOnboarding() {
  const setProfile = useAuthStore((state) => state.setProfile);
  const setVolunteerProfile = useAuthStore((state) => state.setVolunteerProfile);

  return useMutation({
    mutationFn: async (params: CompleteOnboardingParams) => {
      const { data: updatedProfile, error: profileError } = await supabase
        .from('profiles')
        .update({ region: params.region, district: params.district })
        .eq('id', params.userId)
        .select()
        .single();

      if (profileError || !updatedProfile) {
        throw profileError ?? new Error('Could not save your profile. Please try again.');
      }

      // verification_status is intentionally not set here: it stays at its
      // DB default ('unverified') regardless of which button the volunteer
      // pressed. There's no evidence (document upload) yet to justify
      // 'documents_pending' — that transition happens once Cloudinary
      // upload is wired in a later phase. declaration_signed is the only
      // real signal Phase 1 has.
      //
      // upsert (not update): signup's profiles/volunteer_profiles inserts
      // are two sequential, non-transactional writes (see useSignUp.ts and
      // useAuthGuard's bootstrapProfileFromMetadata). If the second insert
      // was dropped mid-flight (e.g. connection loss), the profiles row
      // exists but volunteer_profiles never got created, and a plain
      // `.update().eq('id', ...)` would match zero rows — `.single()` then
      // throws a generic, unhelpful "no rows" error and the volunteer can
      // never complete onboarding. Upserting on the `id` PK creates the
      // missing row instead, while behaving exactly like the old update for
      // the normal case where the row already exists.
      const { data: updatedVolunteerProfile, error: volunteerError } = await supabase
        .from('volunteer_profiles')
        .upsert(
          {
            id: params.userId,
            category: params.category,
            skill_tags: params.skillTags,
            specialties: params.specialties,
            availability_slots: params.availabilitySlots,
            declaration_signed: params.declarationSigned,
          },
          { onConflict: 'id' }
        )
        .select()
        .single();

      if (volunteerError || !updatedVolunteerProfile) {
        throw volunteerError ?? new Error('Could not save your volunteer profile. Please try again.');
      }

      // Both authStore.profile and authStore.volunteerProfile must be
      // refreshed here: useAuthGuard gates onboarding completion on
      // volunteerProfile.category, so leaving it stale (null) would bounce
      // the user straight back into the onboarding wizard after this
      // mutation resolves.
      setProfile(updatedProfile);
      setVolunteerProfile(updatedVolunteerProfile);
    },
  });
}
