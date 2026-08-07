/**
 * Pure date/time formatting + masked-entry + validation helpers.
 * No date-picker library is installed, so `date`/`start_time`/`end_time`
 * are collected as plain text with digit-only masking that produces exactly
 * `YYYY-MM-DD` / `HH:MM` (the Postgres `date`/`time` formats the hooks expect).
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Formats `YYYY-MM-DD` as "Wed, Oct 12 2024". Returns the raw string if unparsable. */
export function formatEventDate(date: string): string {
  const parsed = parseCalendarDate(date);
  if (!parsed) return date;
  const d = new Date(parsed.year, parsed.month - 1, parsed.day);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[parsed.month - 1]} ${parsed.day} ${parsed.year}`;
}

/** Formats `HH:MM` (24h) as "9:00 AM". Returns null for null/invalid input. */
export function formatEventTime(time: string | null): string | null {
  if (!time) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hoursStr = match[1];
  const minutesStr = match[2];
  if (!hoursStr || !minutesStr) return time;
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutesStr.padStart(2, '0')} ${period}`;
}

export function formatEventTimeRange(startTime: string | null, endTime: string | null): string | null {
  const start = formatEventTime(startTime);
  const end = formatEventTime(endTime);
  if (start && end) return `${start} - ${end}`;
  return start ?? end;
}

/** Progressively inserts dashes as the user types digits: 20241012 -> 2024-10-12. */
export function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  let out = digits.slice(0, 4);
  if (digits.length > 4) out += `-${digits.slice(4, 6)}`;
  if (digits.length > 6) out += `-${digits.slice(6, 8)}`;
  return out;
}

/** Progressively inserts a colon as the user types digits: 0900 -> 09:00. */
export function maskTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += `:${digits.slice(2, 4)}`;
  return out;
}

interface ParsedDate {
  year: number;
  month: number;
  day: number;
}

/** Strict `YYYY-MM-DD` parse — rejects malformed strings and impossible calendar dates (e.g. Feb 30). */
export function parseCalendarDate(value: string): ParsedDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const yearStr = match[1];
  const monthStr = match[2];
  const dayStr = match[3];
  if (!yearStr || !monthStr || !dayStr) return null;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return { year, month, day };
}

/** True when `value` is a valid calendar date on or after today (local time, date-only comparison). */
export function isTodayOrFutureDate(value: string): boolean {
  const parsed = parseCalendarDate(value);
  if (!parsed) return false;
  const candidate = new Date(parsed.year, parsed.month - 1, parsed.day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return candidate.getTime() >= today.getTime();
}

/**
 * Milliseconds from now until an event starts (negative once it has begun),
 * or null if the date is unparsable. An outreach with no start_time is taken
 * to start at midnight, matching the `coalesce(o.start_time, '00:00')` in the
 * cancellation trigger.
 *
 * Used to *warn* about a late withdrawal. The authoritative late/on-time call
 * belongs to the DB (`trg_applications_stamp_cancellation`) and uses the
 * server clock — a device with a wrong clock must not be able to talk its way
 * out of the bigger V-Score penalty. Ghana is GMT (UTC+0) year-round, so
 * interpreting the stored date + time as local here agrees with the server.
 */
export function msUntilEvent(date: string, startTime: string | null): number | null {
  const parsedDate = parseCalendarDate(date);
  if (!parsedDate) return null;
  const time = startTime ? parseClockTime(startTime) : null;
  const start = new Date(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day,
    time?.hours ?? 0,
    time?.minutes ?? 0
  );
  return start.getTime() - Date.now();
}

/** True when the event starts within 24 hours (or has already started). */
export function isLateCancellationWindow(date: string, startTime: string | null): boolean {
  const remaining = msUntilEvent(date, startTime);
  if (remaining === null) return false;
  return remaining <= 24 * 60 * 60 * 1000;
}

/** True when the event has not started yet — used to pick "upcoming" events. */
export function isUpcomingEvent(date: string, startTime: string | null): boolean {
  const remaining = msUntilEvent(date, startTime);
  return remaining !== null && remaining > 0;
}

/** True when `date` (YYYY-MM-DD) is today in local time. Ghana is GMT year-round. */
export function isEventToday(date: string): boolean {
  const parsed = parseCalendarDate(date);
  if (!parsed) return false;
  const now = new Date();
  return (
    parsed.year === now.getFullYear() &&
    parsed.month === now.getMonth() + 1 &&
    parsed.day === now.getDate()
  );
}

/**
 * True once the event is genuinely over.
 *
 * Distinct from `!isUpcomingEvent`, which flips the moment the START time
 * passes — that is what dropped an event off the volunteer's schedule while
 * they were still standing in it, taking the check-in action with it. An event
 * with no `end_time` runs to the end of its calendar day rather than being
 * treated as instantaneous.
 */
export function hasEventEnded(date: string, endTime: string | null): boolean {
  const parsed = parseCalendarDate(date);
  if (!parsed) return false;
  const end = endTime ? parseClockTime(endTime) : null;
  const finish = new Date(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    end?.hours ?? 23,
    end?.minutes ?? 59,
    59
  );
  return Date.now() > finish.getTime();
}

interface ParsedTime {
  hours: number;
  minutes: number;
}

export function parseClockTime(value: string): ParsedTime | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hoursStr = match[1];
  const minutesStr = match[2];
  if (!hoursStr || !minutesStr) return null;
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/** True when `end` is strictly after `start` (both `HH:MM`). */
export function isTimeAfter(start: string, end: string): boolean {
  const startParsed = parseClockTime(start);
  const endParsed = parseClockTime(end);
  if (!startParsed || !endParsed) return false;
  return endParsed.hours * 60 + endParsed.minutes > startParsed.hours * 60 + startParsed.minutes;
}
