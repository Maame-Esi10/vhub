/**
 * Feed pre-filter policy (owner decision, 2026-08-05).
 *
 * PURE. The scoring pipeline in /api/match's rank_feed mode fetches candidate
 * outreaches before scoring them, restricted to the volunteer's own region and
 * its neighbours. That is a scalability measure -- it makes ranking cost grow
 * with the number of RELEVANT outreaches rather than the total on the platform
 * -- and it carries one risk: a volunteer in a quiet region seeing an empty
 * feed purely because the filter was strict.
 *
 * The widening rule below is the guard against that, kept here rather than
 * inline in the route so it can be unit-tested. A Next.js App Router route
 * file may not export arbitrary helpers, so testing it in place is not an
 * option.
 */

/**
 * Below this many candidates, the region restriction is abandoned and the
 * whole platform is searched instead.
 *
 * 5 is a floor on a USEFUL feed, not on a non-empty one: a volunteer with two
 * or three nearby options has effectively no choice, and the second query
 * costs one round trip against a table that is already filtered by status.
 */
export const FEED_MIN_CANDIDATES = 5;

/**
 * Whether to re-run the candidate query without the region restriction.
 *
 * Three conditions, all required:
 *   - `hasExplicitRegionFilter`: the volunteer asked for one specific region.
 *     Their own filter always wins; widening would override a deliberate
 *     choice and show them events they explicitly filtered out.
 *   - `reachableRegionCount`: zero means no region restriction was applied in
 *     the first place (missing or unrecognised profile region), so the first
 *     query already searched everywhere and repeating it would just waste a
 *     round trip.
 *   - `candidateCount`: the whole point -- too few to be worth showing.
 */
export function shouldWidenFeedSearch(params: {
  hasExplicitRegionFilter: boolean;
  reachableRegionCount: number;
  candidateCount: number;
}): boolean {
  if (params.hasExplicitRegionFilter) return false;
  if (params.reachableRegionCount === 0) return false;
  return params.candidateCount < FEED_MIN_CANDIDATES;
}
