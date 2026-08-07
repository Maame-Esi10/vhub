/**
 * The wire format of the check-in QR.
 *
 * PURE. No I/O. Both halves of the feature depend on this one file agreeing
 * with itself — the organisation's screen encodes, the volunteer's scanner
 * decodes — so it lives apart from either and is unit-tested directly.
 *
 * The payload carries the outreach id AND the secret code. Neither alone is
 * enough: an outreach id is public (it is in the feed), and the code is
 * verified server-side against `outreach_checkin_codes`, which only the owning
 * organisation can read. Possessing the pair is the claim "I was standing in
 * front of the organiser's screen".
 */

/** A decoded, structurally valid check-in QR. */
export interface CheckinQrPayload {
  outreachId: string;
  code: string;
}

/**
 * Marks a QR as ours. A camera sees every code in view — a Wi-Fi QR, a product
 * barcode, a poster's URL — and this tag is what lets the scanner reject those
 * quietly instead of firing a check-in request at whatever it happened to read.
 */
const QR_TYPE = 'vhub.checkin';

/**
 * Bumped only if the payload's meaning changes. A scanner that meets a version
 * it does not know refuses it rather than guessing, because a wrong guess here
 * means a volunteer believing they checked in when they did not.
 */
const QR_VERSION = 1;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Serialises the payload a QR should contain. */
export function encodeCheckinQr(payload: CheckinQrPayload): string {
  return JSON.stringify({
    t: QR_TYPE,
    v: QR_VERSION,
    o: payload.outreachId,
    c: payload.code,
  });
}

/**
 * Parses a scanned string, or returns null if it is not a check-in QR this
 * version understands.
 *
 * Returns null rather than throwing, and never distinguishes "not ours" from
 * "malformed": the scanner's response to both is identical — keep scanning —
 * and a caller that cannot tell them apart cannot accidentally treat one as
 * the other.
 *
 * Both ids are checked against the UUID shape here so a malformed code fails at
 * the camera, in the volunteer's hand, rather than as a 400 from the API after
 * a round trip.
 */
export function decodeCheckinQr(raw: string | null | undefined): CheckinQrPayload | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const { t, v, o, c } = parsed as Record<string, unknown>;

  if (t !== QR_TYPE) return null;
  if (v !== QR_VERSION) return null;
  if (typeof o !== 'string' || !UUID_PATTERN.test(o)) return null;
  if (typeof c !== 'string' || !UUID_PATTERN.test(c)) return null;

  return { outreachId: o, code: c };
}
