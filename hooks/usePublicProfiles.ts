import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PublicOrganisationProfile, PublicVolunteerProfile } from '@/types/database';

export const publicProfileKeys = {
  all: ['public-profiles'] as const,
  volunteer: (volunteerId: string) => [...publicProfileKeys.all, 'volunteer', volunteerId] as const,
  organisation: (organisationId: string) =>
    [...publicProfileKeys.all, 'organisation', organisationId] as const,
};

/**
 * Public profile screens read the `public_volunteer_profiles` /
 * `public_organisation_profiles` views, never the base tables.
 *
 * profiles and volunteer_profiles are row-scoped to the two parties of an
 * application, so querying them directly here would return nothing for anyone
 * a volunteer hasn't already applied to — which is exactly the browsing case
 * these screens exist for. The views expose a whitelisted, PII-free column
 * set instead (no phone, no email) and are granted to `authenticated` only.
 * See the "Public discovery views" section of supabase/schema.sql.
 */
export function usePublicVolunteerProfile(volunteerId: string | undefined) {
  return useQuery({
    queryKey: publicProfileKeys.volunteer(volunteerId ?? 'unknown'),
    enabled: !!volunteerId,
    queryFn: async (): Promise<PublicVolunteerProfile> => {
      const { data, error } = await supabase
        .from('public_volunteer_profiles')
        .select('*')
        .eq('id', volunteerId!)
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Could not load this volunteer profile.');
      }

      return data as PublicVolunteerProfile;
    },
  });
}

export function usePublicOrganisationProfile(organisationId: string | undefined) {
  return useQuery({
    queryKey: publicProfileKeys.organisation(organisationId ?? 'unknown'),
    enabled: !!organisationId,
    queryFn: async (): Promise<PublicOrganisationProfile> => {
      const { data, error } = await supabase
        .from('public_organisation_profiles')
        .select('*')
        .eq('id', organisationId!)
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Could not load this organisation profile.');
      }

      return data as PublicOrganisationProfile;
    },
  });
}
