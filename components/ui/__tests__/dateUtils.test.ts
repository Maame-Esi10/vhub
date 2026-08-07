import {
  formatEventTime,
  formatEventTimeRange,
  hasEventEnded,
  isEventToday,
  isLateCancellationWindow,
  isTimeAfter,
  isUpcomingEvent,
  msUntilEvent,
  parseClockTime,
} from '../dateUtils';

/**
 * The app WRITES `HH:MM` (the masked input in DateTimeField) and READS BACK
 * `HH:MM:SS` — Postgres `time` columns come through PostgREST with seconds.
 * Every helper here was anchored to `HH:MM` exactly, so everything on the read
 * path silently failed to parse: times rendered as "10:00:00" and, far worse,
 * msUntilEvent treated every event as starting at midnight.
 *
 * Both formats are pinned on every helper below. A regression to either side
 * breaks a test rather than a screen.
 */
describe('both wire formats parse identically', () => {
  it('parseClockTime accepts HH:MM and HH:MM:SS', () => {
    expect(parseClockTime('09:30')).toEqual({ hours: 9, minutes: 30 });
    expect(parseClockTime('09:30:00')).toEqual({ hours: 9, minutes: 30 });
    // Seconds are captured and deliberately discarded — nothing here schedules
    // to the second, and keeping them would make comparisons jitter.
    expect(parseClockTime('09:30:59')).toEqual({ hours: 9, minutes: 30 });
  });

  it('parseClockTime still rejects genuine rubbish', () => {
    expect(parseClockTime('')).toBeNull();
    expect(parseClockTime('nope')).toBeNull();
    expect(parseClockTime('25:00')).toBeNull();
    expect(parseClockTime('09:60')).toBeNull();
    expect(parseClockTime('09:30:00:00')).toBeNull();
  });

  it('formatEventTime renders both as 12-hour clock time', () => {
    expect(formatEventTime('09:00')).toBe('9:00 AM');
    expect(formatEventTime('09:00:00')).toBe('9:00 AM');
    expect(formatEventTime('17:00:00')).toBe('5:00 PM');
    expect(formatEventTime('00:00:00')).toBe('12:00 AM');
    expect(formatEventTime('12:00:00')).toBe('12:00 PM');
    expect(formatEventTime('23:59:59')).toBe('11:59 PM');
  });

  it('formatEventTimeRange renders the range the cards actually show', () => {
    // The reported symptom, exactly: "10:00:00 - 17:00:00".
    expect(formatEventTimeRange('10:00:00', '17:00:00')).toBe('10:00 AM - 5:00 PM');
    expect(formatEventTimeRange('10:00', '17:00')).toBe('10:00 AM - 5:00 PM');
  });

  it('isTimeAfter compares both formats', () => {
    expect(isTimeAfter('09:00:00', '17:00:00')).toBe(true);
    expect(isTimeAfter('17:00:00', '09:00:00')).toBe(false);
    // Mixed, which is what an edit form pre-filled from the database would do.
    expect(isTimeAfter('09:00', '17:00:00')).toBe(true);
  });

  it('msUntilEvent no longer treats a database time as midnight', () => {
    // The real damage. With the old parser both of these collapsed to
    // midnight, so an event at 23:00 looked like it had started 23 hours ago.
    const withSeconds = msUntilEvent('2099-01-01', '23:00:00');
    const withoutSeconds = msUntilEvent('2099-01-01', '23:00');
    expect(withSeconds).toBe(withoutSeconds);

    const atMidnight = msUntilEvent('2099-01-01', '00:00:00');
    expect(withSeconds).toBeGreaterThan(atMidnight!);
  });

  it('isLateCancellationWindow measures to the real start time', () => {
    // A far-future event is never a late cancellation, in either format.
    expect(isLateCancellationWindow('2099-01-01', '09:00:00')).toBe(false);
    expect(isLateCancellationWindow('2099-01-01', '09:00')).toBe(false);
  });
});

/**
 * These two helpers exist because `isUpcomingEvent` was doing a job it was
 * never meant for: deciding whether an event still belongs on the volunteer's
 * schedule. It flips the moment the START time passes, so a confirmed event
 * disappeared from Schedule while the volunteer was standing in it — taking
 * the check-in button with it, at exactly the moment it was needed. Reported
 * on device, 2026-08-07.
 */

/** `YYYY-MM-DD` for a date `offsetDays` from today, in local time. */
function dateOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

const TODAY = dateOffset(0);
const YESTERDAY = dateOffset(-1);
const TOMORROW = dateOffset(1);

describe('isEventToday', () => {
  it('is true only for today', () => {
    expect(isEventToday(TODAY)).toBe(true);
    expect(isEventToday(TOMORROW)).toBe(false);
    expect(isEventToday(YESTERDAY)).toBe(false);
  });

  it('is false for an unparsable date rather than throwing', () => {
    expect(isEventToday('')).toBe(false);
    expect(isEventToday('not-a-date')).toBe(false);
    expect(isEventToday('2026-13-45')).toBe(false);
  });
});

describe('hasEventEnded', () => {
  it('is false for a future day', () => {
    expect(hasEventEnded(TOMORROW, '17:00')).toBe(false);
  });

  it('is true for a past day', () => {
    expect(hasEventEnded(YESTERDAY, '17:00')).toBe(true);
  });

  it('reads a database end time rather than falling back to end-of-day', () => {
    // Before the parser fix this silently used the 23:59 fallback for every
    // real end_time, so an event that finished at 09:00 stayed "in progress"
    // until midnight.
    expect(hasEventEnded(TODAY, '00:00:00')).toBe(true);
    expect(hasEventEnded(TOMORROW, '00:00:00')).toBe(false);
  });

  it('runs to the end of the day when no end time is set', () => {
    // The bug in one line: an event with no end_time must not be treated as
    // instantaneous, or it "ends" the second it begins.
    expect(hasEventEnded(TODAY, null)).toBe(false);
  });

  it('keeps an in-progress event alive after its start time has passed', () => {
    // The reported case: today's event, already started, still not over. The
    // old test (isUpcomingEvent) says it is no longer upcoming — which is
    // true, and is precisely why it was the wrong question to ask.
    expect(isUpcomingEvent(TODAY, '00:01')).toBe(false);
    expect(hasEventEnded(TODAY, '23:58')).toBe(false);
  });

  it('is true once today’s end time has passed', () => {
    expect(hasEventEnded(TODAY, '00:00')).toBe(true);
  });

  it('is false for an unparsable date, so a bad row is never silently hidden', () => {
    expect(hasEventEnded('not-a-date', '17:00')).toBe(false);
  });
});
