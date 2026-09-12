import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import {
  decideOrganisationVerification,
  submitOrganisationVerification,
  type OrganisationVerificationSubmission,
} from '@/lib/api-client';
import { profileEditorKeys } from '@/hooks/useProfileEditor';
import { adminActionKeys } from '@/hooks/useAdminActions';
import type {
  OrganisationDocument,
  OrganisationProfile,
  OrganisationRegistration,
} from '@/types/database';
import { humanError } from '@/lib/errorMessage';

export const orgVerificationKeys = {
  all: ['organisation-verification'] as const,
  mine: (organisationId: string) => [...orgVerificationKeys.all, 'mine', organisationId] as const,
  queue: () => [...orgVerificationKeys.all, 'queue'] as const,
  detail: (organisationId: string) =>
    [...orgVerificationKeys.all, 'detail', organisationId] as const,
};

/** An organisation's submission: the profile fields plus both child tables. */
export interface VerificationSubmission {
  profile: OrganisationProfile;
  registrations: OrganisationRegistration[];
  documents: OrganisationDocument[];
}

async function fetchSubmission(organisationId: string): Promise<VerificationSubmission | null> {
  // Three reads rather than one embedded select, because RLS on the two child
  // tables is `own row or admin` while the profile is broadly readable — an
  // embed would make one failing policy look like a missing organisation.
  const [profileResult, registrationsResult, documentsResult] = await Promise.all([
    supabase.from('organisation_profiles').select('*').eq('id', organisationId).maybeSingle(),
    supabase
      .from('organisation_registrations')
      .select('*')
      .eq('organisation_id', organisationId)
      .order('created_at'),
    supabase
      .from('organisation_documents')
      .select('*')
      .eq('organisation_id', organisationId)
      .order('created_at'),
  ]);

  if (profileResult.error) {
    throw new Error(humanError(profileResult.error) || 'Could not load the organisation.');
  }
  if (!profileResult.data) return null;

  return {
    profile: profileResult.data as OrganisationProfile,
    registrations: (registrationsResult.data ?? []) as OrganisationRegistration[],
    documents: (documentsResult.data ?? []) as OrganisationDocument[],
  };
}

/** The signed-in organisation's own verification state and submission. */
export function useMyVerificationSubmission() {
  const userId = useAuthStore((state) => state.user?.id);
  const role = useAuthStore((state) => state.profile?.role);

  return useQuery({
    queryKey: orgVerificationKeys.mine(userId ?? 'anonymous'),
    enabled: !!userId && role === 'organisation',
    queryFn: () => fetchSubmission(userId as string),
  });
}

export function useSubmitVerification() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);

  return useMutation({
    mutationFn: (submission: OrganisationVerificationSubmission) =>
      submitOrganisationVerification(submission),
    onSuccess: () => {
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: orgVerificationKeys.mine(userId) });
        // The Settings screen and the profile editor both read `verified` off
        // this row, and the badge changes the moment the state does.
        void queryClient.invalidateQueries({ queryKey: profileEditorKeys.all });
      }
    },
  });
}

/** One waiting organisation, as the admin queue lists it. */
export interface VerificationQueueRow {
  id: string;
  org_name: string;
  org_type: string | null;
  official_email: string | null;
  contact_person: string | null;
  verification_submitted_at: string | null;
}

/**
 * The admin queue: organisations waiting on a decision, OLDEST FIRST.
 *
 * Oldest first is deliberate and is the only fair order — newest first means
 * whoever submitted on the busiest day waits indefinitely while later arrivals
 * are answered first.
 */
export function useVerificationQueue() {
  const role = useAuthStore((state) => state.profile?.role);

  return useQuery({
    queryKey: orgVerificationKeys.queue(),
    enabled: role === 'admin',
    queryFn: async (): Promise<VerificationQueueRow[]> => {
      const { data, error } = await supabase
        .from('organisation_profiles')
        .select('id, org_name, org_type, official_email, contact_person, verification_submitted_at')
        .eq('verification_state', 'documents_submitted')
        .order('verification_submitted_at', { ascending: true, nullsFirst: true });

      if (error) throw new Error(error.message || 'Could not load the verification queue.');
      return (data ?? []) as VerificationQueueRow[];
    },
  });
}

/** Everything an admin needs to judge one organisation. */
export function useVerificationDetail(organisationId: string | undefined) {
  const role = useAuthStore((state) => state.profile?.role);

  return useQuery({
    queryKey: orgVerificationKeys.detail(organisationId ?? 'none'),
    enabled: role === 'admin' && !!organisationId,
    queryFn: () => fetchSubmission(organisationId as string),
  });
}

export interface DecideVerificationParams {
  organisationId: string;
  decision: 'approve' | 'reject';
  reason: string;
}

export function useDecideVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organisationId, decision, reason }: DecideVerificationParams) =>
      decideOrganisationVerification(organisationId, decision, reason),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: orgVerificationKeys.queue() });
      void queryClient.invalidateQueries({
        queryKey: orgVerificationKeys.detail(variables.organisationId),
      });
      // The decision has just written an audit row, so the activity log is stale.
      void queryClient.invalidateQueries({ queryKey: adminActionKeys.all });
    },
  });
}
