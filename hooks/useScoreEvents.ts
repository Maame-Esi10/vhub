import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { voidScoreEvent } from '@/lib/api-client';
import { adminActionKeys } from '@/hooks/useAdminActions';
import type { ScoreEvent } from '@/types/database';

/**
 * V-Score deductions — the volunteer's own record, and the admin's list.
 *
 * `score_events` holds the deductions that produce no event review: a late
 * cancellation, an on-time cancellation, and a late per-day release. Until this
 * hook existed the table was written by /api/vscore, read by the replay, and
 * shown to nobody — a volunteer could lose points with no way to find out what
 * for, and an admin could neither see a deduction nor undo one.
 *
 * NOTHING HERE WRITES. The table has no client insert, update or delete grant
 * at all: one that did would let a client penalise anybody by name, or void its
 * own penalties. The reversal goes through /api/score-event on the service-role
 * key, like every other admin decision.
 *
 * READS are the volunteer themselves and admins, and deliberately NOT the
 * organisation — this is a person's disciplinary record, and an organisation
 * already sees the V-Score it produced. Seeing somebody's number is not the
 * same as seeing the reasons behind it.
 */

export const scoreEventKeys = {
  all: ['score-events'] as const,
  mine: (volunteerId: string | undefined) => [...scoreEventKeys.all, 'mine', volunteerId] as const,
  admin: () => [...scoreEventKeys.all, 'admin'] as const,
};

/** A deduction with the little context a screen needs to name it. */
export interface ScoreEventRow extends ScoreEvent {
  outreach: { id: string; title: string } | null;
}

/** The same row, plus who it was taken from. Admin list only. */
export interface AdminScoreEventRow extends ScoreEventRow {
  volunteer: { full_name: string; email: string | null } | null;
}

const COLUMNS =
  'id, volunteer_id, kind, points, outreach_id, application_id, outreach_day_id, reason, voided_at, voided_reason, created_at';

/**
 * Every deduction ever applied to the signed-in volunteer, newest first.
 *
 * VOIDED ONES ARE INCLUDED, on purpose. A reversed deduction is part of the
 * story of somebody's score, and hiding it would mean a volunteer who was told
 * about a penalty could later find no trace of it — which reads as the app
 * having lost the record rather than as the penalty having been withdrawn.
 *
 * The outreach is embedded rather than fetched per row. It can come back null
 * for an event the volunteer can no longer see, which is why every screen falls
 * back to the deduction's own written reason: the reason is always there, and
 * `score_events.reason` is non-blank by check constraint for exactly this.
 */
export function useMyScoreEvents(volunteerId: string | undefined) {
  return useQuery({
    queryKey: scoreEventKeys.mine(volunteerId),
    enabled: !!volunteerId,
    queryFn: async (): Promise<ScoreEventRow[]> => {
      const { data, error } = await supabase
        .from('score_events')
        .select(`${COLUMNS}, outreach:outreaches(id, title)`)
        .eq('volunteer_id', volunteerId!)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message || 'Could not load your score deductions.');
      return (data ?? []) as unknown as ScoreEventRow[];
    },
  });
}

/**
 * Every deduction on the platform, newest first — the admin's list.
 *
 * A LIST RATHER THAN A SEARCH, which is the opposite of the moderation screen
 * and deliberately so. Moderation browses PEOPLE, and a roll of every account
 * invites looking through them for their own sake. This browses DECISIONS the
 * platform has already made about scores: it is the same kind of thing as the
 * activity log, an admin needs to find one to correct it without knowing whose
 * it was, and the table only ever holds rows that moved somebody's number.
 *
 * Capped at 200. If it ever grows past that the cap is the bug and the fix is
 * paging, not a silently truncated list an admin believes is complete.
 */
export function useAllScoreEvents() {
  const role = useAuthStore((state) => state.profile?.role);

  return useQuery({
    queryKey: scoreEventKeys.admin(),
    enabled: role === 'admin',
    queryFn: async (): Promise<AdminScoreEventRow[]> => {
      const { data, error } = await supabase
        .from('score_events')
        .select(
          `${COLUMNS}, outreach:outreaches(id, title), volunteer:profiles!score_events_volunteer_id_fkey(full_name, email)`
        )
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw new Error(error.message || 'Could not load V-Score deductions.');
      return (data ?? []) as unknown as AdminScoreEventRow[];
    },
  });
}

export interface VoidScoreEventParams {
  scoreEventId: string;
  reason: string;
}

/**
 * Reverses one deduction.
 *
 * Invalidates the volunteer's own list too, not just the admin's, because the
 * same reversal changes what that volunteer sees on their feedback screen — and
 * an admin testing the flow on their own device would otherwise be looking at a
 * stale list wondering whether it worked.
 */
export function useVoidScoreEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ scoreEventId, reason }: VoidScoreEventParams) =>
      voidScoreEvent(scoreEventId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scoreEventKeys.all });
      void queryClient.invalidateQueries({ queryKey: adminActionKeys.all });
    },
  });
}

/** The volunteer-facing label for each kind. Never the enum value. */
export const SCORE_EVENT_LABELS: Record<ScoreEvent['kind'], string> = {
  late_cancellation: 'Late cancellation',
  on_time_cancellation: 'Cancelled in good time',
  late_release: 'Dropped a day late',
};
