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
  licenseNumber: string | null;
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

      const { data: updatedVolunteerProfile, error: volunteerError } = await supabase
        .from('volunteer_profiles')
        .update({
          category: params.category,
          skill_tags: params.skillTags,
          specialties: params.specialties,
          availability_slots: params.availabilitySlots,
          license_number: params.licenseNumber,
          declaration_signed: params.declarationSigned,
        })
        .eq('id', params.userId)
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
