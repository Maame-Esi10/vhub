import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  anchorVenue,
  checkIn,
  type AnchorVenueResponse,
  type CheckInResponse,
} from '@/lib/api-client';
import { getPositionOrNull, requirePosition } from '@/lib/geolocation';
import { supabase } from '@/lib/supabase';
import { outreachKeys } from '@/hooks/useOutreaches';
import type { Attendance } from '@/types/database';

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
 * Stamps the venue anchor from the organiser's device.
 *
 * Location is REQUIRED here and the failure is surfaced, unlike on the
 * volunteer's side where a missing fix is shrugged off: without the
 * organiser's position there is nothing for any scan to be compared against,
 * and an anchor that failed silently would leave an organiser believing
 * check-ins were being verified when they were not.
 */
export function useAnchorVenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (outreachId: string): Promise<AnchorVenueResponse> => {
      const position = await requirePosition();
      return anchorVenue(outreachId, position.latitude, position.longitude);
    },
    onSuccess: (_result, outreachId) => {
      // venue_anchored_at just moved, and the QR screen reads it off the
      // outreach to say whether the anchor will actually be honoured.
      queryClient.invalidateQueries({ queryKey: outreachKeys.detail(outreachId) });
    },
  });
}

export interface CheckInParams {
  outreachId: string;
  /** The secret decoded from the scanned QR. */
  checkinCode: string;
}

/**
 * Records the volunteer's check-in from a scanned QR.
 *
 * The location read is BEST-EFFORT and deliberately cannot fail the check-in:
 * `getPositionOrNull` swallows refusal, failure and timeout alike, and the
 * request simply goes without coordinates. A volunteer is never blocked, or
 * marked down, for a permission they declined or a fix their phone could not
 * get — that would penalise exactly the people least able to do anything about
 * it. The coordinates, when there are any, are compared to the venue anchor
 * server-side and then dropped; only the verdict is stored.
 */
export function useCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CheckInParams): Promise<CheckInResponse> => {
      const position = await getPositionOrNull();
      return checkIn({
        outreachId: params.outreachId,
        checkinCode: params.checkinCode,
        latitude: position?.latitude,
        longitude: position?.longitude,
        accuracy: position?.accuracy ?? undefined,
      });
    },
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.mine(params.outreachId) });
      queryClient.invalidateQueries({ queryKey: attendanceKeys.byOutreach(params.outreachId) });
    },
  });
}
