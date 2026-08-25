import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { decideCredential } from '@/lib/api-client';
import { adminActionKeys } from '@/hooks/useAdminActions';
import type { VolunteerCategory } from '@/types/database';

export const credentialReviewKeys = {
  all: ['credential-review'] as const,
  queue: () => [...credentialReviewKeys.all, 'queue'] as const,
  detail: (volunteerId: string) => [...credentialReviewKeys.all, 'detail', volunteerId] as const,
};

/** One volunteer waiting on a Gate 1 decision. */
export interface CredentialQueueRow {
  id: string;
  full_name: string;
  category: VolunteerCategory | null;
  experience_level: string | null;
  region: string | null;
  district: string | null;
  verification_submitted_at: string | null;
  has_document: boolean;
}

interface QueueQueryRow {
  id: string;
  category: VolunteerCategory | null;
  experience_level: string | null;
  credential_document_id: string | null;
  verification_submitted_at: string | null;
  profile: { full_name: string; region: string | null; district: string | null } | null;
}

/**
 * Volunteers waiting on Gate 1, oldest first.
 *
 * Reads straight from Supabase: `volunteer_profiles_select_authenticated` and
 * `profiles_select_authenticated` both gained an `is_admin()` clause in package
 * D, precisely so this query can exist without an endpoint. Nothing here needs
 * a secret — only the DECISION does, because it writes a server-only column.
 */
export function useCredentialQueue() {
  const role = useAuthStore((state) => state.profile?.role);

  return useQuery({
    queryKey: credentialReviewKeys.queue(),
    enabled: role === 'admin',
    queryFn: async (): Promise<CredentialQueueRow[]> => {
      const { data, error } = await supabase
        .from('volunteer_profiles')
        .select(
          'id, category, experience_level, credential_document_id, verification_submitted_at, profile:profiles!inner(full_name, region, district)'
        )
        .eq('verification_status', 'documents_pending')
        .order('verification_submitted_at', { ascending: true, nullsFirst: true });

      if (error) throw new Error(error.message || 'Could not load the credential queue.');

      return ((data ?? []) as unknown as QueueQueryRow[]).map((row) => ({
        id: row.id,
        full_name: row.profile?.full_name ?? 'Volunteer',
        category: row.category,
        experience_level: row.experience_level,
        region: row.profile?.region ?? null,
        district: row.profile?.district ?? null,
        verification_submitted_at: row.verification_submitted_at,
        // A pending volunteer with no document should not exist — the endpoint
        // writes both columns together — but the queue says so rather than
        // showing an empty viewer if one ever does.
        has_document: !!row.credential_document_id,
      }));
    },
  });
}

export interface DecideCredentialParams {
  volunteerId: string;
  decision: 'approve' | 'reject';
  reason: string;
}

export function useDecideCredential() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ volunteerId, decision, reason }: DecideCredentialParams) =>
      decideCredential(volunteerId, decision, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: credentialReviewKeys.all });
      void queryClient.invalidateQueries({ queryKey: adminActionKeys.all });
    },
  });
}
