import { decodeCheckinQr, encodeCheckinQr } from '../checkin-qr';

const OUTREACH_ID = '3f1c8a52-6d4b-4e2a-9c77-1b0e5a9d4f21';
const CODE = 'b7e2d1a0-8c33-4f6e-90aa-2d5c7e8f1b44';

describe('encodeCheckinQr / decodeCheckinQr', () => {
  it('round-trips a payload', () => {
    const encoded = encodeCheckinQr({ outreachId: OUTREACH_ID, code: CODE });
    expect(decodeCheckinQr(encoded)).toEqual({ outreachId: OUTREACH_ID, code: CODE });
  });

  it('carries both the outreach id and the code', () => {
    // Neither alone is a claim to have been at the venue: the id is public
    // (it is in the feed) and the code is what proves the organiser's screen
    // was in front of the volunteer.
    const encoded = encodeCheckinQr({ outreachId: OUTREACH_ID, code: CODE });
    expect(encoded).toContain(OUTREACH_ID);
    expect(encoded).toContain(CODE);
  });
});

describe('decodeCheckinQr rejects anything that is not ours', () => {
  it('returns null for empty input', () => {
    expect(decodeCheckinQr('')).toBeNull();
    expect(decodeCheckinQr(null)).toBeNull();
    expect(decodeCheckinQr(undefined)).toBeNull();
  });

  it('returns null for a non-JSON QR', () => {
    // The everyday case: a camera pointed at a poster, a Wi-Fi code, a URL.
    expect(decodeCheckinQr('https://example.com')).toBeNull();
    expect(decodeCheckinQr('WIFI:S=clinic;T=WPA;P=hunter2;;')).toBeNull();
  });

  it('returns null for JSON without our type tag', () => {
    expect(decodeCheckinQr(JSON.stringify({ o: OUTREACH_ID, c: CODE }))).toBeNull();
    expect(
      decodeCheckinQr(JSON.stringify({ t: 'other.app', v: 1, o: OUTREACH_ID, c: CODE }))
    ).toBeNull();
  });

  it('returns null for a version it does not understand', () => {
    // A scanner meeting a future payload refuses rather than guesses: a wrong
    // guess means a volunteer believing they checked in when they did not.
    expect(
      decodeCheckinQr(JSON.stringify({ t: 'vhub.checkin', v: 2, o: OUTREACH_ID, c: CODE }))
    ).toBeNull();
  });

  it('returns null when either id is not a UUID', () => {
    expect(
      decodeCheckinQr(JSON.stringify({ t: 'vhub.checkin', v: 1, o: 'not-a-uuid', c: CODE }))
    ).toBeNull();
    expect(
      decodeCheckinQr(JSON.stringify({ t: 'vhub.checkin', v: 1, o: OUTREACH_ID, c: '123' }))
    ).toBeNull();
  });

  it('returns null when a field is missing or the wrong type', () => {
    expect(decodeCheckinQr(JSON.stringify({ t: 'vhub.checkin', v: 1, o: OUTREACH_ID }))).toBeNull();
    expect(
      decodeCheckinQr(JSON.stringify({ t: 'vhub.checkin', v: 1, o: OUTREACH_ID, c: 42 }))
    ).toBeNull();
    expect(decodeCheckinQr(JSON.stringify(['vhub.checkin', OUTREACH_ID, CODE]))).toBeNull();
    expect(decodeCheckinQr(JSON.stringify(null))).toBeNull();
  });

  it('accepts an uppercase UUID, since case is not meaningful in one', () => {
    const encoded = JSON.stringify({
      t: 'vhub.checkin',
      v: 1,
      o: OUTREACH_ID.toUpperCase(),
      c: CODE.toUpperCase(),
    });
    expect(decodeCheckinQr(encoded)).toEqual({
      outreachId: OUTREACH_ID.toUpperCase(),
      code: CODE.toUpperCase(),
    });
  });
});
