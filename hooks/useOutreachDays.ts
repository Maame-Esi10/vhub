import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { outreachKeys } from '@/hooks/useOutreaches';
import { scoreEventKeys } from '@/hooks/useScoreEvents';
import { recordLateRelease } from '@/lib/api-client';
import { sortDayStrings, sortDays, type OutreachDayDraft } from '@/lib/outreachDays';
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
  /**
   * Every day the outreach runs on, first day included, each with its own
   * hours. Already-present days are skipped.
   */
  days: OutreachDayDraft[];
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

      // Hours ride along on the INSERT, so a day that runs to its own goes in
      // complete. `start_time` and `end_time` are both in the INSERT grant list
      // (see 20260818_multi_day_app_support.sql), and null is the ordinary
      // value -- it is what "inherit the event's hours" is stored as.
      //
      // This does NOT cover the FIRST day. That row is written by
      // `trg_outreaches_default_day` in the same transaction as the outreach
      // itself, always with null hours, so an override on day one is applied
      // afterwards by `useSetOutreachDayHours`.
      const { error } = await supabase.from('outreach_days').upsert(
        params.days.map((draft) => ({
          outreach_id: params.outreachId,
          day: draft.day,
          start_time: draft.startTime,
          end_time: draft.endTime,
        })),
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

export interface SetOutreachDayHoursParams {
  outreachId: string;
  /**
   * Only the days whose hours have actually changed — `changedDayHours()`
   * produces exactly this list. Null on either field means "inherit the
   * event's hours", and clearing an override is sending nulls, not omitting
   * the day.
   */
  days: OutreachDayDraft[];
}

/**
 * Writes a day's own hours, for the days that have any.
 *
 * WHY IT IS A SEPARATE WRITE FROM `save_outreach()`, and why that is acceptable
 * here when it was not for the roles. `save_outreach` exists because
 * `outreaches.role_type` and `slots_total` are DERIVED from the role rows, so a
 * role write that failed after the details had been saved left an outreach
 * describing a requirement it no longer enforced. Nothing on `outreaches` is
 * derived from a day's hours: they are an override read through `dayStartTime`
 * / `dayEndTime`, and a write that fails leaves every day inheriting the
 * event's hours — which is visible on the screen and is exactly the state the
 * outreach was in a moment earlier. The same argument the gallery makes.
 *
 * ONE UPDATE PER DAY, NOT AN UPSERT. `.upsert(..., { onConflict:
 * 'outreach_id,day' })` compiles to `ON CONFLICT DO UPDATE SET` over every
 * payload column, the conflict columns included — and `outreach_id` is
 * deliberately absent from `outreach_days`' UPDATE grant list, because a day
 * may be re-timed but never moved to another event. The upsert would therefore
 * fail with `permission denied for table outreach_days` on a call that looks
 * entirely reasonable. See the `.upsert()` rule in CLAUDE.md.
 *
 * The loop is bounded by how many days an organisation actually re-timed, which
 * is nearly always none and never more than MAX_OUTREACH_DAYS.
 */
export function useSetOutreachDayHours() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SetOutreachDayHoursParams): Promise<void> => {
      for (const draft of params.days) {
        const { error } = await supabase
          .from('outreach_days')
          .update({ start_time: draft.startTime, end_time: draft.endTime })
          .eq('outreach_id', params.outreachId)
          .eq('day', draft.day);

        if (error) {
          throw new Error(error.message || 'Could not save the hours for one of the days.');
        }
      }
    },
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({ queryKey: outreachDayKeys.byOutreach(params.outreachId) });
      // Nothing on `outreaches` moves with this, but the detail and feed cards
      // read the day rows to show a span and its hours.
      queryClient.invalidateQueries({ queryKey: outreachDayKeys.all });
    },
  });
}

/**
 * How many ACCEPTED volunteers are still committed to each day, for many
 * outreaches at once — keyed outreach id → day id → count.
 *
 * This is the derived half of the day-shortfall picture (lib/dayCoverage.ts).
 * Nothing is stored: `slots_filled` counts accepted PEOPLE, so once a volunteer
 * can release one day of an outreach the event can read "5 of 5 filled" while a
 * day of it has four. Counting live commitments per day answers that without a
 * new column to keep in step.
 *
 * `!inner` on applications is what makes the status and outreach filters apply
 * to the parent rows rather than merely nulling the embed — the same trick
 * `useOutreachCommitments` needs, and the same trap if it is left off.
 */
export function useDayCoverageForMany(outreachIds: readonly string[]) {
  const key = [...outreachIds].sort().join(',');

  return useQuery({
    queryKey: [...outreachDayKeys.all, 'coverage', key] as const,
    enabled: outreachIds.length > 0,
    queryFn: async (): Promise<Record<string, Record<string, number>>> => {
      const { data, error } = await supabase
        .from('application_days')
        .select('outreach_day_id, applications!inner (outreach_id, status)')
        .in('applications.outreach_id', outreachIds as string[])
        .eq('applications.status', 'accepted')
        // A released day is not a commitment, which is the entire point: it is
        // what makes a day go short while the event still reads full.
        .is('released_at', null);

      if (error) {
        throw new Error(error.message || 'Could not work out how each day is staffed.');
      }

      const byOutreach: Record<string, Record<string, number>> = {};
      for (const row of (data ?? []) as unknown as {
        outreach_day_id: string;
        applications: { outreach_id: string } | null;
      }[]) {
        const outreachId = row.applications?.outreach_id;
        if (!outreachId) continue;
        const days = (byOutreach[outreachId] ??= {});
        days[row.outreach_day_id] = (days[row.outreach_day_id] ?? 0) + 1;
      }
      return byOutreach;
    },
  });
}

/**
 * What releasing a day cost, so the screen can say so rather than leaving the
 * volunteer to find it on their feedback screen later.
 *
 * `penalty` is 0 for an on-time release, one inside the free allowance, a
 * take-back, or a volunteer who did not hold an accepted place — and also when
 * the call could not be made at all. The screen must therefore say nothing
 * about a score when it is 0, never "that cost you 0 points".
 */
export interface ReleaseDayResult {
  /** Negative when something was deducted, 0 otherwise. */
  penalty: number;
  /** The score after the deduction, when there was one. */
  newScore: number | null;
}

export interface ReleaseDayParams {
  applicationId: string;
  outreachDayId: string;
  /** True releases the day; false takes it back on while it is still ahead. */
  release: boolean;
  /** Used to refresh the right caches, and to name the outreach to the server. */
  outreachId: string;
  /**
   * Needed only so the server can be told who released the day. Omitting it
   * skips the deduction call entirely — the nightly sweep would still catch it,
   * which is why this is optional rather than required.
   */
  volunteerId?: string;
}

/**
 * Drops a day a volunteer had committed to, or takes it back on.
 *
 * A RELEASE IS AN UPDATE, NEVER A DELETE. The row stays and records when the
 * release happened and whether it was late, because that is the evidence a
 * V-Score is later derived from — a deleted row cannot be told apart from a day
 * that was never promised.
 *
 * The client writes only `released_at`, and cannot even choose its value
 * usefully: `trg_application_days_stamp_release` overwrites it with `now()` and
 * derives `late_release` itself, against THAT DAY's start rather than the
 * event's first day. `late_release` is absent from the client's grant list
 * entirely, so a volunteer cannot declare their own lateness.
 *
 * Three refusals come back from that trigger as ordinary errors, and their
 * messages are written to be shown as they are:
 *   - releasing a day that has already started (that is a no-show, not a
 *     cancellation, and belongs to attendance at -15);
 *   - taking back a day that has already started;
 *   - releasing the LAST day still ahead of them, which is withdrawing from the
 *     outreach and has to go through the withdrawal path so the organisation is
 *     told and the waitlist is offered the place.
 */
export function useReleaseCommittedDay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReleaseDayParams): Promise<ReleaseDayResult> => {
      const { error } = await supabase
        .from('application_days')
        .update({ released_at: params.release ? new Date().toISOString() : null })
        .eq('application_id', params.applicationId)
        .eq('outreach_day_id', params.outreachDayId);

      if (error) {
        throw new Error(
          error.message ||
            (params.release ? 'Could not release that day.' : 'Could not take that day back on.')
        );
      }

      /*
        TELL THE SERVER, and let it decide whether anything is owed.

        The client deliberately does not work out whether this release was late,
        how many days were promised, or how many late releases came before it.
        Every one of those is a term in the deduction, and anything the client
        could name it could choose. The endpoint re-reads the lot from rows the
        client cannot write — including `application_days.late_release`, which
        the database stamps and the client has no grant on — and charges nothing
        at all if the release was on time, inside the free allowance, or made by
        somebody who did not hold an accepted place.

        BEST-EFFORT, and safe as such. The release itself has already succeeded
        and must not be reported as failed because a deduction could not be
        recorded; and the nightly sweep re-checks every late release that has no
        deduction against it, so a call that never arrived is caught within a
        day rather than lost. The deduction is deduplicated on the released day
        AND the moment it was released, so the sweep cannot charge it twice.
      */
      if (params.release && params.volunteerId) {
        try {
          const result = await recordLateRelease({
            outreachId: params.outreachId,
            volunteerId: params.volunteerId,
            applicationId: params.applicationId,
            outreachDayId: params.outreachDayId,
          });
          return { penalty: result.penalty, newScore: result.newScore ?? null };
        } catch (penaltyError) {
          console.warn(
            '[outreachDays] day released, but the V-Score check could not run:',
            penaltyError instanceof Error ? penaltyError.message : penaltyError
          );
        }
      }

      return { penalty: 0, newScore: null };
    },
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({ queryKey: outreachDayKeys.all });
      queryClient.invalidateQueries({ queryKey: outreachKeys.detail(params.outreachId) });
      // The count behind the late-cancellation warning moves with this.
      queryClient.invalidateQueries({ queryKey: [...outreachDayKeys.all, 'late-releases'] });
      // A late release may have just moved the score and written a row the
      // volunteer can read on My feedback.
      queryClient.invalidateQueries({ queryKey: scoreEventKeys.all });
    },
  });
}

/**
 * How many late cancellations this volunteer has made recently.
 *
 * Read through the `count_recent_late_releases` function rather than counted in
 * the app, because the window is a rule rather than a display choice and both
 * sides must agree on it. Rolling rather than lifetime: somebody unreliable
 * last year and dependable since is dependable, and a lifetime counter can
 * never be worked off.
 *
 * Feeds the WARNING only. No score moves on it — the deduction is a V-Score
 * formula change and is gated.
 */
export function useMyLateReleaseCount(volunteerId: string | undefined) {
  return useQuery({
    queryKey: [...outreachDayKeys.all, 'late-releases', volunteerId ?? 'unknown'] as const,
    enabled: !!volunteerId,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('count_recent_late_releases', {
        p_volunteer_id: volunteerId!,
      });
      if (error) {
        // Not fatal: a missing count means the warning is written for a first
        // offence, which is the gentler of the two and never overstates.
        return 0;
      }
      return typeof data === 'number' ? data : 0;
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
        .eq('application_id', applicationId!)
        // Released days are still rows, deliberately, but they are no longer a
        // commitment: nothing that COUNTS days may see them. Only the audit
        // reads a released row.
        .is('released_at', null);

      if (error) {
        throw new Error(error.message || 'Could not load the days you committed to.');
      }

      const rows = (data ?? []) as unknown as { day: OutreachDay | null }[];
      return sortDays(rows.map((row) => row.day).filter((day): day is OutreachDay => !!day));
    },
  });
}

/**
 * The days MANY of the volunteer's own applications promised, keyed by
 * application id — the list screens' version of `useApplicationDays`.
 *
 * One `.in()` rather than one query per row, the same batching as
 * `useOutreachDaysForMany`: the applications tracker and the schedule both
 * render every application a volunteer has, and a query per card would turn
 * either screen into dozens of round trips.
 *
 * Returns the day STRINGS rather than the rows, because that is all a card
 * needs to say "you are on 2 of 4 days" and it keeps the shape small enough to
 * sit in the persisted query cache without carrying whole day records around.
 */
export function useApplicationDaysForMany(applicationIds: readonly string[]) {
  const key = [...applicationIds].sort().join(',');

  return useQuery({
    queryKey: [...outreachDayKeys.all, 'commitments-many', key] as const,
    enabled: applicationIds.length > 0,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await supabase
        .from('application_days')
        .select('application_id, day:outreach_days (day)')
        .in('application_id', applicationIds as string[])
        .is('released_at', null);

      if (error) {
        throw new Error(error.message || 'Could not load the days you committed to.');
      }

      const byApplication: Record<string, string[]> = {};
      for (const row of (data ?? []) as unknown as {
        application_id: string;
        day: { day: string } | null;
      }[]) {
        if (!row.day) continue;
        byApplication[row.application_id] = [
          ...(byApplication[row.application_id] ?? []),
          row.day.day,
        ];
      }

      // Sorted here rather than by the query, because the order that matters is
      // the DAY's, and the day is on the embedded row rather than on
      // application_days itself.
      for (const id of Object.keys(byApplication)) {
        byApplication[id] = sortDayStrings(byApplication[id]!);
      }
      return byApplication;
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
        .eq('outreach_days.outreach_id', outreachId!)
        // The organiser's roster for a day must not list somebody who released
        // it — offering to mark them absent for a day they formally dropped is
        // the failure this filter prevents.
        .is('released_at', null);

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
