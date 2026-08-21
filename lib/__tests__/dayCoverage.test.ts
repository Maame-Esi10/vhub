import {
  buildDayCoverage,
  dayShortfall,
  dayShortfallSummary,
  hasHiddenDayShortfall,
  isDayShort,
  shortDays,
  worstCoveredDay,
  type DayCoverage,
} from '@/lib/dayCoverage';

const DAYS = [
  { id: 'd1', day: '2026-10-03' },
  { id: 'd2', day: '2026-10-10' },
  { id: 'd3', day: '2026-10-17' },
];

function coverage(counts: Record<string, number>, slotsTotal = 5): DayCoverage[] {
  return buildDayCoverage(DAYS, counts, slotsTotal);
}

describe('building the per-day picture', () => {
  it('measures every day against the outreach target', () => {
    const built = coverage({ d1: 5, d2: 3, d3: 5 });
    expect(built).toHaveLength(3);
    expect(built[1]).toEqual({
      outreachDayId: 'd2',
      day: '2026-10-10',
      filled: 3,
      target: 5,
    });
  });

  it('shows a day nobody is on as empty rather than leaving it out', () => {
    // Dropping it would hide the most short a day can possibly be, which is
    // exactly the case this exists to surface.
    const built = coverage({ d1: 5, d3: 5 });
    expect(built[1]?.filled).toBe(0);
  });
});

describe('spotting a short day', () => {
  it('counts the gap', () => {
    expect(dayShortfall({ outreachDayId: 'd', day: '2026-10-03', filled: 3, target: 5 })).toBe(2);
  });

  it('never reports a negative gap when a day is over-filled', () => {
    expect(dayShortfall({ outreachDayId: 'd', day: '2026-10-03', filled: 7, target: 5 })).toBe(0);
  });

  it('is not short when there is no target at all', () => {
    expect(isDayShort({ outreachDayId: 'd', day: '2026-10-03', filled: 0, target: 0 })).toBe(false);
  });

  it('lists short days in date order', () => {
    const short = shortDays(coverage({ d1: 5, d2: 1, d3: 2 }));
    expect(short.map((c) => c.day)).toEqual(['2026-10-10', '2026-10-17']);
  });

  it('picks the day with the largest gap', () => {
    expect(worstCoveredDay(coverage({ d1: 4, d2: 1, d3: 3 }))?.day).toBe('2026-10-10');
  });

  it('breaks a tie on the earliest day, which can wait least', () => {
    expect(worstCoveredDay(coverage({ d1: 3, d2: 5, d3: 3 }))?.day).toBe('2026-10-03');
  });

  it('is null when every day is covered', () => {
    expect(worstCoveredDay(coverage({ d1: 5, d2: 5, d3: 6 }))).toBeNull();
  });
});

describe('the disagreement between the event count and the day count', () => {
  it('is flagged when the event reads full but a day is short', () => {
    // Five people accepted, one of whom released the second Saturday. The event
    // is "5 of 5"; that Saturday has four. Both numbers are true.
    expect(hasHiddenDayShortfall(coverage({ d1: 5, d2: 4, d3: 5 }), 5, 5)).toBe(true);
  });

  it('is not flagged when the event is openly short, since nothing is hidden', () => {
    expect(hasHiddenDayShortfall(coverage({ d1: 4, d2: 4, d3: 4 }), 4, 5)).toBe(false);
  });

  it('is not flagged when every day is covered', () => {
    expect(hasHiddenDayShortfall(coverage({ d1: 5, d2: 5, d3: 5 }), 5, 5)).toBe(false);
  });
});

describe('the summary line', () => {
  const format = (day: string) => day;

  it('names the worst day and its gap', () => {
    expect(dayShortfallSummary(coverage({ d1: 5, d2: 3, d3: 5 }), format)).toBe(
      '2026-10-10 is short 2 places'
    );
  });

  it('uses the singular for one place', () => {
    expect(dayShortfallSummary(coverage({ d1: 5, d2: 4, d3: 5 }), format)).toBe(
      '2026-10-10 is short 1 place'
    );
  });

  it('mentions the others without listing them all', () => {
    expect(dayShortfallSummary(coverage({ d1: 4, d2: 2, d3: 4 }), format)).toBe(
      '2026-10-10 is short 3 places · 2 other days are short too'
    );
  });

  it('says nothing when nothing is short', () => {
    expect(dayShortfallSummary(coverage({ d1: 5, d2: 5, d3: 5 }), format)).toBeNull();
  });

  it('never advises, only states', () => {
    // The same absolute boundary as every other under-subscription message.
    const line = dayShortfallSummary(coverage({ d1: 1, d2: 1, d3: 1 }), format) ?? '';
    expect(line).not.toMatch(/consider|should|try|reduce|lower|reschedule|move the date/i);
  });
});
