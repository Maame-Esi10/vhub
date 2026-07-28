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
