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

/** The signed-in volunteer's own attendance row for one outreach, or null if they never checked in. */
export function useMyAttendance(outreachId: string | undefined, volunteerId: string | undefined) {
  return useQuery({
    queryKey: attendanceKeys.mine(outreachId ?? 'unknown'),
    enabled: !!outreachId && !!volunteerId,
    queryFn: async (): Promise<Attendance | null> => {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('outreach_id', outreachId!)
        .eq('volunteer_id', volunteerId!)
        .maybeSingle();

      if (error) {
        throw new Error(error.message || 'Could not load your check-in for this outreach.');
      }
      return (data as Attendance | null) ?? null;
    },
  });
}

/**
 * Every attendance row for one outreach, keyed by volunteer id.
 *
 * Keyed by volunteer id rather than an array because the caller joins it against the accepted
 * applicants: the roster is the list of people, and attendance is what is
 * KNOWN about each of them so far. Most will have no row at all — that is not
 * a gap to fill in, it is the ordinary state of someone who has not scanned,
 * and it still reads as present.
 *
 * `attendance_select_own_or_org` scopes this to the outreach's owner, so an
 * organisation sees its own event and nothing else.
 */
export function useOutreachAttendance(outreachId: string | undefined) {
  return useQuery({
    queryKey: attendanceKeys.byOutreach(outreachId ?? 'unknown'),
    enabled: !!outreachId,
    queryFn: async (): Promise<Record<string, Attendance>> => {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('outreach_id', outreachId!);

      if (error) {
        throw new Error(error.message || 'Could not load attendance for this outreach.');
      }

      const byVolunteer: Record<string, Attendance> = {};
      for (const row of (data ?? []) as Attendance[]) {
        byVolunteer[row.volunteer_id] = row;
      }
      return byVolunteer;
    },
  });
}

export interface ResolveAttendanceParams {
  outreachId: string;
  volunteerId: string;
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
      resolveAttendance(params.outreachId, params.volunteerId, params.status, params.note),
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.byOutreach(params.outreachId) });
      queryClient.invalidateQueries({ queryKey: attendanceKeys.mine(params.outreachId) });
      // A no-show penalty may have moved the volunteer's V-Score, which the
      // applicant cards on the same outreach display.
      queryClient.invalidateQueries({ queryKey: applicationKeys.byOutreach(params.outreachId) });
    },
  });
}
