import {
  MAX_OUTREACH_DAYS,
  addCalendarDays,
  attendedRatio,
  calendarRange,
  isAnyDayToday,
  lastDay,
  dayEndTime,
  dayStartTime,
  describeCommitment,
  formatDaySpan,
  canReleaseDay,
  hasFirstDayArrived,
  isConsecutive,
  isLateReleaseWindow,
  LATE_RELEASE_FREE_COUNT,
  lateReleaseStanding,
  lateReleaseWarning,
  msUntilDay,
  nextDayAfter,
  sortDayStrings,
  toIsoDate,
  todayIso,
  validateDays,
} from '@/lib/outreachDays';

describe('day-level times inherit from the outreach', () => {
  const outreach = { start_time: '09:00:00', end_time: '16:00:00' };

  it('uses the outreach hours when the day states none', () => {
    const day = { day: '2026-10-12', start_time: null, end_time: null };
    expect(dayStartTime(day, outreach)).toBe('09:00:00');
    expect(dayEndTime(day, outreach)).toBe('16:00:00');
  });

  it('lets a single day override just one end of the range', () => {
    const day = { day: '2026-10-12', start_time: '07:30:00', end_time: null };
    expect(dayStartTime(day, outreach)).toBe('07:30:00');
    expect(dayEndTime(day, outreach)).toBe('16:00:00');
  });

  it('reports no hours at all when neither the day nor the outreach has any', () => {
    const day = { day: '2026-10-12' };
    expect(dayStartTime(day, { start_time: null, end_time: null })).toBeNull();
  });
});

describe('calendar arithmetic', () => {
  it('adds days across a month boundary', () => {
    expect(addCalendarDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('adds days across a year boundary', () => {
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addCalendarDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('goes backwards too', () => {
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('refuses a date it cannot parse', () => {
    expect(addCalendarDays('12/10/2026', 1)).toBeNull();
    expect(addCalendarDays('2026-02-30', 1)).toBeNull();
  });

  it('formats a local Date without slipping a day through UTC', () => {
    // Late evening local time is the case that used to roll forward when the
    // date was taken from toISOString().
    expect(toIsoDate(new Date(2026, 9, 12, 23, 45))).toBe('2026-10-12');
  });

  it('offers the day after the last one chosen, whatever order they were added in', () => {
    expect(nextDayAfter(['2026-10-14', '2026-10-12'])).toBe('2026-10-15');
  });

  it('offers nothing when there are no days yet', () => {
    expect(nextDayAfter([])).toBeNull();
  });

  it('reports today in local time', () => {
    expect(todayIso()).toBe(toIsoDate(new Date()));
  });
});

describe('calendarRange', () => {
  it('includes both ends', () => {
    expect(calendarRange('2026-10-12', '2026-10-14')).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
    ]);
  });

  it('returns a single day when both ends are the same', () => {
    expect(calendarRange('2026-10-12', '2026-10-12')).toEqual(['2026-10-12']);
  });

  it('refuses a backwards range rather than silently returning nothing', () => {
    expect(calendarRange('2026-10-14', '2026-10-12')).toBeNull();
  });
});

describe('validateDays', () => {
  const future = ['2099-10-12', '2099-10-13'];

  it('accepts an ordinary list', () => {
    expect(validateDays(future, { requireFuture: true })).toBeNull();
  });

  it('refuses an empty list — an outreach with no days has nothing to attend', () => {
    expect(validateDays([], { requireFuture: true })).toMatch(/at least one day/i);
  });

  it('names a duplicate rather than silently de-duplicating it', () => {
    expect(validateDays(['2099-10-12', '2099-10-12'], { requireFuture: true })).toMatch(
      /twice/i
    );
  });

  it('refuses an unparsable date', () => {
    expect(validateDays(['2099-13-45'], { requireFuture: true })).toMatch(/valid date/i);
  });

  it('refuses a past day when creating', () => {
    expect(validateDays(['2020-01-01'], { requireFuture: true })).toMatch(/today or later/i);
  });

  it('allows a past day when editing, because a finished event is an ordinary thing to fix', () => {
    expect(validateDays(['2020-01-01'], { requireFuture: false })).toBeNull();
  });

  it('refuses a list longer than the cap', () => {
    const many = calendarRange('2099-01-01', '2099-04-30') ?? [];
    expect(many.length).toBeGreaterThan(MAX_OUTREACH_DAYS);
    expect(validateDays(many, { requireFuture: true })).toMatch(/at most/i);
  });
});

describe('formatDaySpan', () => {
  it('reads as one date when there is one day', () => {
    expect(formatDaySpan(['2026-10-12'])).toBe('Mon, Oct 12 2026');
  });

  it('reads as a range when the days are consecutive', () => {
    expect(formatDaySpan(['2026-10-12', '2026-10-13', '2026-10-14'])).toBe(
      'Mon, Oct 12 – Wed, Oct 14 2026 · 3 days'
    );
  });

  it('NAMES the days when they are scattered, and never uses a dash', () => {
    // Four Saturdays. "Oct 3 – Oct 24" would suggest 22 days of work, and
    // leading with the count was not enough to stop it being read that way.
    const span = formatDaySpan(['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24']);
    expect(span).toBe('4 days · Sat, Oct 3 + Sat, Oct 10 + Sat, Oct 17 2026 and 1 more');
    expect(span.startsWith('4 days')).toBe(true);
  });

  it('never puts a dash in a scattered span, whatever its length', () => {
    // The dash is the thing that reads as "through", so this is the property
    // that actually matters rather than any one string above.
    const cases = [
      ['2026-08-31', '2026-09-03'],
      ['2026-10-03', '2026-10-10', '2026-10-17'],
      ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-11-07'],
    ];
    for (const days of cases) {
      expect(formatDaySpan(days)).not.toContain('–');
      expect(formatDaySpan(days)).not.toContain('-');
    }
  });

  it('names every day when there are few enough, so a two-day event is unmistakable', () => {
    // The reported case: Aug 31 and Sep 3 read as a four-day event.
    expect(formatDaySpan(['2026-08-31', '2026-09-03'])).toBe(
      '2 days · Mon, Aug 31 + Thu, Sep 3 2026'
    );
  });

  it('counts the overflow rather than listing every day of a long scatter', () => {
    const span = formatDaySpan([
      '2026-10-03',
      '2026-10-10',
      '2026-10-17',
      '2026-10-24',
      '2026-10-31',
      '2026-11-07',
    ]);
    expect(span).toBe('6 days · Sat, Oct 3 + Sat, Oct 10 + Sat, Oct 17 2026 and 3 more');
  });

  it('sorts before formatting, so the order they were added in does not matter', () => {
    expect(formatDaySpan(['2026-10-14', '2026-10-12', '2026-10-13'])).toBe(
      'Mon, Oct 12 – Wed, Oct 14 2026 · 3 days'
    );
  });

  it('returns an empty string rather than throwing on no days', () => {
    expect(formatDaySpan([])).toBe('');
  });
});

describe('hasFirstDayArrived', () => {
  it('is true on the day itself, whatever the clock says', () => {
    // The bug this exists for: an event starting at 06:00 today had no
    // "Mark attendance" action at 01:00, while check-in — which is gated on
    // the DAY — would already accept a scan.
    expect(hasFirstDayArrived([todayIso()])).toBe(true);
  });

  it('is true once the first day is behind us, on a later day of the event', () => {
    const yesterday = addCalendarDays(todayIso(), -1)!;
    const tomorrow = addCalendarDays(todayIso(), 1)!;
    expect(hasFirstDayArrived([yesterday, tomorrow])).toBe(true);
  });

  it('is false while every day is still ahead', () => {
    const tomorrow = addCalendarDays(todayIso(), 1)!;
    expect(hasFirstDayArrived([tomorrow])).toBe(false);
  });

  it('reads the FIRST day, not the order they were passed in', () => {
    const yesterday = addCalendarDays(todayIso(), -1)!;
    const tomorrow = addCalendarDays(todayIso(), 1)!;
    expect(hasFirstDayArrived([tomorrow, yesterday])).toBe(true);
  });

  it('is false rather than throwing on no days', () => {
    expect(hasFirstDayArrived([])).toBe(false);
  });
});

describe('isConsecutive', () => {
  it('is true for a run of adjacent days', () => {
    expect(isConsecutive(['2026-10-12', '2026-10-13'])).toBe(true);
  });

  it('is false across a gap', () => {
    expect(isConsecutive(['2026-10-12', '2026-10-14'])).toBe(false);
  });

  it('is true for a single day', () => {
    expect(isConsecutive(['2026-10-12'])).toBe(true);
  });
});

describe('sortDayStrings', () => {
  it('does not mutate its input', () => {
    const input = ['2026-10-14', '2026-10-12'];
    sortDayStrings(input);
    expect(input).toEqual(['2026-10-14', '2026-10-12']);
  });
});

describe('describeCommitment', () => {
  it('says nothing at all for a one-day event, where there was no choice to make', () => {
    expect(describeCommitment(1, 1)).toBe('');
  });

  it('says "every day" when the volunteer took all of them', () => {
    expect(describeCommitment(4, 4)).toBe('Every day');
  });

  it('counts a partial commitment without judging it', () => {
    expect(describeCommitment(1, 20)).toBe('1 of 20 days');
  });
});

describe('attendedRatio', () => {
  it('is 1 when someone attended everything they promised, however few days that was', () => {
    // The Saturday-only student on a month-long campaign. Four for four is a
    // perfect record, not a 4/26 shortfall.
    expect(attendedRatio(4, 4)).toBe(1);
  });

  it('is the fraction of the COMMITMENT for partial attendance', () => {
    expect(attendedRatio(5, 20)).toBe(0.25);
  });

  it('is 0 for a full no-show', () => {
    expect(attendedRatio(0, 3)).toBe(0);
  });

  it('returns null rather than dividing by a commitment of nothing', () => {
    expect(attendedRatio(0, 0)).toBeNull();
  });
});

describe('lastDay and isAnyDayToday', () => {
  it('picks the last day whatever order the list is in', () => {
    // The one every "is it over yet?" question must ask. outreaches.date is the
    // FIRST day, so judging on it finishes a four-day campaign on day one.
    expect(lastDay(['2026-10-14', '2026-10-12', '2026-10-13'])).toBe('2026-10-14');
  });

  it('is null for an empty list rather than throwing', () => {
    expect(lastDay([])).toBeNull();
  });

  it('ignores days it cannot parse', () => {
    expect(lastDay(['2026-10-12', 'not a date'])).toBe('2026-10-12');
  });

  it('counts any day of the event as today, not just the first', () => {
    const today = todayIso();
    expect(isAnyDayToday(['2020-01-01', today, '2099-01-01'])).toBe(true);
    expect(isAnyDayToday(['2020-01-01', '2099-01-01'])).toBe(false);
    expect(isAnyDayToday([])).toBe(false);
  });
});

describe('releasing a day', () => {
  // A fixed clock, so none of this drifts into passing or failing by the hour.
  const NOW = new Date(2026, 8, 10, 12, 0, 0).getTime(); // Thu 10 Sep 2026, midday

  it('measures the wait to a day from its own start time', () => {
    expect(msUntilDay('2026-09-10', '18:00', NOW)).toBe(6 * 60 * 60 * 1000);
  });

  it('treats a day with no start time as starting at midnight', () => {
    expect(msUntilDay('2026-09-11', null, NOW)).toBe(12 * 60 * 60 * 1000);
  });

  it('accepts the HH:MM:SS Postgres actually returns', () => {
    // Every time read back from the database arrives with seconds. A parser
    // anchored to HH:MM exactly is the bug that broke every card in July.
    expect(msUntilDay('2026-09-10', '18:00:00', NOW)).toBe(6 * 60 * 60 * 1000);
  });

  it('can be released while the day is still ahead', () => {
    expect(canReleaseDay('2026-09-12', '09:00', NOW)).toBe(true);
  });

  it('cannot be released once the day has started', () => {
    // Not a cancellation at that point -- a no-show, which attendance owns.
    expect(canReleaseDay('2026-09-10', '09:00', NOW)).toBe(false);
  });

  it('cannot be released for a day that is long past', () => {
    expect(canReleaseDay('2026-08-01', '09:00', NOW)).toBe(false);
  });
});

describe('the late-release window has two edges', () => {
  const NOW = new Date(2026, 8, 10, 12, 0, 0).getTime();

  it('is late inside 24 hours of the start', () => {
    expect(isLateReleaseWindow('2026-09-11', '09:00', NOW)).toBe(true);
  });

  it('is not late with more than 24 hours to go', () => {
    expect(isLateReleaseWindow('2026-09-12', '09:00', NOW)).toBe(false);
  });

  it('is NOT late for a day already begun, which is the edge that matters', () => {
    // One-sided "remaining <= 24h" is trivially true for everything in the
    // past. That exact bug told a volunteer an event five days gone started
    // within 24 hours.
    expect(isLateReleaseWindow('2026-09-09', '09:00', NOW)).toBe(false);
    expect(isLateReleaseWindow('2026-01-01', '09:00', NOW)).toBe(false);
  });
});

describe('late-release standing escalates rather than punishing at once', () => {
  it('treats the first as a warning, not a failure', () => {
    expect(lateReleaseStanding(0)).toBe('first');
  });

  it('warns harder as the free allowance runs out', () => {
    expect(lateReleaseStanding(LATE_RELEASE_FREE_COUNT - 1)).toBe('final_warning');
  });

  it('starts deducting once the allowance is spent', () => {
    expect(lateReleaseStanding(LATE_RELEASE_FREE_COUNT)).toBe('deducting');
    expect(lateReleaseStanding(LATE_RELEASE_FREE_COUNT + 5)).toBe('deducting');
  });

  it('never tells a volunteer the release is refused', () => {
    // The point of building per-day release was that the app punished people
    // for something it gave them no way to avoid. The copy must inform.
    for (const count of [0, 1, 2, 7]) {
      const warning = lateReleaseWarning(count);
      expect(warning).not.toMatch(/cannot|not allowed|refused|blocked/i);
      expect(warning.length).toBeGreaterThan(20);
    }
  });

  it('counts the release being made, not the ones behind it', () => {
    // Someone with one already behind them is about to make their second.
    expect(lateReleaseWarning(1)).toContain('2nd');
  });
});
