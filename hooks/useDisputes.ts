import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { announceDisputeFiled, resolveDispute } from '@/lib/api-client';
import { adminActionKeys } from '@/hooks/useAdminActions';
import type { Dispute, DisputeType } from '@/types/database';

export const disputeKeys = {
  all: ['disputes'] as const,
  mine: (volunteerId: string) => [...disputeKeys.all, 'mine', volunteerId] as const,
  queue: () => [...disputeKeys.all, 'queue'] as const,
  evidence: (disputeId: string) => [...disputeKeys.all, 'evidence', disputeId] as const,
};

/** Every dispute this volunteer has raised, newest first. */
export function useMyDisputes() {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: disputeKeys.mine(userId ?? 'anonymous'),
    enabled: !!userId,
    queryFn: async (): Promise<Dispute[]> => {
      const { data, error } = await supabase
        .from('disputes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message || 'Could not load your disputes.');
      return (data ?? []) as Dispute[];
    },
  });
}

export interface RaiseDisputeParams {
  outreachId: string;
  type: DisputeType;
  statement: string;
  outreachDayId?: string | null;
}

/**
 * Raises a dispute.
 *
 * A PLAIN CLIENT INSERT, not an endpoint, and deliberately so: nothing here
 * needs a secret, and every column that decides anything — `status`,
 * `resolution`, `resolved_by` — is withheld by the grant list. The worst a
 * crafted call can do is file a dispute the caller was always entitled to file.
 * The RESOLUTION is the half that needs the service role, and that is an
 * endpoint.
 */
export function useRaiseDispute() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);

  return useMutation({
    mutationFn: async (params: RaiseDisputeParams): Promise<Dispute> => {
      if (!userId) throw new Error('You need to be signed in to raise a dispute.');

      const { data, error } = await supabase
        .from('disputes')
        .insert({
          volunteer_id: userId,
          outreach_id: params.outreachId,
          type: params.type,
          outreach_day_id: params.outreachDayId ?? null,
          statement: params.statement.trim(),
        })
        .select()
        .single();

      if (error) {
        // The partial unique index is the likeliest failure and it means
        // something specific, so it is translated rather than shown raw.
        throw new Error(
          error.code === '23505'
            ? 'You already have an open dispute of this kind for this outreach.'
            : error.message || 'Could not raise this dispute.'
        );
      }
      /*
        THE ADMINS ARE EMAILED (owner, 2026-09-25). Not awaited and its
        failure swallowed: the dispute is filed the moment the insert
        succeeds, and a missed email must never tell the volunteer it was not.
      */
      const filed = data as Dispute;
      announceDisputeFiled(filed.id).catch(() => undefined);
      return filed;
    },
    onSuccess: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: disputeKeys.mine(userId) });
    },
  });
}

/** One waiting dispute, with the names an admin needs to tell them apart. */
export interface DisputeQueueRow extends Dispute {
  volunteer: { full_name: string } | null;
  outreach: { title: string; date: string; organisation_id: string } | null;
}

/** Open disputes, oldest first — the same fairness rule as the other queues. */
export function useDisputeQueue() {
  const role = useAuthStore((state) => state.profile?.role);

  return useQuery({
    queryKey: disputeKeys.queue(),
    enabled: role === 'admin',
    queryFn: async (): Promise<DisputeQueueRow[]> => {
      const { data, error } = await supabase
        .from('disputes')
        .select(
          '*, volunteer:profiles!disputes_volunteer_id_fkey(full_name), outreach:outreaches(title, date, organisation_id)'
        )
        .eq('status', 'open')
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message || 'Could not load the dispute queue.');
      return (data ?? []) as unknown as DisputeQueueRow[];
    },
  });
}

/**
 * The record a dispute is judged against.
 *
 * BOTH SIDES, OBJECTIVELY. For an attendance dispute that means what the scan
 * says — was there one, and what did the silent location check return — beside
 * what the organisation marked in its review. For a review dispute it means the
 * review itself beside the volunteer's aggregate history, so one bad rating can
 * be seen for what it is.
 */
export interface DisputeEvidence {
  attendance: {
    id: string;
    outreach_day_id: string | null;
    checked_in_at: string | null;
    location_check: string | null;
  }[];
  review: {
    attended: boolean;
    reliability_score: number | null;
    clinical_score: number | null;
    notes: string | null;
    created_at: string;
  } | null;
  history: { eventsAttended: number; vScore: number | null } | null;
}

export function useDisputeEvidence(dispute: DisputeQueueRow | null) {
  const role = useAuthStore((state) => state.profile?.role);

  return useQuery({
    queryKey: disputeKeys.evidence(dispute?.id ?? 'none'),
    enabled: role === 'admin' && !!dispute,
    queryFn: async (): Promise<DisputeEvidence> => {
      const target = dispute as DisputeQueueRow;

      const [attendanceResult, reviewResult, profileResult] = await Promise.all([
        supabase
          .from('attendance')
          .select('id, outreach_day_id, checked_in_at, location_check')
          .eq('outreach_id', target.outreach_id)
          .eq('volunteer_id', target.volunteer_id),
        supabase
          .from('event_reviews')
          .select('attended, reliability_score, clinical_score, notes, created_at')
          .eq('outreach_id', target.outreach_id)
          .eq('volunteer_id', target.volunteer_id)
          .maybeSingle(),
        supabase
          .from('volunteer_profiles')
          .select('events_attended, v_score')
          .eq('id', target.volunteer_id)
          .maybeSingle(),
      ]);

      return {
        attendance: (attendanceResult.data ?? []) as DisputeEvidence['attendance'],
        review: (reviewResult.data ?? null) as DisputeEvidence['review'],
        history: profileResult.data
          ? {
              eventsAttended: (profileResult.data.events_attended as number) ?? 0,
              vScore: (profileResult.data.v_score as number) ?? null,
            }
          : null,
      };
    },
  });
}

export interface ResolveDisputeParams {
  disputeId: string;
  decision: 'uphold' | 'reject';
  resolution: string;
}

export function useResolveDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ disputeId, decision, resolution }: ResolveDisputeParams) =>
      resolveDispute(disputeId, decision, resolution),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: disputeKeys.all });
      void queryClient.invalidateQueries({ queryKey: adminActionKeys.all });
    },
  });
}
