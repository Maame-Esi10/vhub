/**
 * V-Score band classification.
 *
 * Bands (CLAUDE.md, spec is final):
 *   Elite 90+ · Trusted 75–89 · Active 60–74 · Developing 40–59 · At Risk <40
 *
 * Pure, no I/O — safe to call from any screen or component. The score itself
 * is NEVER computed here: `volunteer_profiles.v_score` is service-role
 * write-only (see the column revoke in supabase/schema.sql) and is recomputed
 * exclusively by the serverless /api/vscore endpoint. This file only reads a
 * score the server already produced and says which band it falls in. The
 * recompute math (0.7×old + 0.3×event_outcome, plus the no-show / late- and
 * on-time-cancellation penalties) lands here alongside it in Phase 3.
 */

export type VScoreBand = 'Elite' | 'Trusted' | 'Active' | 'Developing' | 'At Risk';

/** Lower bound of each band, highest first. */
export const V_SCORE_BANDS = [
  { band: 'Elite', min: 90 },
  { band: 'Trusted', min: 75 },
  { band: 'Active', min: 60 },
  { band: 'Developing', min: 40 },
  { band: 'At Risk', min: 0 },
] as const satisfies readonly { band: VScoreBand; min: number }[];

/** Classifies a 0–100 V-Score into its band. */
export function getVScoreBand(score: number): VScoreBand {
  if (score >= 90) return 'Elite';
  if (score >= 75) return 'Trusted';
  if (score >= 60) return 'Active';
  if (score >= 40) return 'Developing';
  return 'At Risk';
}

// ---------------------------------------------------------------------------
// Reliability multiplier (owner decision, 2026-08-05).
//
// The match score measures FIT only. V-Score measures RELIABILITY and, until
// this was added, had no effect on ordering at all -- so two candidates with
// identical 95% fit ranked equally even when one had never missed an event and
// the other repeatedly no-showed. This multiplier is how reputation reaches
// the ranking.
//
// THE INVARIANT, which is the whole point of the design: the multiplier is
// bounded in (0, 1]. It can only ever REDUCE a ranking, never inflate one. Fit
// therefore defines the ceiling and reliability can only pull a candidate down
// from it. A boost above 1.0 was deliberately rejected: it would let reputation
// override fit (an Elite volunteer leapfrogging a better-fitting Trusted one)
// and would structurally disadvantage new volunteers, who start at 70 and have
// done nothing wrong.
// ---------------------------------------------------------------------------

/**
 * Ranking multiplier by band. Elite/Trusted/Active are all 1.00 -- the penalty
 * begins only at Developing, because the top three bands describe volunteers
 * who are meeting expectations and there is nothing to correct for.
 *
 * The two penalty values are calibrated, not arbitrary:
 *   - At Risk = 0.70. A 90%-fit chronic no-show drops to 63, so a reliable
 *     candidate needs roughly 63%+ fit to overtake them -- proven
 *     unreliability costs about one band of fit. 0.65 was judged too
 *     aggressive (a barely-qualified reliable volunteer would beat a highly
 *     skilled one) and 0.75 too forgiving.
 *   - Developing = 0.90, a mild nudge for minor dings or a score in recovery.
 */
export const RELIABILITY_MULTIPLIERS: Record<VScoreBand, number> = {
  Elite: 1.0,
  Trusted: 1.0,
  Active: 1.0,
  Developing: 0.9,
  'At Risk': 0.7,
};

/**
 * Ranking multiplier for a volunteer's V-Score.
 *
 * A null/undefined/non-finite score returns 1.0 (fully neutral), and so does
 * the `NEW_VOLUNTEER_V_SCORE` of 70, which sits inside Active. This is
 * deliberate and must not be "tightened": not having a track record is NOT the
 * same as having a bad one, and an untested volunteer must never be penalised
 * for it.
 */
export function getReliabilityMultiplier(vScore: number | null | undefined): number {
  if (vScore == null || !Number.isFinite(vScore)) return 1;
  return RELIABILITY_MULTIPLIERS[getVScoreBand(vScore)];
}

/**
 * The value candidates are ORDERED by: matchScore x reliabilityMultiplier.
 *
 * This is a ranking key, not a match percentage. The raw match score and the
 * V-Score both stay separately visible to organisations, and the match
 * breakdown continues to explain fit on its own terms -- the multiplier must
 * never be presented to anyone as "your match is X%".
 */
export function computeRankingScore(matchScore: number, vScore: number | null | undefined): number {
  return matchScore * getReliabilityMultiplier(vScore);
}

// ---------------------------------------------------------------------------
// V-Score recompute math (CLAUDE.md -> V-Score, spec final where stated).
// Pure functions only. This is deliberately the ONLY place this math is
// defined; the serverless /api/vscore endpoint imports it rather than
// re-deriving it. Never called from the client for a real write — the
// `volunteer_profiles.v_score` column is service-role write-only (see
// supabase/schema.sql) — these functions just compute what that endpoint
// would write, in a pure/testable form.
// ---------------------------------------------------------------------------

/** Starting V-Score for every new volunteer (CLAUDE.md, spec final). */
export const NEW_VOLUNTEER_V_SCORE = 70;

/** Weight given to the existing score in the post-event blend. */
const OLD_SCORE_WEIGHT = 0.7;
/** Weight given to the freshly-computed event outcome in the blend. */
const EVENT_OUTCOME_WEIGHT = 0.3;

/**
 * Scales a 1–5 review sub-score onto a 0–100 range (CLAUDE.md: "reliability
 * and clinical average scaled x20"). 1 -> 20, 5 -> 100.
 */
const REVIEW_SCORE_SCALE = 20;

/**
 * Outcome assigned when `attended === false` (see `computeEventOutcome`
 * case 1 below). Kept as a named constant, not a magic number, since it is
 * one of the assumptions flagged for owner sign-off.
 */
const NO_SHOW_EVENT_OUTCOME = 0;

/**
 * REMOVED 2026-08-07, and worth recording why rather than deleting silently.
 *
 * There used to be a `DEFAULT_MISSING_SUBSCORE = 3` here: when a review was
 * filed with no star ratings, the midpoint of the 1–5 scale was substituted,
 * "chosen so a data gap neither rewards nor punishes the volunteer".
 *
 * That reasoning was wrong in effect. 3/5 scales to 60, and every volunteer
 * STARTS at 70, so blending in 60 always pulled a new volunteer DOWN:
 * 0.7×70 + 0.3×60 = 67. Repeated unrated reviews would drag anyone toward 60
 * no matter how well they actually worked. A neutral outcome is not a fixed
 * number on the scale — it is whatever the volunteer already has, which is
 * another way of saying there is no such number and the blend should simply
 * not run.
 *
 * Found on device: an organisation marked a volunteer present, filed a review
 * without stars, and watched the score fall 70 -> 67 for a good event.
 */

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score));
}

/** Minimal shape of an `event_reviews` row this math needs. */
export interface EventOutcomeInput {
  attended: boolean | null;
  reliability_score: number | null;
  clinical_score: number | null;
}

/**
 * Derives a 0–100 "event outcome" from a single post-event review — the
 * input to the 0.7×old + 0.3×outcome blend in `recomputeVScoreAfterReview`.
 *
 * CLAUDE.md specifies the blend weights and says the outcome "maps
 * attendance + reliability_score + clinical_score onto 0–100 (attended is a
 * precondition; reliability and clinical average scaled x20)" but does not
 * give the exact no-show / missing-data handling. The following derivation
 * is a DELIBERATE ASSUMPTION flagged for the project owner's sign-off (see
 * docs/REPORT_NOTES.md "Design decisions" for the recorded rationale):
 *
 *   1. `attended === false` -> outcome = 0 (floor). Attendance is a stated
 *      precondition: reliability/clinical scores are meaningless (and, per
 *      the DB shape, normally simply absent) for someone who never showed
 *      up, so we floor the outcome rather than reading whatever partial
 *      scores happen to be present. This is DELIBERATELY separate from the
 *      flat -15 no-show penalty in `applyVScorePenalty` below — that penalty
 *      targets the application/cancellation flow (a volunteer who is known
 *      to have bailed before the event), while this floor targets the
 *      review-driven blend (an org filed a review and marked them absent).
 *   2. `attended === true` (or null — see case 5) and `clinical_score` is
 *      present -> outcome = ((reliability_score + clinical_score) / 2) x 20:
 *      the average of the two 1–5 scores, scaled onto 0–100. A perfect 5/5
 *      review -> 100; a bottom-of-scale 1/1 review (but still attended) ->
 *      20, never 0 — showing up and being reviewed, even poorly, is not
 *      treated as equivalent to a no-show.
 *   3. `clinical_score` is null (support-role / non-clinical volunteers are
 *      never clinically scored) -> outcome = reliability_score x 20. We fall
 *      back to reliability alone rather than penalising a volunteer for a
 *      dimension that structurally doesn't apply to their role.
 *   4. `reliability_score` is missing while attended is true -> NULL, meaning
 *      "this review carries no scorable signal". See case 5 and the removed
 *      constant above: substituting a midpoint here silently penalised anyone
 *      above 60, which is every new volunteer.
 *   5. `attended === null` (never reviewed / unknown) -> NULL, same reasoning.
 *
 * Returns null rather than a number when there is nothing to score, so the
 * caller must decide what to do about it instead of being handed a plausible
 * fabricated value. `recomputeVScoreAfterReview` leaves the score untouched.
 *
 * A non-null result is always clamped to [0, 100].
 */
export function computeEventOutcome(review: EventOutcomeInput): number | null {
  if (review.attended === false) return clampScore(NO_SHOW_EVENT_OUTCOME);

  // Unknown attendance is not evidence of anything.
  if (review.attended !== true) return null;

  const reliability = review.reliability_score;
  const clinical = review.clinical_score;

  // No reliability score = no signal. Note this is NOT the same as a missing
  // clinical score: clinical is structurally absent for support-role
  // volunteers, who are never clinically scored, so reliability alone is a
  // complete review for them rather than a gap.
  if (reliability == null) return null;

  const outcome =
    clinical == null
      ? reliability * REVIEW_SCORE_SCALE
      : ((reliability + clinical) / 2) * REVIEW_SCORE_SCALE;

  return clampScore(outcome);
}

/** True when a review carries enough signal to move a V-Score at all. */
export function hasScorableOutcome(review: EventOutcomeInput): boolean {
  return computeEventOutcome(review) !== null;
}

/**
 * Applies the post-event blend: new = 0.7×old + 0.3×eventOutcome, clamped to
 * [0, 100].
 *
 * DEPARTS FROM CLAUDE.md's original wording, deliberately (owner-approved
 * 2026-08-07): a review with no scorable outcome returns the OLD SCORE
 * UNCHANGED rather than blending in a substituted midpoint. The spec assumed a
 * missing rating could be treated as neutral; no fixed number is neutral when
 * volunteers start at 70, so the only honest response to "no rating was given"
 * is to not move the score. The review form now requires the stars, so this
 * path should be unreachable from the app — it exists so that a gap arriving
 * any other way cannot quietly cost someone reputation.
 */
export function recomputeVScoreAfterReview(oldScore: number, review: EventOutcomeInput): number {
  const outcome = computeEventOutcome(review);
  if (outcome === null) return clampScore(oldScore);
  return clampScore(OLD_SCORE_WEIGHT * oldScore + EVENT_OUTCOME_WEIGHT * outcome);
}

/**
 * Flat penalties applied directly to the score (CLAUDE.md, spec final) —
 * separate from the review blend above. These target the
 * application/cancellation lifecycle (a volunteer who cancelled or never
 * showed up for an event they were accepted into), not a filed event_review.
 */
export type VScorePenaltyType = 'no_show' | 'late_cancellation' | 'on_time_cancellation';

export const V_SCORE_PENALTIES: Record<VScorePenaltyType, number> = {
  no_show: -15,
  late_cancellation: -8,
  on_time_cancellation: -2,
};

/** Applies a single named penalty to a score, clamped to [0, 100]. */
export function applyVScorePenalty(score: number, penalty: VScorePenaltyType): number {
  return clampScore(score + V_SCORE_PENALTIES[penalty]);
}

/**
 * The deduction for a LATE PER-DAY RELEASE, approved by the owner 2026-08-21.
 *
 * A volunteer may drop a future day they committed to (lib/outreachDays.ts).
 * Dropping one inside 24 hours of that day is a late cancellation, and this is
 * what it costs — but only once it becomes a pattern.
 *
 * WHY IT IS FREE THE FIRST TWO TIMES. Per-day release exists because the app
 * used to punish people for something it gave them no way to avoid: withdrawal
 * was all-or-nothing and closed once an event began, so a volunteer who could
 * not make one Saturday of four had to abandon the campaign or take a -15
 * no-show. Charging for the first honest use of the escape hatch would rebuild
 * the trap. Two free in a rolling 90 days covers real life twice a quarter;
 * three is a pattern rather than an accident.
 *
 * WHY THE WINDOW ROLLS. A lifetime counter can never be worked off, and a
 * penalty nobody can escape stops changing behaviour. Somebody unreliable last
 * year and dependable since is dependable.
 *
 * WHY THIS SHAPE, AND WHY -8 IS THE COEFFICIENT. The scale already has two
 * anchors: -8 for abandoning a whole event late, -15 for not turning up at all.
 * Releasing every remaining day IS a withdrawal and already routes to the -8,
 * so the per-day cost has to approach -8 as the share released approaches the
 * whole and be materially smaller for one day of many. `-8 x share` meets the
 * existing scale exactly at its own edge, which is the argument for it over any
 * other coefficient:
 *
 *   1 of 4 days  ->  -2    the organiser is short one day, not four
 *   2 of 4 days  ->  -4
 *   3 of 4 days  ->  -6
 *   4 of 4 days  ->  a withdrawal, and takes the existing -8 by that path
 *
 * The FLOOR of -2 stops one day of a twenty-day campaign rounding to nothing,
 * which would make repeated late drops on long events free. The CAP of -8 keeps
 * it from ever exceeding abandoning the event outright, and well clear of the
 * -15 reserved for not showing up — which is right, because somebody who
 * releases a day told you.
 */
export const LATE_RELEASE_FREE_ALLOWANCE = 2;
export const LATE_RELEASE_MAX_PENALTY = -8;
export const LATE_RELEASE_MIN_PENALTY = -2;

export interface LateReleasePenaltyInput {
  /** How many late releases this volunteer has already made in the window. */
  priorLateReleases: number;
  /** Days released in THIS act. */
  daysReleased: number;
  /** Days they had committed to before it. */
  daysCommitted: number;
}

/**
 * The points to add for one late release — 0 while the allowance holds, and a
 * negative number after it.
 *
 * Returns 0 rather than null for "no penalty", because this is a term in a sum
 * rather than an outcome that might be absent. `computeEventOutcome` returns
 * null for a genuinely unscorable review; this always has an answer.
 */
export function lateReleasePenalty(input: LateReleasePenaltyInput): number {
  if (input.priorLateReleases < LATE_RELEASE_FREE_ALLOWANCE) return 0;
  if (input.daysCommitted <= 0 || input.daysReleased <= 0) return 0;

  const share = Math.min(1, input.daysReleased / input.daysCommitted);
  const raw = LATE_RELEASE_MAX_PENALTY * share;

  // Rounded to one decimal so a score stays legible; clamped between the floor
  // and the cap in magnitude.
  const bounded = Math.max(LATE_RELEASE_MAX_PENALTY, Math.min(LATE_RELEASE_MIN_PENALTY, raw));
  return Math.round(bounded * 10) / 10;
}

/** Applies one late release to a score, clamped to [0, 100]. */
export function applyLateReleasePenalty(score: number, input: LateReleasePenaltyInput): number {
  return clampScore(score + lateReleasePenalty(input));
}

/**
 * Applies multiple penalties in sequence (e.g. a volunteer who racked up more
 * than one no-show before their score was ever recomputed), clamping after
 * each step so intermediate values never go negative before the next penalty
 * is applied.
 */
export function applyVScorePenalties(
  score: number,
  penalties: readonly VScorePenaltyType[]
): number {
  return penalties.reduce((acc, penalty) => applyVScorePenalty(acc, penalty), score);
}
