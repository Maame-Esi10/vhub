import { useMutation, useQueryClient } from '@tanstack/react-query';
import { anchorVenue, checkIn, type AnchorVenueResponse, type CheckInResponse } from '@/lib/api-client';
import { getPositionOrNull, requirePosition } from '@/lib/geolocation';
import { attendanceKeys } from '@/hooks/useAttendance';
import { outreachKeys } from '@/hooks/useOutreaches';

/**
 * The two hooks that read the device's location.
 *
 * SPLIT OUT OF useAttendance.ts ON PURPOSE. This module reaches
 * lib/geolocation -> expo-location, a NATIVE module, so importing it costs the
 * importer that dependency: on a dev client built without expo-location the
 * import throws at module scope and takes the whole screen down. Keeping it
 * here means only the two screens that genuinely need a position pay for it,
 * and the post-event attendance screen — which needs neither camera nor GPS —
 * stays openable on any build.
 *
 * NEVER re-export this from hooks/index.ts. That barrel is imported by
 * app/_layout.tsx, so a re-export evaluates expo-location on every route and
 * every screen in the app loses its default export. That happened once already
 * (fixed at 40ce9df); the same note sits in components/ui/index.ts for
 * DateTimeField.
 */

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
