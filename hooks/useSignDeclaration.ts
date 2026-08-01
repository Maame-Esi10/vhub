import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { VolunteerProfile } from '@/types/database';

/**
 * Records the volunteer's signed accuracy declaration.
 *
 * This writes `declaration_signed` and NOTHING ELSE. In particular it does not
 * touch `verification_status`, which is absent from volunteer_profiles' UPDATE
 * grant list on purpose — a client that could set its own status to 'verified'
 * would walk straight through the clinical-role eligibility gate that reads it.
 * Moving that column is service-role work, done by the team reviewing the
 * actual documents.
 *
 * Uses `.update()`, not `.upsert()`: an upsert would put every payload column
 * including `id` into the generated SET clause, and this row always exists by
 * the time the screen is reachable.
 */
export function useSignDeclaration() {
  const setVolunteerProfile = useAuthStore((state) => state.setVolunteerProfile);

  return useMutation({
    mutationFn: async (userId: string): Promise<VolunteerProfile> => {
      const { data, error } = await supabase
        .from('volunteer_profiles')
        .update({ declaration_signed: true })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message || 'Could not record your declaration.');
      }
      return data as VolunteerProfile;
    },
    onSuccess: (updated) => {
      // Keeps the Settings row, the clinical-application gate and this screen
      // consistent without a round trip.
      setVolunteerProfile(updated);
    },
  });
}
