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
 * Neutral 1–5 fallback used only when `attended === true` (or unknown) but a
 * sub-score the blend needs is itself missing — a data-integrity gap the
 * review UI shouldn't normally allow. 3 is the midpoint of the 1–5 scale
 * (-> 60/100 once scaled), chosen so a data gap neither rewards nor punishes
 * the volunteer. See `computeEventOutcome` cases 4–5 below.
 */
const DEFAULT_MISSING_SUBSCORE = 3;

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
 *   4. `reliability_score` itself is missing while attended is true (a data
 *      gap the review form shouldn't normally allow) -> substitute the
 *      neutral `DEFAULT_MISSING_SUBSCORE` (3/5 -> 60/100) so a data-entry gap
 *      neither rewards nor punishes the volunteer, instead of producing NaN
 *      or an arbitrary 0.
 *   5. `attended === null` (never reviewed / unknown) -> treated the same as
 *      case 4, since there is no attendance signal either way.
 *
 * Result is always clamped to [0, 100].
 */
export function computeEventOutcome(review: EventOutcomeInput): number {
  if (review.attended === false) return clampScore(NO_SHOW_EVENT_OUTCOME);

  const reliability = review.reliability_score ?? DEFAULT_MISSING_SUBSCORE;
  const clinical = review.clinical_score;

  const outcome =
    clinical == null
      ? reliability * REVIEW_SCORE_SCALE
      : ((reliability + clinical) / 2) * REVIEW_SCORE_SCALE;

  return clampScore(outcome);
}

/**
 * Applies the CLAUDE.md-specified post-event blend:
 * new = 0.7×old + 0.3×eventOutcome, clamped to [0, 100].
 */
export function recomputeVScoreAfterReview(oldScore: number, review: EventOutcomeInput): number {
  const outcome = computeEventOutcome(review);
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
