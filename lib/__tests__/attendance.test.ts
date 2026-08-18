import {
  CONFIRM_RADIUS_METRES,
  MISMATCH_RADIUS_METRES,
  classifyScanLocation,
  daysPresent,
  distanceInMetres,
  isPresent,
  isVenueAnchorUsable,
  markedAbsentThroughout,
  needsAction,
  needsOrganiserReview,
} from '../attendance';

// Real Ghanaian coordinates, so the distances below are checkable against a map.
const KORLE_BU = { latitude: 5.5365, longitude: -0.2265 }; // Accra
const ACCRA_MALL = { latitude: 5.6217, longitude: -0.1738 }; // ~10km from Korle Bu
const KUMASI = { latitude: 6.6885, longitude: -1.6244 }; // ~200km away, another region

describe('distanceInMetres', () => {
  it('is zero for the same point', () => {
    expect(distanceInMetres(KORLE_BU, KORLE_BU)).toBeCloseTo(0);
  });

  it('is symmetric', () => {
    expect(distanceInMetres(KORLE_BU, KUMASI)).toBeCloseTo(distanceInMetres(KUMASI, KORLE_BU));
  });

  it('matches known Ghanaian distances within a sensible tolerance', () => {
    expect(distanceInMetres(KORLE_BU, ACCRA_MALL)).toBeGreaterThan(9_000);
    expect(distanceInMetres(KORLE_BU, ACCRA_MALL)).toBeLessThan(12_000);
    expect(distanceInMetres(KORLE_BU, KUMASI)).toBeGreaterThan(190_000);
    expect(distanceInMetres(KORLE_BU, KUMASI)).toBeLessThan(215_000);
  });
});

describe('classifyScanLocation — confirmed', () => {
  it('confirms a scan at the venue', () => {
    expect(classifyScanLocation(KORLE_BU, KORLE_BU)).toBe('confirmed');
  });

  it('confirms a scan comfortably inside the radius', () => {
    // ~1.1km north of the venue.
    const nearby = { latitude: KORLE_BU.latitude + 0.01, longitude: KORLE_BU.longitude };
    expect(distanceInMetres(nearby, KORLE_BU)).toBeLessThan(CONFIRM_RADIUS_METRES);
    expect(classifyScanLocation(nearby, KORLE_BU)).toBe('confirmed');
  });

  // The device's own stated error budget is spent in the volunteer's favour.
  it('widens the ring by the reported accuracy rather than doubting the volunteer', () => {
    const justOutside = { latitude: KORLE_BU.latitude + 0.021, longitude: KORLE_BU.longitude };
    expect(distanceInMetres(justOutside, KORLE_BU)).toBeGreaterThan(CONFIRM_RADIUS_METRES);

    expect(classifyScanLocation({ ...justOutside, accuracy: 5 }, KORLE_BU)).toBe('unavailable');
    expect(classifyScanLocation({ ...justOutside, accuracy: 800 }, KORLE_BU)).toBe('confirmed');
  });
});

describe('classifyScanLocation — unavailable (still counts as present)', () => {
  // Uneven phone and data access is a fact of the target context. Every one of
  // these cases must resolve to a verdict that still marks the volunteer
  // present, never to a mismatch.
  it('is unavailable when the volunteer has no location', () => {
    expect(classifyScanLocation(null, KORLE_BU)).toBe('unavailable');
    expect(classifyScanLocation(undefined, KORLE_BU)).toBe('unavailable');
  });

  it('is unavailable when the fix is too imprecise to reason with', () => {
    expect(classifyScanLocation({ ...KUMASI, accuracy: 5_000 }, KORLE_BU)).toBe('unavailable');
  });

  it('is unavailable for a zeroed or nonsensical fix rather than a mismatch', () => {
    expect(classifyScanLocation({ latitude: 0, longitude: 0 }, KORLE_BU)).toBe('unavailable');
    expect(classifyScanLocation({ latitude: 999, longitude: 0 }, KORLE_BU)).toBe('unavailable');
    expect(classifyScanLocation({ latitude: Number.NaN, longitude: 0 }, KORLE_BU)).toBe(
      'unavailable'
    );
  });

  // A volunteer must never be penalised for something the ORGANISER did not do.
  it('is unavailable when the organiser never anchored the venue', () => {
    expect(classifyScanLocation(KORLE_BU, null)).toBe('unavailable');
    expect(classifyScanLocation(KUMASI, null)).toBe('unavailable');
  });

  // The ambiguous band between the two thresholds is where the design's bias
  // lives: too far to confirm, not far enough to accuse.
  it('is unavailable in the ambiguous band, not a mismatch', () => {
    const distance = distanceInMetres(ACCRA_MALL, KORLE_BU);
    expect(distance).toBeGreaterThan(CONFIRM_RADIUS_METRES);
    expect(distance).toBeLessThan(MISMATCH_RADIUS_METRES);
    expect(classifyScanLocation(ACCRA_MALL, KORLE_BU)).toBe('unavailable');
  });
});

describe('classifyScanLocation — mismatch', () => {
  // The hole this closes: a photo of the QR sent to someone sitting at home.
  it('flags a scan from a clearly different part of the country', () => {
    expect(classifyScanLocation(KUMASI, KORLE_BU)).toBe('mismatch');
  });

  it('only a mismatch reaches the organiser', () => {
    expect(needsOrganiserReview('mismatch')).toBe(true);
    expect(needsOrganiserReview('confirmed')).toBe(false);
    expect(needsOrganiserReview('unavailable')).toBe(false);
    expect(needsOrganiserReview('not_checked')).toBe(false);
  });
});

describe('isPresent — default present', () => {
  it('treats an unresolved, unscanned volunteer as present', () => {
    expect(isPresent({ checked_in_at: null, organiser_status: null })).toBe(true);
    expect(isPresent(null)).toBe(true);
  });

  it('treats a scanned volunteer as present', () => {
    expect(isPresent({ checked_in_at: '2026-08-05T09:00:00Z', organiser_status: null })).toBe(true);
  });

  // Absence is always an explicit human judgement, never an inference from
  // silence — otherwise a flat phone becomes a -15 penalty.
  it('marks absent only on an explicit organiser decision', () => {
    expect(isPresent({ checked_in_at: null, organiser_status: 'absent' })).toBe(false);
  });

  it('lets the organiser override a scan', () => {
    expect(isPresent({ checked_in_at: '2026-08-05T09:00:00Z', organiser_status: 'absent' })).toBe(
      false
    );
  });
});

describe('needsAction — the organiser’s exception list', () => {
  it('lists a volunteer who never scanned', () => {
    expect(needsAction({ checked_in_at: null, location_check: 'not_checked' })).toBe(true);
    expect(needsAction(null)).toBe(true);
  });

  it('lists a scan that contradicted the venue', () => {
    expect(needsAction({ checked_in_at: '2026-08-05T09:00:00Z', location_check: 'mismatch' })).toBe(
      true
    );
  });

  // The whole point: a well-attended event should need no review work at all.
  it('leaves confirmed and soft-present scans alone', () => {
    expect(
      needsAction({ checked_in_at: '2026-08-05T09:00:00Z', location_check: 'confirmed' })
    ).toBe(false);
    expect(
      needsAction({ checked_in_at: '2026-08-05T09:00:00Z', location_check: 'unavailable' })
    ).toBe(false);
  });

  it('drops anyone the organiser has already resolved', () => {
    expect(needsAction({ checked_in_at: null, organiser_status: 'absent' })).toBe(false);
    expect(needsAction({ checked_in_at: null, organiser_status: 'present' })).toBe(false);
    expect(
      needsAction({
        checked_in_at: '2026-08-05T09:00:00Z',
        location_check: 'mismatch',
        organiser_status: 'present',
      })
    ).toBe(false);
  });
});

describe('isVenueAnchorUsable — the stale-anchor guard', () => {
  it('accepts an anchor captured on the event day', () => {
    expect(isVenueAnchorUsable('2026-08-05T09:15:00Z', '2026-08-05')).toBe(true);
    expect(isVenueAnchorUsable('2026-08-05T23:59:00Z', '2026-08-05')).toBe(true);
  });

  // The failure this exists to prevent: an organiser opens the QR screen at
  // home the night before, anchors their living room, and every genuine
  // on-site scan the next day reads as 20km out. Discarding the anchor costs a
  // verification signal; honouring it would flag the whole event.
  it('rejects an anchor captured the day before', () => {
    expect(isVenueAnchorUsable('2026-08-04T21:00:00Z', '2026-08-05')).toBe(false);
  });

  it('rejects an anchor captured after the event day', () => {
    expect(isVenueAnchorUsable('2026-08-06T09:00:00Z', '2026-08-05')).toBe(false);
  });

  it('rejects a missing or unparseable anchor', () => {
    expect(isVenueAnchorUsable(null, '2026-08-05')).toBe(false);
    expect(isVenueAnchorUsable(undefined, '2026-08-05')).toBe(false);
    expect(isVenueAnchorUsable('not a date', '2026-08-05')).toBe(false);
    expect(isVenueAnchorUsable('2026-08-05T09:00:00Z', null)).toBe(false);
    expect(isVenueAnchorUsable('2026-08-05T09:00:00Z', 'nonsense')).toBe(false);
  });

  it('crosses month and year boundaries correctly', () => {
    expect(isVenueAnchorUsable('2026-12-31T22:00:00Z', '2027-01-01')).toBe(false);
    expect(isVenueAnchorUsable('2027-01-01T00:30:00Z', '2027-01-01')).toBe(true);
  });
});

describe('mismatch threshold is district-scaled', () => {
  // A mismatch must mean "certainly not in the venue's district". Ghana's
  // districts run from ~15km across in Greater Accra to over 100km in the
  // north, so the threshold sits above all but the largest — erring high,
  // because a tighter radius would flag volunteers genuinely on site in a big
  // rural district.
  it('tolerates a distance that could still be one large district', () => {
    expect(MISMATCH_RADIUS_METRES).toBeGreaterThanOrEqual(50_000);
  });

  it('still escalates a scan from another region entirely', () => {
    expect(classifyScanLocation(KUMASI, KORLE_BU)).toBe('mismatch');
  });
});

describe('attendance across several days', () => {
  // A four-day campaign. The volunteer committed to all four.
  const ALL_FOUR = ['day-1', 'day-2', 'day-3', 'day-4'];

  it('counts a day with no record as present, exactly as isPresent does', () => {
    expect(daysPresent(ALL_FOUR, {})).toBe(4);
  });

  it('subtracts only the days the organiser actually flagged', () => {
    expect(
      daysPresent(ALL_FOUR, {
        'day-2': { organiser_status: 'absent' },
        'day-3': { checked_in_at: '2026-10-14T09:00:00Z' },
      })
    ).toBe(3);
  });

  it('ignores days outside the commitment entirely', () => {
    // The Saturday-only student. Days 2, 3 and 4 were never promised, so being
    // marked absent on them must cost nothing.
    expect(
      daysPresent(['day-1'], {
        'day-1': { checked_in_at: '2026-10-12T09:00:00Z' },
        'day-2': { organiser_status: 'absent' },
        'day-3': { organiser_status: 'absent' },
        'day-4': { organiser_status: 'absent' },
      })
    ).toBe(1);
  });
});

describe('markedAbsentThroughout', () => {
  const ALL_FOUR = ['day-1', 'day-2', 'day-3', 'day-4'];

  it('is false when nothing has been recorded — silence is not a judgement', () => {
    expect(markedAbsentThroughout(ALL_FOUR, {})).toBe(false);
  });

  it('is false for someone absent on one day who came on another', () => {
    // Three days out of four is not a no-show, and opening their review at -15
    // would be the wrong starting position to put in front of an organiser.
    expect(
      markedAbsentThroughout(ALL_FOUR, {
        'day-1': { checked_in_at: '2026-10-12T09:00:00Z' },
        'day-2': { organiser_status: 'absent' },
      })
    ).toBe(false);
  });

  it('is true when every recorded day is an absence', () => {
    expect(
      markedAbsentThroughout(ALL_FOUR, {
        'day-1': { organiser_status: 'absent' },
        'day-2': { organiser_status: 'absent' },
      })
    ).toBe(true);
  });

  it('is false when the only records are on days never committed to', () => {
    expect(
      markedAbsentThroughout(['day-1'], { 'day-2': { organiser_status: 'absent' } })
    ).toBe(false);
  });

  it('is false when a day was resolved present, even with no scan', () => {
    expect(
      markedAbsentThroughout(ALL_FOUR, {
        'day-1': { organiser_status: 'present' },
        'day-2': { organiser_status: 'absent' },
      })
    ).toBe(false);
  });
});
