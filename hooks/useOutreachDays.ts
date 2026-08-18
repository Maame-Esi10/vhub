import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { outreachKeys } from '@/hooks/useOutreaches';
import { sortDays } from '@/lib/outreachDays';
import type { OutreachDay } from '@/types/database';

export const outreachDayKeys = {
  all: ['outreach-days'] as const,
  byOutreach: (outreachId: string) => [...outreachDayKeys.all, 'outreach', outreachId] as const,
  commitment: (applicationId: string) =>
    [...outreachDayKeys.all, 'commitment', applicationId] as const,
  commitmentsByOutreach: (outreachId: string) =>
    [...outreachDayKeys.all, 'commitments', outreachId] as const,
};

/**
 * The days one outreach runs on, in chronological order.
 *
 * NEVER EMPTY in practice: `trg_outreaches_default_day` creates a day row with
 * every outreach, so the n=1 case is a real row rather than an absence. An
 * empty array here therefore means the read failed or the outreach predates the
 * repair in 20260818_multi_day_app_support.sql — callers should fall back to
 * `outreaches.date` rather than rendering nothing.
 */
export function useOutreachDays(outreachId: string | undefined) {
  return useQuery({
    queryKey: outreachDayKeys.byOutreach(outreachId ?? 'unknown'),
    enabled: !!outreachId,
    queryFn: async (): Promise<OutreachDay[]> => {
      const { data, error } = await supabase
        .from('outreach_days')
        .select('*')
        .eq('outreach_id', outreachId!)
        .order('day', { ascending: true });

      if (error) {
        throw new Error(error.message || 'Could not load the days for this outreach.');
      }

      return sortDays((data ?? []) as OutreachDay[]);
    },
  });
}

/**
 * Days for MANY outreaches at once, keyed by outreach id — the feed's version.
 *
 * One `.in()` query rather than one per card, for the same reason
 * `useOutreachRolesForMany` exists: fifty cards must not become fifty round
 * trips. Keyed on the SORTED id list so two renders of the same outreaches in a
 * different order share a cache entry.
 */
export function useOutreachDaysForMany(outreachIds: readonly string[]) {
  const key = [...outreachIds].sort().join(',');

  return useQuery({
    queryKey: [...outreachDayKeys.all, 'many', key] as const,
    enabled: outreachIds.length > 0,
    queryFn: async (): Promise<Record<string, OutreachDay[]>> => {
      const { data, error } = await supabase
        .from('outreach_days')
        .select('*')
        .in('outreach_id', outreachIds as string[])
        .order('day', { ascending: true });

      if (error) {
        throw new Error(error.message || 'Could not load outreach days.');
      }

      const byOutreach: Record<string, OutreachDay[]> = {};
      for (const row of (data ?? []) as OutreachDay[]) {
        byOutreach[row.outreach_id] = [...(byOutreach[row.outreach_id] ?? []), row];
      }
      return byOutreach;
    },
  });
}

export interface AddOutreachDaysParams {
  outreachId: string;
  /** Every day the outreach runs on, first day included. Already-present days are skipped. */
  days: string[];
}

/**
 * Adds the days a NEWLY CREATED outreach runs on, beyond its first.
 *
 * Only for creation. The first day already exists — `trg_outreaches_default_day`
 * writes it in the same transaction as the outreach itself, so an outreach can
 * never exist without one — and this fills in days 2..n once there is an id to
 * hang them on. Editing an existing outreach's days goes through
 * `save_outreach()` instead, where the day change is in the same transaction as
 * the details and the roles.
 *
 * `ignoreDuplicates` rather than a plain insert, so re-running after a partial
 * failure is harmless. It compiles to `ON CONFLICT DO NOTHING`, which — unlike
 * the `DO UPDATE` a normal upsert produces — needs no UPDATE privilege on the
 * conflict columns, so it does not trip the column GRANT rule in CLAUDE.md.
 */
export function useAddOutreachDays() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddOutreachDaysParams): Promise<void> => {
      if (params.days.length === 0) return;

      const { error } = await supabase.from('outreach_days').upsert(
        params.days.map((day) => ({ outreach_id: params.outreachId, day })),
        { onConflict: 'outreach_id,day', ignoreDuplicates: true }
      );

      if (error) {
        throw new Error(error.message || 'Could not save the days for this outreach.');
      }
    },
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({ queryKey: outreachDayKeys.byOutreach(params.outreachId) });
      // `outreaches.date` is re-derived as the first day by trigger, so every
      // list and card that shows a date moves with this write.
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
    },
  });
}

/** An `application_days` row with the day it points at, which is what every screen actually wants. */
export interface CommittedDay {
  applicationId: string;
  outreachDayId: string;
  day: OutreachDay;
}

/**
 * The days ONE application promised.
 *
 * `application_days_select` shows these to the volunteer who made the
 * commitment and to the organisation running the event, and to nobody else — so
 * this is safe to call from both sides.
 */
export function useApplicationDays(applicationId: string | undefined) {
  return useQuery({
    queryKey: outreachDayKeys.commitment(applicationId ?? 'unknown'),
    enabled: !!applicationId,
    queryFn: async (): Promise<OutreachDay[]> => {
      const { data, error } = await supabase
        .from('application_days')
        .select('outreach_day_id, day:outreach_days (*)')
        .eq('application_id', applicationId!);

      if (error) {
        throw new Error(error.message || 'Could not load the days you committed to.');
      }

      const rows = (data ?? []) as unknown as { day: OutreachDay | null }[];
      return sortDays(rows.map((row) => row.day).filter((day): day is OutreachDay => !!day));
    },
  });
}

/**
 * Every commitment on one outreach, keyed by APPLICATION id — the organiser's
 * view of who promised which days.
 *
 * Fetched in one query and grouped client-side rather than per applicant, for
 * the same reason as `useOutreachDaysForMany`. The organisation can read these
 * rows for its own event under `application_days_select`.
 */
export function useOutreachCommitments(outreachId: string | undefined) {
  return useQuery({
    queryKey: outreachDayKeys.commitmentsByOutreach(outreachId ?? 'unknown'),
    enabled: !!outreachId,
    queryFn: async (): Promise<Record<string, string[]>> => {
      // Filtered through the embedded outreach day rather than by a column on
      // application_days, which carries no outreach_id of its own. The `!inner`
      // is what makes that filter apply to the parent rows instead of merely
      // nulling the embed.
      const { data, error } = await supabase
        .from('application_days')
        .select('application_id, outreach_day_id, outreach_days!inner (outreach_id)')
        .eq('outreach_days.outreach_id', outreachId!);

      if (error) {
        throw new Error(error.message || 'Could not load who committed to which days.');
      }

      const byApplication: Record<string, string[]> = {};
      for (const row of (data ?? []) as unknown as {
        application_id: string;
        outreach_day_id: string;
      }[]) {
        byApplication[row.application_id] = [
          ...(byApplication[row.application_id] ?? []),
          row.outreach_day_id,
        ];
      }
      return byApplication;
    },
  });
}
