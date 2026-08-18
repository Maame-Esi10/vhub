import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resolveAttendance, type ResolveAttendanceResponse } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { applicationKeys } from '@/hooks/useApplications';
import type { Attendance, OrganiserAttendanceStatus } from '@/types/database';

/**
 * Attendance reads, and the organiser's resolve write.
 *
 * NO NATIVE MODULES IN THIS FILE, deliberately. The two hooks that need the
 * device's location live in hooks/useCheckInScan.ts instead, because importing
 * expo-location here would mean the post-event attendance screen — which needs
 * neither camera nor GPS — could not even open on a dev client built without
 * it. Keep it that way: anything touching expo-* belongs in that module.
 */

export const attendanceKeys = {
  all: ['attendance'] as const,
  code: (outreachId: string) => [...attendanceKeys.all, 'code', outreachId] as const,
  byOutreach: (outreachId: string) => [...attendanceKeys.all, 'outreach', outreachId] as const,
  mine: (outreachId: string) => [...attendanceKeys.all, 'mine', outreachId] as const,
};

/**
 * Attendance for one outreach, keyed by volunteer and then by DAY.
 *
 * Two levels because attendance is now per day: `byVolunteerAndDay[volunteerId]
 * [outreachDayId]`. A volunteer with no entry at all never scanned and has
 * never been resolved on any day, which is the ordinary state of most people
 * and still reads as present.
 */
export type AttendanceByVolunteerAndDay = Record<string, Record<string, Attendance>>;

/**
 * The check-in code for one of the organisation's own outreaches — the secret
 * the QR encodes.
 *
 * Read straight from Supabase rather than through the API because
 * `outreach_checkin_codes_select_owner` already answers the only question that
 * matters: a non-owner selecting this table gets zero rows. That the query is
 * safe to make from a client at all is the point of the table existing — the
 * code used to be a column on `outreaches`, whose rows every authenticated
 * user can read, so it was readable by every volunteer. See
 * supabase/migrations/20260807_checkin_code_isolation.sql.
 *
 * `staleTime: Infinity` because the code is never rotated; refetching would
 * only mean re-rendering an identical QR while an organiser holds up a phone.
 */
export function useOutreachCheckinCode(outreachId: string | undefined) {
  return useQuery({
    queryKey: attendanceKeys.code(outreachId ?? 'unknown'),
    enabled: !!outreachId,
    staleTime: Infinity,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('outreach_checkin_codes')
        .select('code')
        .eq('outreach_id', outreachId!)
        .maybeSingle();

      if (error) {
        throw new Error(error.message || 'Could not load the check-in code for this outreach.');
      }
      if (!data) {
        // Zero rows means either "not yours" or a row that was never issued.
        // Both are dead ends for this screen and neither is worth telling an
        // organiser apart, since only one of them can happen to them.
        throw new Error('No check-in code exists for this outreach.');
      }
      return data.code as string;
    },
  });
}

/**
 * The signed-in volunteer's own attendance rows for one outreach, keyed by day.
 *
 * A LIST, not a row: attendance is per day, so a volunteer on a four-day
 * campaign has up to four. An empty map means they have never checked in to any
 * day of it.
 */
export function useMyAttendance(outreachId: string | undefined, volunteerId: string | undefined) {
  return useQuery({
    queryKey: attendanceKeys.mine(outreachId ?? 'unknown'),
    enabled: !!outreachId && !!volunteerId,
    queryFn: async (): Promise<Record<string, Attendance>> => {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('outreach_id', outreachId!)
        .eq('volunteer_id', volunteerId!);

      if (error) {
        throw new Error(error.message || 'Could not load your check-in for this outreach.');
      }

      const byDay: Record<string, Attendance> = {};
      for (const row of (data ?? []) as Attendance[]) {
        byDay[row.outreach_day_id] = row;
      }
      return byDay;
    },
  });
}

/**
 * Every attendance row for one outreach, keyed by volunteer and then by day.
 *
 * Keyed rather than an array because the caller joins it against the accepted
 * applicants: the roster is the list of people, and attendance is what is
 * KNOWN about each of them so far. Most will have no row at all — that is not
 * a gap to fill in, it is the ordinary state of someone who has not scanned,
 * and it still reads as present.
 *
 * THE SECOND LEVEL IS THE MULTI-DAY CHANGE. This used to be one row per
 * volunteer, which is exactly what stopped being true when
 * 20260812_multi_day_outreaches.sql made the unique key (outreach, volunteer,
 * day): flattening several days back into one entry would have shown the
 * organiser whichever day the database happened to return last.
 *
 * `attendance_select_own_or_org` scopes this to the outreach's owner, so an
 * organisation sees its own event and nothing else.
 */
export function useOutreachAttendance(outreachId: string | undefined) {
  return useQuery({
    queryKey: attendanceKeys.byOutreach(outreachId ?? 'unknown'),
    enabled: !!outreachId,
    queryFn: async (): Promise<AttendanceByVolunteerAndDay> => {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('outreach_id', outreachId!);

      if (error) {
        throw new Error(error.message || 'Could not load attendance for this outreach.');
      }

      const byVolunteerAndDay: AttendanceByVolunteerAndDay = {};
      for (const row of (data ?? []) as Attendance[]) {
        const forVolunteer = byVolunteerAndDay[row.volunteer_id] ?? {};
        forVolunteer[row.outreach_day_id] = row;
        byVolunteerAndDay[row.volunteer_id] = forVolunteer;
      }
      return byVolunteerAndDay;
    },
  });
}

/**
 * The slice of `useOutreachAttendance` for ONE day, keyed by volunteer — the
 * shape the attendance screen actually works in, since an organiser resolves
 * one day at a time.
 *
 * A plain selector rather than another query, so the screen's day switcher
 * costs no network at all.
 */
export function attendanceForDay(
  byVolunteerAndDay: AttendanceByVolunteerAndDay,
  outreachDayId: string | undefined
): Record<string, Attendance> {
  if (!outreachDayId) return {};

  const forDay: Record<string, Attendance> = {};
  for (const [volunteerId, days] of Object.entries(byVolunteerAndDay)) {
    const row = days[outreachDayId];
    if (row) forDay[volunteerId] = row;
  }
  return forDay;
}

export interface ResolveAttendanceParams {
  outreachId: string;
  volunteerId: string;
  /**
   * Which day the decision is about. Optional only for a single-day outreach,
   * where the server fills it in because there was nothing to choose; on
   * anything longer, omitting it is refused rather than guessed.
   */
  outreachDayId?: string;
  status: OrganiserAttendanceStatus;
  note?: string;
}

/**
 * The organiser's final word on one volunteer.
 *
 * Goes through /api/checkin rather than writing `attendance` directly, and it
 * has to: `authenticated` holds no insert/update policy or privilege on that
 * table, because the row is the evidence a V-Score is later derived from and
 * must not be forgeable by either party.
 *
 * Marking someone absent moves NO V-Score by itself (owner decision,
 * 2026-08-07). The -15 lands when the organisation files the post-event review
 * with `attended: false`, so exactly one path can change a score.
 *
 * Available for ANYONE on the roster, not only the people who failed to scan.
 * No automated signal ever overrules a human who was physically at the event —
 * a scan is evidence, not a verdict.
 */
export function useResolveAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ResolveAttendanceParams): Promise<ResolveAttendanceResponse> =>
      resolveAttendance({
        outreachId: params.outreachId,
        volunteerId: params.volunteerId,
        outreachDayId: params.outreachDayId,
        status: params.status,
        note: params.note,
      }),
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.byOutreach(params.outreachId) });
      queryClient.invalidateQueries({ queryKey: attendanceKeys.mine(params.outreachId) });
      // A no-show penalty may have moved the volunteer's V-Score, which the
      // applicant cards on the same outreach display.
      queryClient.invalidateQueries({ queryKey: applicationKeys.byOutreach(params.outreachId) });
    },
  });
}
