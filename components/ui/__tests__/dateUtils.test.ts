import { hasEventEnded, isEventToday, isUpcomingEvent } from '../dateUtils';

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
