/**
 * How well each DAY of an outreach is staffed, derived rather than stored.
 *
 * THE PROBLEM THIS SOLVES. `outreaches.slots_filled` counts accepted PEOPLE,
 * not day-seats. Once a volunteer can release a single day of a multi-day
 * outreach (lib/outreachDays.ts), an event can read "5 of 5 filled" while
 * Saturday has four people on it — and the under-subscription ladder, which
 * reads `slots_filled`, never re-opens recruiting for the day that is actually
 * short.
 *
 * WHY DERIVED AND NOT STORED. A per-day slot count would be a new number to
 * maintain, kept in step by triggers on four tables, and the multi-role work
 * already established what that costs: a value that must agree with the
 * existence of rows will eventually disagree with it. Coverage does not need
 * storing, because the commitments ARE rows. Counting live ones per day is a
 * query, not a schema.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. There is no per-day TARGET. Every day is
 * measured against the outreach's own `slots_total`, which is right for every
 * outreach that wants the same staffing each day — which is every outreach the
 * app can currently express. "2 nurses on Saturday, 5 on Sunday" is a statement
 * of intent, and intent cannot be derived from anything; it would need the full
 * per-day slot model, which the owner explicitly ruled out on 2026-08-21.
 *
 * Pure: no I/O, no React. The app and the serverless escalation job both read
 * it, and they must not disagree about which day is short.
 */

export interface DayCoverage {
  outreachDayId: string;
  /** `YYYY-MM-DD`. */
  day: string;
  /** Accepted volunteers still committed to this day. */
  filled: number;
  /** The outreach's own target, applied to every day. */
  target: number;
}

/** How many places this day is still missing, floored at zero. */
export function dayShortfall(coverage: DayCoverage): number {
  return Math.max(0, coverage.target - coverage.filled);
}

/** True when this day has fewer people on it than the outreach asks for. */
export function isDayShort(coverage: DayCoverage): boolean {
  return coverage.target > 0 && coverage.filled < coverage.target;
}

/**
 * Builds the per-day picture from the two things already in the database: the
 * outreach's days, and who is still committed to each of them.
 *
 * `liveCommitmentsByDay` counts ACCEPTED applications whose `application_days`
 * row for that day has not been released. A day nobody is on appears with
 * `filled: 0` rather than being absent — a day with no volunteers is the most
 * short a day can be, and dropping it from the list would hide exactly the case
 * this exists to surface.
 */
export function buildDayCoverage(
  days: readonly { id: string; day: string }[],
  liveCommitmentsByDay: Readonly<Record<string, number>>,
  slotsTotal: number
): DayCoverage[] {
  return days.map((day) => ({
    outreachDayId: day.id,
    day: day.day,
    filled: liveCommitmentsByDay[day.id] ?? 0,
    target: slotsTotal,
  }));
}

/** Every day that is short, in date order. */
export function shortDays(coverage: readonly DayCoverage[]): DayCoverage[] {
  return coverage.filter(isDayShort).sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * The WORST day — the one with the largest gap — or null when every day is
 * covered.
 *
 * Ties break on the earliest date, because the day soonest to arrive is the one
 * least able to wait for volunteers.
 */
export function worstCoveredDay(coverage: readonly DayCoverage[]): DayCoverage | null {
  const short = shortDays(coverage);
  if (short.length === 0) return null;

  return short.reduce((worst, candidate) => {
    const gap = dayShortfall(candidate);
    const worstGap = dayShortfall(worst);
    if (gap > worstGap) return candidate;
    if (gap === worstGap && candidate.day < worst.day) return candidate;
    return worst;
  });
}

/**
 * True when the EVENT is fully subscribed by the old count but at least one
 * DAY is not.
 *
 * This is the disagreement worth naming rather than papering over: the card
 * says "5 of 5 filled" and it is not wrong — five people are accepted — but a
 * day of the event is still short. A screen showing both numbers without
 * explaining this reads as a bug, so the copy below exists to say which is
 * which.
 */
export function hasHiddenDayShortfall(
  coverage: readonly DayCoverage[],
  slotsFilled: number,
  slotsTotal: number
): boolean {
  return slotsTotal > 0 && slotsFilled >= slotsTotal && shortDays(coverage).length > 0;
}

/**
 * One line for a card, naming the worst day and its gap.
 *
 * Informs and stops, like every other under-subscription message: no
 * suggestion to reduce the slot count, move the date, or accept somebody. See
 * lib/underSubscription.ts for why that boundary is absolute.
 */
export function dayShortfallSummary(
  coverage: readonly DayCoverage[],
  formatDay: (day: string) => string
): string | null {
  const short = shortDays(coverage);
  const worst = worstCoveredDay(coverage);
  if (!worst) return null;

  const gap = dayShortfall(worst);
  const people = `${gap} ${gap === 1 ? 'place' : 'places'}`;
  const others =
    short.length > 1
      ? ` · ${short.length - 1} other ${short.length - 1 === 1 ? 'day is' : 'days are'} short too`
      : '';

  return `${formatDay(worst.day)} is short ${people}${others}`;
}
