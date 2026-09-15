import * as Location from 'expo-location';

/**
 * Device location, read once and never retained.
 *
 * Separate from `lib/attendance.ts` on purpose: that module is pure and is
 * imported by the serverless API, so it must stay free of native modules. This
 * one is the device half — it does the asking, and hands over plain
 * coordinates that the pure logic then judges.
 *
 * Nothing here caches, stores, or watches a position. Every call is a single
 * point-read triggered by something the user just chose to do, which is what
 * makes the permission prompt honest.
 */

/** Matches the `ScanLocation` shape `classifyScanLocation` expects. */
export interface DevicePosition {
  latitude: number;
  longitude: number;
  /** Reported horizontal accuracy in metres, when the device supplies one. */
  accuracy: number | null;
}

/**
 * A fix has to arrive in a usable amount of time or it is not worth having.
 *
 * On a cold GPS start under cloud or indoors, `getCurrentPositionAsync` can sit
 * unresolved for a very long time. For a volunteer standing in front of a QR
 * code that would look like the app had frozen, so the wait is bounded and a
 * timeout is treated exactly like a refusal: no coordinates, check in anyway.
 */
const FIX_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

async function readPosition(): Promise<DevicePosition | null> {
  const position = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    FIX_TIMEOUT_MS
  );
  if (!position) return null;

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? null,
  };
}

/**
 * Best-effort location. Returns null on refusal, failure, or timeout — it
 * never throws and never blocks the caller from continuing.
 *
 * This is the shape the volunteer's check-in needs. Location is a corroborating
 * signal there, not a requirement: a volunteer who denies the permission, or
 * whose phone cannot get a fix, still checks in and still counts as present.
 * Penalising someone for a device limitation or poor signal would fall hardest
 * on exactly the volunteers least able to do anything about it.
 */
export async function getPositionOrNull(): Promise<DevicePosition | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) return null;
    return await readPosition();
  } catch {
    return null;
  }
}

/** Thrown by `requirePosition` — `message` is written to be shown as-is. */
export class LocationUnavailableError extends Error {
  /** True when the user actively refused, so the UI can point at Settings rather than retry. */
  readonly denied: boolean;

  constructor(message: string, denied: boolean) {
    super(message);
    this.name = 'LocationUnavailableError';
    this.denied = denied;
  }
}

/**
 * Location or an error, for the one caller that genuinely cannot proceed
 * without it: the organiser stamping the venue anchor.
 *
 * The asymmetry with `getPositionOrNull` is deliberate. A missing volunteer
 * position costs a corroborating signal and nothing else, so it is shrugged
 * off. A missing ORGANISER position means there is no venue to compare
 * anything against, so it has to be reported and retried rather than silently
 * skipped — and a silently skipped anchor would be worse than useless, since
 * the organiser would believe check-ins were being verified when they were not.
 */
export async function requirePosition(): Promise<DevicePosition> {
  let granted: boolean;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    granted = status === Location.PermissionStatus.GRANTED;
  } catch {
    throw new LocationUnavailableError(
      'VHub could not access location on this device.',
      false
    );
  }

  if (!granted) {
    throw new LocationUnavailableError(
      'VHub needs location permission to mark where the venue is. You can enable it in Settings.',
      true
    );
  }

  const position = await readPosition();
  if (!position) {
    throw new LocationUnavailableError(
      'Could not get a location fix. Step outside or near a window and try again.',
      false
    );
  }
  return position;
}
