/**
 * Under-subscription — what happens when an outreach is running out of days
 * and still short of volunteers.
 *
 * THE GOVERNING RULE, and it is a design decision rather than an oversight:
 * **the app informs, it never advises.** It reports the shortfall, it widens
 * who hears about the event, and it stops there. It must never suggest that an
 * organisation reduce its slot count or move its date. Those are operational
 * and clinical judgements — how many hands a vaccination drive actually needs
 * is a decision with consequences for the community being served, and a piece
 * of software with no knowledge of the medical plan has no business nudging
 * anyone toward a smaller team. Recommending "reduce to 6 slots" would also
 * quietly corrupt the platform's own data: an organisation that trims its
 * target to whatever it happened to recruit makes every event look fully
 * staffed and makes under-subscription statistically invisible.
 *
 * Escalation is therefore about REACH, not about lowering the bar: each stage
 * tells more people, and the requirement never moves.
 *
 * Pure functions only. The I/O half lives in
 * api/src/server/underSubscription.ts, the same split as lib/attendance.ts and
 * /api/checkin.
 */

/** How far the app casts the net for volunteers at a given stage. */
export type EscalationReach =
  /** Nobody new — the organisation alone is told. */
  | 'organisation_only'
  /** Matching volunteers in the outreach's own region. */
  | 'region'
  /** Matching volunteers in the outreach's region and every adjacent one. */
  | 'adjacent_regions';

export interface UnderSubscriptionStage {
  /** Days before the event this stage fires. */
  daysOut: number;
  /** Dedupe key, written to notifications.data->>'stage'. */
  key: 'under_7' | 'under_3' | 'under_1';
  reach: EscalationReach;
}

/**
 * The ladder: 7, 3 and 1 days out.
 *
 * Spacing is deliberate rather than even. Seven days is the last point at which
 * an organisation can realistically act on the information (call a partner
 * clinic, post to its own channels) — so it is told first and told alone.
 * Three days is where reach widens to volunteers in the region who never saw
 * the event. One day widens to neighbouring regions, because at that point a
 * volunteer willing to travel is worth more than a tidy catchment area. Any
 * closer than a day and a notification cannot change anyone's plans, so there
 * is no stage on the morning itself.
 */
export const UNDER_SUBSCRIPTION_STAGES: readonly UnderSubscriptionStage[] = [
  { daysOut: 7, key: 'under_7', reach: 'organisation_only' },
  { daysOut: 3, key: 'under_3', reach: 'region' },
  { daysOut: 1, key: 'under_1', reach: 'adjacent_regions' },
];

/** Whole days from `today` to `eventDate`, both `YYYY-MM-DD`. Negative once past. */
export function daysUntil(eventDate: string, today: string): number {
  const event = Date.parse(`${eventDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(event) || Number.isNaN(now)) return Number.NaN;
  return Math.round((event - now) / (24 * 60 * 60 * 1000));
}

/** The stage firing exactly this many days out, or null on a day with no stage. */
export function stageForDaysOut(days: number): UnderSubscriptionStage | null {
  return UNDER_SUBSCRIPTION_STAGES.find((stage) => stage.daysOut === days) ?? null;
}

export interface OutreachFillState {
  status: string;
  slotsFilled: number;
  slotsTotal: number;
}

/**
 * Short of volunteers and still able to take them.
 *
 * Only `open` outreaches count: a draft was never published, and a closed or
 * completed one is not asking for anybody. An outreach with no slot target
 * (0 total) is never under-subscribed — there is no shortfall against nothing.
 */
export function isUnderSubscribed({ status, slotsFilled, slotsTotal }: OutreachFillState): boolean {
  return status === 'open' && slotsTotal > 0 && slotsFilled < slotsTotal;
}

/** Places still to fill, floored at zero. */
export function placesRemaining({ slotsFilled, slotsTotal }: Omit<OutreachFillState, 'status'>): number {
  return Math.max(0, slotsTotal - slotsFilled);
}

export interface ShortfallCopyParams {
  outreachTitle: string;
  slotsFilled: number;
  slotsTotal: number;
  daysOut: number;
  /** How many volunteers this stage has told, if any. */
  volunteersNotified?: number;
}

/**
 * The organisation's message: the numbers, the time left, and what the app has
 * done. No recommendation, no imperative, no "consider".
 *
 * Written here rather than inline at the send site so the no-advice rule has
 * one place to live and can be asserted by a test.
 */
export function organisationShortfallMessage({
  outreachTitle,
  slotsFilled,
  slotsTotal,
  daysOut,
  volunteersNotified,
}: ShortfallCopyParams): string {
  const when = daysOut === 1 ? 'is tomorrow' : `is in ${daysOut} days`;
  const filled = `${slotsFilled} of ${slotsTotal} ${slotsTotal === 1 ? 'place' : 'places'} filled`;

  const reach =
    volunteersNotified && volunteersNotified > 0
      ? ` ${volunteersNotified} matching ${volunteersNotified === 1 ? 'volunteer has' : 'volunteers have'} been told about it.`
      : '';

  return `${outreachTitle} ${when}, with ${filled}.${reach}`;
}

/** The volunteer's message: an event near them that still has room. */
export function volunteerShortfallMessage({
  outreachTitle,
  slotsFilled,
  slotsTotal,
  daysOut,
  matchScore,
}: Omit<ShortfallCopyParams, 'volunteersNotified'> & { matchScore: number }): string {
  const remaining = placesRemaining({ slotsFilled, slotsTotal });
  const when = daysOut === 1 ? 'tomorrow' : `in ${daysOut} days`;
  return `${outreachTitle} still has ${remaining} ${remaining === 1 ? 'place' : 'places'} open ${when}. ${Math.round(matchScore)}% match for your profile.`;
}
