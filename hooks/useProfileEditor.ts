import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { ExperienceLevel, OrganisationProfile, VolunteerCategory } from '@/types/database';

export const profileEditorKeys = {
  all: ['profile-editor'] as const,
  myOrganisation: (organisationId: string) =>
    [...profileEditorKeys.all, 'organisation', organisationId] as const,
};

export interface UpdateVolunteerProfileParams {
  userId: string;
  fullName: string;
  region: string | null;
  district: string | null;
  category: VolunteerCategory | null;
  experienceLevel: ExperienceLevel | null;
  skillTags: string[];
  specialties: string[];
  availabilitySlots: string[];
  bio: string | null;
}

/**
 * Saves the volunteer Edit Profile screen across its two tables.
 *
 * Column choice is constrained by the column-level UPDATE grants at the
 * bottom of supabase/schema.sql, not just RLS: `profiles` grants only
 * full_name/phone/email/region/district/avatar_url (notably NOT `role`), and
 * `volunteer_profiles` grants category/skill_tags/specialties/
 * experience_level/availability_slots/bio/declaration_signed. v_score,
 * events_attended and verification_status are deliberately absent from that
 * list — they are service-role-only and must never be sent from here, or the
 * whole statement fails with `permission denied for table` (42501).
 *
 * `.update()` and not `.upsert()`: profiles has no `id` in its UPDATE grant
 * list, so an upsert's ON CONFLICT DO UPDATE SET would try to write `id` and
 * be rejected. Both rows are guaranteed to exist by the time a volunteer can
 * reach this screen (onboarding created them), so there is nothing to repair.
 */
export function useUpdateVolunteerProfile() {
  const setProfile = useAuthStore((state) => state.setProfile);
  const setVolunteerProfile = useAuthStore((state) => state.setVolunteerProfile);

  return useMutation({
    mutationFn: async (params: UpdateVolunteerProfileParams) => {
      const { data: updatedProfile, error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: params.fullName,
          region: params.region,
          district: params.district,
        })
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
          experience_level: params.experienceLevel,
          skill_tags: params.skillTags,
          specialties: params.specialties,
          availability_slots: params.availabilitySlots,
          bio: params.bio,
        })
        .eq('id', params.userId)
        .select()
        .single();

      if (volunteerError || !updatedVolunteerProfile) {
        throw (
          volunteerError ?? new Error('Could not save your volunteer profile. Please try again.')
        );
      }

      // Push both rows back into authStore so the profile screen and the
      // guard's onboarding check read the new values without a refetch.
      setProfile(updatedProfile);
      setVolunteerProfile(updatedVolunteerProfile);
    },
  });
}

/**
 * The organisation's own `organisation_profiles` row.
 *
 * authStore carries `profile` and `volunteerProfile` but no organisation
 * equivalent, so unlike the volunteer screen this one has to fetch. Reads the
 * base table rather than the `public_organisation_profiles` view because the
 * view omits columns the owner needs to edit and is shaped for discovery by
 * other users.
 */
export function useMyOrganisationProfile(organisationId: string | undefined) {
  return useQuery({
    queryKey: profileEditorKeys.myOrganisation(organisationId ?? 'unknown'),
    enabled: !!organisationId,
    queryFn: async (): Promise<OrganisationProfile> => {
      const { data, error } = await supabase
        // `select('*')` now needs the definer view: `authenticated` lost SELECT
        // on the verification-evidence columns on 2026-09-23, and a `*` that
        // includes an ungranted column fails outright rather than omitting it.
        .from('organisation_private_profiles')
        .select('*')
        .eq('id', organisationId!)
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Could not load your organisation profile.');
      }

      return data as OrganisationProfile;
    },
  });
}

export interface UpdateOrganisationProfileParams {
  userId: string;
  fullName: string;
  region: string | null;
  district: string | null;
  orgName: string;
  orgType: string | null;
  description: string | null;
  website: string | null;
  /** Public enquiry details — organisation_profiles, NOT the private profiles.email/phone. */
  contactEmail: string | null;
  contactPhone: string | null;
  /**
   * Whether the public profile shows a gallery drawn from this organisation's
   * past events. Client-writable (it is in organisation_profiles' UPDATE and
   * INSERT grant lists) because it is the organisation's own presentation
   * choice — unlike `verified`, which is a service-role judgement about them.
   */
  showGallery: boolean;
}

/**
 * Saves the organisation Edit Profile screen.
 *
 * `verified` is deliberately not sent and must never be added: it is the
 * trust badge volunteers use to judge whether an outreach is legitimate, so
 * it is absent from the organisation_profiles UPDATE grant list and settable
 * only by a service-role review. See supabase/schema.sql.
 *
 * contact_email/contact_phone are the organisation's PUBLIC enquiry details
 * and live here, on the `using (true)` table. The private profiles.email and
 * profiles.phone are untouched by this screen: those are the account holder's
 * own PII, kept row-scoped, and the login address is changed only through
 * Supabase Auth (see hooks/useAccountSecurity.ts).
 *
 * The two writes run concurrently rather than in sequence. They target
 * different tables with no ordering dependency, and on a Ghanaian mobile
 * connection the second round trip was pure added latency on every save.
 * Failure semantics are unchanged: either rejecting still surfaces as a
 * thrown error and the screen stays open with the edits intact.
 */
export function useUpdateOrganisationProfile() {
  const queryClient = useQueryClient();
  const setProfile = useAuthStore((state) => state.setProfile);

  return useMutation({
    mutationFn: async (params: UpdateOrganisationProfileParams) => {
      const [profileResult, orgResult] = await Promise.all([
        supabase
          .from('profiles')
          .update({
            full_name: params.fullName,
            region: params.region,
            district: params.district,
          })
          .eq('id', params.userId)
          .select()
          .single(),
        supabase
          .from('organisation_profiles')
          .update({
            org_name: params.orgName,
            org_type: params.orgType,
            description: params.description,
            website: params.website,
            contact_email: params.contactEmail,
            contact_phone: params.contactPhone,
            show_gallery: params.showGallery,
          })
          .eq('id', params.userId)
          .select()
          .single(),
      ]);

      if (profileResult.error || !profileResult.data) {
        throw profileResult.error ?? new Error('Could not save your profile. Please try again.');
      }
      if (orgResult.error || !orgResult.data) {
        throw orgResult.error ?? new Error('Could not save your organisation profile. Please try again.');
      }

      setProfile(profileResult.data);
      return orgResult.data as OrganisationProfile;
    },
    onSuccess: (updatedOrg, params) => {
      queryClient.setQueryData(profileEditorKeys.myOrganisation(params.userId), updatedOrg);
      // The public view feeds every org-facing card elsewhere in the app;
      // invalidate so a renamed organisation isn't stale on outreach lists.
      queryClient.invalidateQueries({ queryKey: ['public-profiles'] });
    },
  });
}
