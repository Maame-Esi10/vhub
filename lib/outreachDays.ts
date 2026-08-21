/**
 * The pure day logic for multi-day outreaches. No I/O, no React, no native
 * modules — everything here is unit-testable and safe to import from the
 * serverless API as well as the app.
 *
 * THE MODEL, restated because every function below depends on it: an outreach
 * runs over one or more days, and SINGLE-DAY IS THE n=1 CASE. There is no
 * "is multi-day" flag anywhere, in the database or here, for the same reason
 * there is no multi-role flag — a boolean that must agree with the number of
 * rows will eventually disagree with it. Code that wants to know whether to
 * show a day list asks how many days there are.
 *
 * A volunteer commits to SPECIFIC days when they apply, and is measured only
 * against those. Days they never committed to are irrelevant: no penalty, no
 * absence, not counted.
 */

import { parseCalendarDate } from '@/components/ui/dateUtils';

/**
 * A sanity bound on how many days one outreach may span, enforced by the form.
 *
 * Not a statement about what is reasonable to run — it is the point past which
 * a day list has almost certainly been produced by a mistake (a mistyped year
 * on the last day of a generated range) rather than by an organisation. Two
 * months of daily clinics still fits.
 */
export const MAX_OUTREACH_DAYS = 60;

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The shape this module needs from an `outreach_days` row. */
export interface DayLike {
  day: string;
  start_time?: string | null;
  end_time?: string | null;
}

/** The shape this module needs from the parent outreach. */
export interface OutreachTimesLike {
  start_time: string | null;
  end_time: string | null;
}

/**
 * A day's hours, with the outreach's own used whenever the day does not
 * override them.
 *
 * This inheritance exists in exactly one place on purpose. `outreach_days`
 * stores NULL to mean "the same as the event", so reading the column directly
 * anywhere else would render a blank time for the ordinary case — which is
 * every day of every outreach the app currently creates.
 */
export function dayStartTime(day: DayLike, outreach: OutreachTimesLike): string | null {
  return day.start_time ?? outreach.start_time;
}

export function dayEndTime(day: DayLike, outreach: OutreachTimesLike): string | null {
  return day.end_time ?? outreach.end_time;
}

/** Chronological order. Returns a new array; ISO dates sort correctly as strings. */
export function sortDays<T extends DayLike>(days: readonly T[]): T[] {
  return [...days].sort((a, b) => a.day.localeCompare(b.day));
}

/** Chronological order for bare ISO date strings. */
export function sortDayStrings(days: readonly string[]): string[] {
  return [...days].sort((a, b) => a.localeCompare(b));
}

/**
 * `YYYY-MM-DD` shifted by whole days, staying on the calendar.
 *
 * Built through the local Date constructor rather than by adding milliseconds
 * to a timestamp, so it cannot be knocked sideways by a daylight-saving jump.
 * Ghana never changes its clocks, but this helper is also used against dates
 * the user typed, and a date helper that is only correct in one timezone is a
 * trap for whoever reuses it.
 */
export function addCalendarDays(date: string, amount: number): string | null {
  const parsed = parseCalendarDate(date);
  if (!parsed) return null;
  const shifted = new Date(parsed.year, parsed.month - 1, parsed.day + amount);
  return toIsoDate(shifted);
}

/** Local `Date` → `YYYY-MM-DD`, without going through UTC (which can shift the day). */
export function toIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today as `YYYY-MM-DD` in local time. Ghana is GMT year-round. */
export function todayIso(): string {
  return toIsoDate(new Date());
}

/**
 * The day the "add another day" button should offer: the one after the last day
 * already chosen. Null when the list is empty or unparsable, which is the
 * caller's cue to ask for a date rather than guess one.
 */
export function nextDayAfter(days: readonly string[]): string | null {
  const sorted = sortDayStrings(days);
  const last = sorted[sorted.length - 1];
  return last ? addCalendarDays(last, 1) : null;
}

/** Every calendar day from `from` to `to` inclusive, or null if either is unparsable or the range is backwards. */
export function calendarRange(from: string, to: string): string[] | null {
  if (!parseCalendarDate(from) || !parseCalendarDate(to) || from > to) return null;

  const out: string[] = [];
  let cursor: string | null = from;
  while (cursor && cursor <= to && out.length <= MAX_OUTREACH_DAYS) {
    out.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return out;
}

/**
 * Validates a day list as a whole, returning one message or null.
 *
 * `requireFuture` is false when EDITING, for the same reason
 * `validateOutreachEdit` relaxes the date rule: an event that has already
 * happened is an ordinary thing to edit, and refusing to save it because its
 * own days are behind us would make the editor useless for exactly the events
 * that most need fixing.
 */
export function validateDays(
  days: readonly string[],
  options: { requireFuture: boolean }
): string | null {
  if (days.length === 0) {
    return 'Pick at least one day.';
  }

  if (days.length > MAX_OUTREACH_DAYS) {
    return `That is more than ${MAX_OUTREACH_DAYS} days — check the last date.`;
  }

  if (days.some((day) => !parseCalendarDate(day))) {
    return 'One of these dates is not valid.';
  }

  if (new Set(days).size !== days.length) {
    return 'The same day is listed twice.';
  }

  if (options.requireFuture) {
    const today = todayIso();
    if (days.some((day) => day < today)) {
      return 'Days must be today or later.';
    }
  }

  return null;
}

/**
 * The LAST day of an outreach, `YYYY-MM-DD`, or null for an empty list.
 *
 * The one every "is it over yet?" question must ask. `outreaches.date` is the
 * FIRST day, so a four-day campaign judged on it is "finished" from the evening
 * of day one — which would drop it off a volunteer's schedule, taking the
 * check-in action with it, while they were standing in the middle of it.
 */
export function lastDay(days: readonly string[]): string | null {
  const sorted = sortDayStrings(days.filter((day) => parseCalendarDate(day)));
  return sorted[sorted.length - 1] ?? null;
}

/** True when any day of the outreach is today. Ghana is GMT year-round. */
/**
 * True once the outreach's FIRST DAY HAS ARRIVED — the calendar day, not the
 * clock.
 *
 * This is the "is there anything to mark yet?" question, and it has to be
 * asked at day resolution because that is the resolution check-in is gated at.
 * `/api/checkin` accepts a scan on any day the outreach runs, with no
 * comparison against `start_time` — so on the morning of the event, before its
 * stated start, a volunteer could already be checked in while the organiser's
 * "Mark attendance" action was still hidden by a start-time test. The two must
 * agree, and the day is the honest unit: an attendance record exists the moment
 * anyone can create one.
 */
export function hasFirstDayArrived(days: readonly string[]): boolean {
  const sorted = sortDayStrings(days.filter((day) => parseCalendarDate(day)));
  const first = sorted[0];
  return !!first && first <= todayIso();
}

export function isAnyDayToday(days: readonly string[]): boolean {
  const today = todayIso();
  return days.some((day) => day === today);
}

/** "Wed, Oct 12" — the short form used inside a day list, where the year is already obvious. */
export function formatDayShort(date: string): string {
  const parsed = parseCalendarDate(date);
  if (!parsed) return date;
  const d = new Date(parsed.year, parsed.month - 1, parsed.day);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[parsed.month - 1]} ${parsed.day}`;
}

/**
 * How many scattered days are named in full before the line gives up and
 * counts the rest. Two fits a card at the width these lines are read on.
 */
const NAMED_SCATTERED_DAYS = 3;

/**
 * How a day list reads as one line on a card.
 *
 * Three shapes, because a span and a scatter are genuinely different things and
 * flattening them loses what the volunteer needs to know:
 *
 *   1 day        -> "Wed, Oct 12 2026"
 *   consecutive  -> "Mon, Oct 12 – Wed, Oct 14 2026 · 3 days"
 *   scattered    -> "2 days · Mon, Aug 31 + Thu, Sep 3 2026"
 *                -> "6 days · Sat, Oct 3 + Sat, Oct 10 + Sat, Oct 17 2026 and 3 more"
 *
 * THE SCATTERED FORM CONTAINS NO DASH, and that is the whole point of it.
 *
 * It used to read "2 days · Mon, Aug 31 – Thu, Sep 3 2026". Leading with the
 * count was supposed to stop that being read as a range, and it does not: the
 * dash is a stronger signal than the number in front of it, so a two-day event
 * on the 31st and the 3rd looked like a four-day event running straight
 * through. Reported from a real event.
 *
 * A dash means "through" in every other place this app uses one — the
 * consecutive form above, and every time range. So a scatter cannot borrow it.
 * `+` reads as "and also", which is exactly what a scattered day list means.
 *
 * The rejected alternative was "2 days between Aug 31 and Sep 3", which is
 * accurate and still wrong for the same reason: "between X and Y" describes a
 * window, and the days are not a window. Naming the actual days removes the
 * ambiguity rather than wording around it.
 */
export function formatDaySpan(days: readonly string[]): string {
  const sorted = sortDayStrings(days.filter((day) => parseCalendarDate(day)));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return '';

  if (sorted.length === 1) {
    return formatFullDay(first);
  }

  const consecutive = isConsecutive(sorted);
  if (consecutive) {
    return `${formatDayShort(first)} – ${formatFullDay(last)} · ${sorted.length} days`;
  }

  // Named days, then a count of whatever did not fit. The year rides on the
  // last day actually named, so the line states it exactly once.
  const named = sorted.slice(0, NAMED_SCATTERED_DAYS);
  const remaining = sorted.length - named.length;
  const list = named
    .map((day, index) => (index === named.length - 1 ? formatFullDay(day) : formatDayShort(day)))
    .join(' + ');

  return `${sorted.length} days · ${list}${remaining > 0 ? ` and ${remaining} more` : ''}`;
}

/** True when the list is a run of adjacent calendar days with no gaps. */
export function isConsecutive(days: readonly string[]): boolean {
  const sorted = sortDayStrings(days);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current) return false;
    if (addCalendarDays(previous, 1) !== current) return false;
  }
  return true;
}

/** "Wed, Oct 12 2026" — the same shape as `formatEventDate`, kept here so this module has no UI dependency beyond the parser. */
function formatFullDay(date: string): string {
  const parsed = parseCalendarDate(date);
  if (!parsed) return date;
  const d = new Date(parsed.year, parsed.month - 1, parsed.day);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[parsed.month - 1]} ${parsed.day} ${parsed.year}`;
}

/**
 * "3 of 4 days" / "every day" — how a volunteer's COMMITMENT reads next to the
 * event it was made against.
 *
 * Display only. It deliberately says nothing about attendance or reputation:
 * committing to one Saturday of a month-long campaign is a perfectly good
 * commitment, and phrasing it as a shortfall would be a judgement the app has
 * no business making at the point someone volunteers.
 */
export function describeCommitment(committedDays: number, totalDays: number): string {
  if (totalDays <= 1 || committedDays >= totalDays) {
    return totalDays <= 1 ? '' : 'Every day';
  }
  return `${committedDays} of ${totalDays} days`;
}

/**
 * Minutes past midnight for "HH:MM" or "HH:MM:SS", or null.
 *
 * Duplicated in miniature from components/ui/dateUtils rather than imported:
 * this module is pure by contract — no React, no native modules — so that the
 * serverless API can import it, and reaching into components/ would break that
 * for the sake of six lines.
 */
function clockMinutes(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Milliseconds until a day starts, or null when the day cannot be parsed. */
export function msUntilDay(day: string, startTime: string | null, now = Date.now()): number | null {
  const parsed = parseCalendarDate(day);
  if (!parsed) return null;
  const minutes = clockMinutes(startTime) ?? 0;
  const start = new Date(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    Math.floor(minutes / 60),
    minutes % 60
  );
  return start.getTime() - now;
}

/** A day is releasable while it has not started. Afterwards it is a no-show. */
export function canReleaseDay(day: string, startTime: string | null, now = Date.now()): boolean {
  const remaining = msUntilDay(day, startTime, now);
  return remaining !== null && remaining > 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True inside the late window: the day starts within 24 hours AND has not
 * started yet.
 *
 * Two edges, deliberately — the same shape as `isLateCancellationWindow`, and
 * for the same reason it had to be fixed there. A one-sided `remaining <= 24h`
 * is trivially true for everything in the past, which would tell a volunteer
 * that releasing a day three weeks gone was a late cancellation.
 *
 * The DATABASE is the authority on this; the trigger stamps `late_release`
 * itself. This exists so the app can WARN before the tap rather than report
 * after it — a penalty a volunteer only learns about afterwards teaches them
 * nothing.
 */
export function isLateReleaseWindow(
  day: string,
  startTime: string | null,
  now = Date.now()
): boolean {
  const remaining = msUntilDay(day, startTime, now);
  if (remaining === null) return false;
  return remaining > 0 && remaining <= DAY_MS;
}

/**
 * How many late releases in the window before a deduction applies.
 *
 * The owner's rule (2026-08-21): a first late release costs nothing but warns,
 * and repetition earns a deduction. Two free, deduction from the third, over a
 * rolling window rather than for all time — somebody unreliable last year and
 * dependable since is dependable, and a lifetime counter can never be worked
 * off.
 */
export const LATE_RELEASE_FREE_COUNT = 2;
export const LATE_RELEASE_WINDOW_DAYS = 90;

export type LateReleaseStanding = 'first' | 'final_warning' | 'deducting';

/** Where this volunteer stands, given how many late releases are already behind them. */
export function lateReleaseStanding(recentLateReleases: number): LateReleaseStanding {
  if (recentLateReleases <= 0) return 'first';
  if (recentLateReleases < LATE_RELEASE_FREE_COUNT) return 'final_warning';
  return 'deducting';
}

/**
 * What to tell a volunteer BEFORE they release a day inside the late window.
 *
 * Written to inform rather than to threaten: it states what happens, in the
 * order it happens, and never implies the release is disallowed — the whole
 * point of building this was that the app used to punish people for a thing it
 * gave them no way to avoid.
 *
 * NOTE: no score moves today. The deduction itself is a V-Score formula change
 * and is gated pending the owner's approval; `late_release` is recorded and
 * nothing reads it. The copy is written so it stays true either way.
 */
export function lateReleaseWarning(recentLateReleases: number): string {
  switch (lateReleaseStanding(recentLateReleases)) {
    case 'first':
      return 'This day starts within 24 hours, so it counts as a late cancellation. It will be recorded on your record. Repeated late cancellations affect your V-Score.';
    case 'final_warning':
      return `That is your ${ordinal(recentLateReleases + 1)} late cancellation in ${LATE_RELEASE_WINDOW_DAYS} days. One more and they start to affect your V-Score.`;
    case 'deducting':
      return `That is your ${ordinal(recentLateReleases + 1)} late cancellation in ${LATE_RELEASE_WINDOW_DAYS} days. Late cancellations at this rate affect your V-Score.`;
  }
}

function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

/**
 * The fraction of their OWN commitment a volunteer turned up for, or null when
 * they committed to nothing (which the database now prevents, but a read path
 * must not divide by it regardless).
 *
 * DISPLAY ONLY at present. The approved change that scales `event_outcome` by
 * this ratio — so a month-long event cannot move a V-Score twenty times harder
 * than a one-day clinic — is NOT wired up here; V-Score maths stays in
 * lib/vscore.ts and is gated. This exists so the attendance and review screens
 * can show the organiser what they are judging.
 */
export function attendedRatio(daysAttended: number, daysCommitted: number): number | null {
  if (daysCommitted <= 0) return null;
  return Math.min(1, Math.max(0, daysAttended / daysCommitted));
}
