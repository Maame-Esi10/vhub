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

/**
 * Keyed by id as a PLAIN OBJECT, never a Map.
 *
 * React Query's cache is persisted to device storage (PersistQueryClientProvider
 * in app/_layout.tsx), which serialises it as JSON. `JSON.stringify(new Map())`
 * is `{}` — a Map's contents are simply dropped — so on any restored cache the
 * data came back as an empty object with no `.get` method, and every caller
 * crashed with "undefined is not a function". A plain object survives the round
 * trip intact, which is the only shape that can be trusted here.
 */
/**
 * Organisation logos for MANY outreaches at once, keyed by organisation id.
 *
 * WHY THIS EXISTS AT ALL. An outreach embeds `organisation_profiles`, and the
 * logo does not live there — it is `profiles.avatar_url`, shared with every
 * other kind of account. The obvious fix, embedding the organisation's
 * `profiles` row alongside, does not work: `profiles` is row-scoped by RLS and
 * comes back null for any organisation the volunteer has never applied to.
 *
 * So the logo is fetched separately from `public_organisation_profiles`, the
 * view that exists precisely to expose an organisation's public face to every
 * authenticated user. One `.in()` query for the whole screen rather than one
 * per card — the feed renders up to fifty outreaches, and a per-card query
 * would turn one screen into fifty round trips. Same shape as
 * `useOutreachRolesForMany`.
 *
 * The key is the SORTED id list, so two renders with the same organisations in
 * a different order share a cache entry instead of refetching.
 */
export function useOrganisationLogos(organisationIds: readonly (string | null | undefined)[]) {
  const ids = [...new Set(organisationIds.filter((id): id is string => !!id))].sort();

  return useQuery({
    queryKey: [...publicProfileKeys.all, 'organisation-logos', ids.join(',')] as const,
    enabled: ids.length > 0,
    // Logos change about never, and this runs alongside every list screen.
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string | null>> => {
      const { data, error } = await supabase
        .from('public_organisation_profiles')
        .select('id, avatar_url')
        .in('id', ids);

      if (error) {
        throw new Error(error.message || 'Could not load organisation logos.');
      }

      const byId: Record<string, string | null> = {};
      for (const row of (data ?? []) as { id: string; avatar_url: string | null }[]) {
        byId[row.id] = row.avatar_url;
      }
      return byId;
    },
  });
}
