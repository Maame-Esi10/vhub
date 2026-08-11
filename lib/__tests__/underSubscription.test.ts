import {
  UNDER_SUBSCRIPTION_STAGES,
  daysUntil,
  isUnderSubscribed,
  organisationShortfallMessage,
  placesRemaining,
  stageForDaysOut,
  volunteerShortfallMessage,
} from '../underSubscription';

describe('daysUntil', () => {
  it('counts whole days forward', () => {
    expect(daysUntil('2026-08-18', '2026-08-11')).toBe(7);
    expect(daysUntil('2026-08-12', '2026-08-11')).toBe(1);
    expect(daysUntil('2026-08-11', '2026-08-11')).toBe(0);
  });

  it('goes negative once the event has passed', () => {
    expect(daysUntil('2026-08-10', '2026-08-11')).toBe(-1);
  });

  it('crosses month and year boundaries', () => {
    expect(daysUntil('2026-09-01', '2026-08-29')).toBe(3);
    expect(daysUntil('2027-01-01', '2026-12-25')).toBe(7);
  });

  it('is NaN for an unparseable date rather than silently zero', () => {
    expect(Number.isNaN(daysUntil('not-a-date', '2026-08-11'))).toBe(true);
  });
});

describe('stageForDaysOut', () => {
  it('fires on exactly 7, 3 and 1 days out', () => {
    expect(stageForDaysOut(7)?.key).toBe('under_7');
    expect(stageForDaysOut(3)?.key).toBe('under_3');
    expect(stageForDaysOut(1)?.key).toBe('under_1');
  });

  it('is silent on every other day, including the day itself', () => {
    for (const days of [0, 2, 4, 5, 6, 8, 30, -1]) {
      expect(stageForDaysOut(days)).toBeNull();
    }
  });

  it('escalates reach as the event approaches, and never the other way', () => {
    // Each stage must reach at least as far as the one before it.
    const order = ['organisation_only', 'region', 'adjacent_regions'];
    const byUrgency = [...UNDER_SUBSCRIPTION_STAGES].sort((a, b) => b.daysOut - a.daysOut);
    const reachIndexes = byUrgency.map((stage) => order.indexOf(stage.reach));
    expect(reachIndexes).toEqual([...reachIndexes].sort((a, b) => a - b));
  });

  it('has unique stage keys, since they are the dedupe keys', () => {
    const keys = UNDER_SUBSCRIPTION_STAGES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('isUnderSubscribed', () => {
  it('is true only for an open outreach short of its target', () => {
    expect(isUnderSubscribed({ status: 'open', slotsFilled: 4, slotsTotal: 12 })).toBe(true);
    expect(isUnderSubscribed({ status: 'open', slotsFilled: 12, slotsTotal: 12 })).toBe(false);
  });

  it('ignores outreaches that are not open', () => {
    for (const status of ['draft', 'closed', 'completed']) {
      expect(isUnderSubscribed({ status, slotsFilled: 0, slotsTotal: 12 })).toBe(false);
    }
  });

  it('is false when there is no slot target to fall short of', () => {
    expect(isUnderSubscribed({ status: 'open', slotsFilled: 0, slotsTotal: 0 })).toBe(false);
  });
});

describe('placesRemaining', () => {
  it('never goes negative, even on an over-filled roster', () => {
    expect(placesRemaining({ slotsFilled: 14, slotsTotal: 12 })).toBe(0);
    expect(placesRemaining({ slotsFilled: 4, slotsTotal: 12 })).toBe(8);
  });
});

describe('organisationShortfallMessage', () => {
  const base = { outreachTitle: 'Community Health Outreach', slotsFilled: 4, slotsTotal: 12 };

  it('states the shortfall and the time left', () => {
    const message = organisationShortfallMessage({ ...base, daysOut: 7 });
    expect(message).toContain('Community Health Outreach');
    expect(message).toContain('4 of 12 places filled');
    expect(message).toContain('in 7 days');
  });

  it('says "tomorrow" rather than "in 1 days"', () => {
    const message = organisationShortfallMessage({ ...base, daysOut: 1 });
    expect(message).toContain('is tomorrow');
    expect(message).not.toContain('1 days');
  });

  it('reports how many volunteers were told, once any were', () => {
    expect(organisationShortfallMessage({ ...base, daysOut: 3, volunteersNotified: 18 })).toContain(
      '18 matching volunteers have been told'
    );
    expect(organisationShortfallMessage({ ...base, daysOut: 3, volunteersNotified: 1 })).toContain(
      '1 matching volunteer has been told'
    );
    expect(organisationShortfallMessage({ ...base, daysOut: 7, volunteersNotified: 0 })).not.toContain(
      'been told'
    );
  });

  /*
    The design rule made executable. The app INFORMS about a shortfall; it must
    never steer an organisation toward a smaller team or a different date. If
    someone later softens this copy into a helpful-sounding suggestion, this
    test is what stops it reaching a user.
  */
  it('never advises reducing slots or rescheduling', () => {
    const forbidden = [
      'consider',
      'reduce',
      'reducing',
      'lower',
      'fewer slots',
      'reschedul',
      'postpone',
      'cancel',
      'you should',
      'we recommend',
      'try ',
    ];
    for (const daysOut of [7, 3, 1]) {
      const message = organisationShortfallMessage({ ...base, daysOut, volunteersNotified: 5 }).toLowerCase();
      for (const phrase of forbidden) {
        expect(message).not.toContain(phrase);
      }
    }
  });

  it('handles a single-place outreach without mangling the plural', () => {
    const message = organisationShortfallMessage({
      outreachTitle: 'Clinic Support',
      slotsFilled: 0,
      slotsTotal: 1,
      daysOut: 3,
    });
    expect(message).toContain('0 of 1 place filled');
  });
});

describe('volunteerShortfallMessage', () => {
  it('leads with the opportunity, not the organisation problem', () => {
    const message = volunteerShortfallMessage({
      outreachTitle: 'Community Health Outreach',
      slotsFilled: 4,
      slotsTotal: 12,
      daysOut: 3,
      matchScore: 87.4,
    });
    expect(message).toContain('8 places open');
    expect(message).toContain('in 3 days');
    expect(message).toContain('87% match');
  });

  it('says "tomorrow" at one day out', () => {
    const message = volunteerShortfallMessage({
      outreachTitle: 'Clinic Support',
      slotsFilled: 2,
      slotsTotal: 3,
      daysOut: 1,
      matchScore: 90,
    });
    expect(message).toContain('1 place open tomorrow');
  });
});
