/**
 * Attendance check-in logic (owner decision, 2026-08-05).
 *
 * PURE. No I/O. The serverless check-in endpoint imports this rather than
 * re-deriving it, so the rule that decides whether someone is marked present
 * is unit-testable and lives in exactly one place.
 *
 * The model is layered verification with graceful degradation. The QR is the
 * primary signal -- you can only scan it where the organiser is displaying it,
 * so the organiser's physical presence at the venue does the work that GPS
 * infrastructure would otherwise have to. The known weakness is that a code
 * can travel: someone at the venue photographs the QR and sends it to a friend
 * at home. The silent location check closes that hole without asking the
 * volunteer to do anything extra.
 *
 * PRIVACY: coordinates passed into `classifyScanLocation` are read once, in
 * memory, at the moment the volunteer chooses to scan. Nothing here stores
 * them, and the `attendance` table has no column that could. Only the returned
 * verdict is ever persisted. This is a single consented point-check, not
 * tracking.
 */

/** The verdict persisted on `attendance.location_check`. */
export type LocationCheck = 'not_checked' | 'confirmed' | 'unavailable' | 'mismatch';

/**
 * Distance within which a scan is taken as agreeing with the venue.
 *
 * Generous on purpose. Outreach venues are compounds, schools and market
 * grounds rather than points, phone GPS in the target context is often
 * several hundred metres out, and the cost of the two errors is asymmetric:
 * wrongly confirming a present volunteer costs nothing, wrongly doubting one
 * costs them an accusation.
 */
export const CONFIRM_RADIUS_METRES = 2_000;

/**
 * Beyond this, a scan is treated as clearly contradicting the venue.
 *
 * The gap between the two thresholds is deliberate and is where the design's
 * bias lives. Anything from 2km to 50km is ambiguous -- a large rural
 * catchment, a bad fix, a volunteer scanning from the car park of the wrong
 * building -- and resolves to `unavailable`, which still counts as PRESENT.
 * We would rather let a handful of remote scans through than accuse an honest
 * volunteer on the strength of a GPS reading.
 *
 * WHY 50km, and why this is a district question wearing a distance costume:
 * the meaningful claim is "this person is certainly not in the venue's
 * district", not "this person is more than N km away". Ghana's 261 districts
 * vary enormously -- a Greater Accra district may be 15km across while a
 * Savannah or Northern one exceeds 100km -- so the threshold is set above the
 * span of all but the largest, which is what makes a mismatch mean something.
 * Erring high is the correct direction: in a big rural district a tighter
 * radius would flag volunteers who are genuinely on site, which is precisely
 * the false no-show this design exists to avoid.
 *
 * A true district test (reverse-geocode the scan, compare to
 * outreaches.district) would be sharper still, but it needs either a
 * geocoding service or district boundary polygons. Both put an external
 * dependency in the check-in path -- the one place that must never fail
 * closed -- so it stays the documented upgrade, not the current rule.
 */
export const MISMATCH_RADIUS_METRES = 50_000;

/**
 * A fix looser than this tells us nothing useful at the radii above, so it is
 * treated as no fix at all rather than being reasoned with.
 */
export const MAX_USABLE_ACCURACY_METRES = 1_000;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Whether a stored venue anchor may be trusted for an event on `eventDate`.
 *
 * The anchor is captured from the ORGANISER's device, which is the only
 * privacy-safe source: a volunteer's scan coordinates can never become the
 * venue, because storing them is exactly what `attendance`'s shape forbids.
 * But an organiser-supplied anchor has one bad failure -- opening the QR
 * screen at home the night before anchors the wrong place, and then every
 * genuine on-site scan is 20km out and the whole event lands in the exception
 * list. That inverts the system: honest volunteers get flagged en masse.
 *
 * The guard is that an anchor only counts if it was captured ON THE EVENT'S
 * OWN DAY. A stale anchor is not "close enough", it is discarded, and every
 * scan then resolves to `unavailable` -- still PRESENT, just unverified. The
 * failure mode is therefore losing a verification signal, never fabricating a
 * contradiction.
 *
 * Both dates are compared as calendar days in UTC (Ghana is UTC+0), matching
 * how `outreaches.date` is stored and how layer1.ts parses it.
 */
export function isVenueAnchorUsable(
  anchoredAt: string | null | undefined,
  eventDate: string | null | undefined
): boolean {
  if (!anchoredAt || !eventDate) return false;

  const anchored = new Date(anchoredAt);
  if (Number.isNaN(anchored.getTime())) return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(eventDate.trim());
  if (!match) return false;

  return (
    anchored.getUTCFullYear() === Number(match[1]) &&
    anchored.getUTCMonth() + 1 === Number(match[2]) &&
    anchored.getUTCDate() === Number(match[3])
  );
}

export interface ScanLocation extends Coordinates {
  /** Reported horizontal accuracy in metres, if the device supplied one. */
  accuracy?: number | null;
}

const EARTH_RADIUS_METRES = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance in metres (haversine).
 *
 * Spherical rather than ellipsoidal: the error is well under 1% at any
 * distance that matters here, which is nothing against a 2km threshold.
 */
export function distanceInMetres(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isUsableCoordinate(point: Coordinates | null | undefined): point is Coordinates {
  if (!point) return false;
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return false;
  if (point.latitude < -90 || point.latitude > 90) return false;
  if (point.longitude < -180 || point.longitude > 180) return false;
  // (0, 0) is in the Atlantic and is what a zeroed/failed fix reports. No
  // Ghanaian venue is there, and treating it as real would fabricate a
  // mismatch for a device that simply failed.
  if (point.latitude === 0 && point.longitude === 0) return false;
  return true;
}

/**
 * The silent location check.
 *
 * Returns `unavailable` -- which still counts as PRESENT -- whenever the
 * comparison cannot be made honestly: location denied, unavailable, too
 * imprecise, or the organiser never anchored the venue. That last case matters
 * more than it looks: it means a volunteer is never penalised for something
 * the ORGANISER did not do.
 */
export function classifyScanLocation(
  scan: ScanLocation | null | undefined,
  venue: Coordinates | null | undefined
): LocationCheck {
  if (!isUsableCoordinate(venue)) return 'unavailable';
  if (!isUsableCoordinate(scan)) return 'unavailable';

  const accuracy = scan.accuracy;
  if (typeof accuracy === 'number' && Number.isFinite(accuracy)) {
    if (accuracy < 0 || accuracy > MAX_USABLE_ACCURACY_METRES) return 'unavailable';
  }

  const distance = distanceInMetres(scan, venue);

  // Spend the device's own stated error budget in the volunteer's favour: a
  // fix accurate to 400m sitting 2.3km out could genuinely be inside the
  // radius, so widen the ring by the accuracy rather than doubting them.
  const tolerance = typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > 0
    ? accuracy
    : 0;

  if (distance <= CONFIRM_RADIUS_METRES + tolerance) return 'confirmed';
  if (distance > MISMATCH_RADIUS_METRES) return 'mismatch';
  return 'unavailable';
}

/**
 * Whether a location verdict should land in the organiser's exception list.
 * Only a clear contradiction does; everything else is quietly recorded.
 */
export function needsOrganiserReview(check: LocationCheck): boolean {
  return check === 'mismatch';
}

/** Minimal shape of an `attendance` row this logic needs. */
export interface AttendanceState {
  checked_in_at?: string | null;
  organiser_status?: 'present' | 'absent' | null;
}

/**
 * The effective answer to "did they attend?", mirroring the
 * `attendance_is_present` SQL function so client and database never disagree.
 *
 * DEFAULT PRESENT. Someone who never scanned and whom the organiser never
 * resolved still counts as present, because the organiser only actively flags
 * real no-shows. Absence is always an explicit human judgement -- never an
 * inference from silence, which would turn a flat phone into a -15 penalty.
 */
export function isPresent(row: AttendanceState | null | undefined): boolean {
  if (row?.organiser_status) return row.organiser_status === 'present';
  return true;
}

/**
 * Whether the organiser still has to make a call on this person: they never
 * scanned, or their scan contradicted the venue, and nobody has resolved it.
 * Everyone else is already settled and needs no attention at all -- which is
 * the entire point of an exception list.
 */
export function needsAction(
  row: (AttendanceState & { location_check?: LocationCheck | null }) | null | undefined
): boolean {
  if (row?.organiser_status) return false;
  if (!row?.checked_in_at) return true;
  return row.location_check === 'mismatch';
}

/**
 * How many of a volunteer's DAYS on an outreach they were present for.
 *
 * `days` is every day they COMMITTED to; `rowsByDay` is what is known about
 * each. A day with no row counts as present, for exactly the reason `isPresent`
 * defaults that way — the organiser flags real no-shows, and silence is not a
 * judgement.
 *
 * Counted against the commitment rather than the event's span, which is the
 * whole multi-day rule: four Saturdays attended out of four committed is a
 * complete record, not four out of twenty-six.
 */
export function daysPresent(
  committedDayIds: readonly string[],
  rowsByDay: Readonly<Record<string, AttendanceState>>
): number {
  return committedDayIds.filter((dayId) => isPresent(rowsByDay[dayId])).length;
}

/**
 * Whether a volunteer should open in the review sheet as a NO-SHOW.
 *
 * True only when the organiser resolved them absent on at least one day and
 * they were never present on any of the days they committed to. Someone who
 * came on three days of four is not a no-show, and seeding the review that way
 * would put a -15 in front of an organiser as the starting position for a
 * volunteer who mostly turned up.
 *
 * Days never committed to are not consulted at all, and an unresolved day is
 * not evidence of anything — the same rule as an unrated review moving nothing.
 */
export function markedAbsentThroughout(
  committedDayIds: readonly string[],
  rowsByDay: Readonly<Record<string, AttendanceState>>
): boolean {
  const rows = committedDayIds
    .map((dayId) => rowsByDay[dayId])
    .filter((row): row is AttendanceState => !!row);

  if (rows.length === 0) return false;
  if (rows.some((row) => row.organiser_status === 'present' || row.checked_in_at)) return false;
  return rows.some((row) => row.organiser_status === 'absent');
}
