import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrderedSkillPair {
  skillA: string;
  skillB: string;
}

/** Normalises a raw skill string the same way lib/matching/layer1.ts does (trim + lowercase). */
export function normalizeSkill(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Orders two normalised skills alphabetically so ("a","b") and ("b","a") hit
 * the same `skill_match_cache` row -- the table's UNIQUE (skill_a, skill_b)
 * constraint only dedupes rows that are already in the same order.
 */
export function orderPair(a: string, b: string): OrderedSkillPair {
  return a <= b ? { skillA: a, skillB: b } : { skillA: b, skillB: a };
}

function pairKey(pair: OrderedSkillPair): string {
  return `${pair.skillA}::${pair.skillB}`;
}

export function dedupePairs(pairs: readonly OrderedSkillPair[]): OrderedSkillPair[] {
  const seen = new Map<string, OrderedSkillPair>();
  for (const pair of pairs) {
    seen.set(pairKey(pair), pair);
  }
  return [...seen.values()];
}

/**
 * Looks up cached equivalence results for a set of (already-ordered) skill
 * pairs. Only exact (skill_a, skill_b) matches count as a cache hit -- pairs
 * not found here should be sent to Gemini (see gemini.ts) and then written
 * back with `upsertSkillCacheResults`.
 */
export async function lookupSkillCache(
  admin: SupabaseClient,
  pairs: readonly OrderedSkillPair[]
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (pairs.length === 0) return result;

  const distinctSkillA = [...new Set(pairs.map((p) => p.skillA))];
  const { data, error } = await admin
    .from("skill_match_cache")
    .select("skill_a, skill_b, is_match")
    .in("skill_a", distinctSkillA);

  if (error || !data) return result; // Cache read failure -- treat as "nothing cached", never throw.

  const wanted = new Set(pairs.map(pairKey));
  for (const row of data as { skill_a: string; skill_b: string; is_match: boolean }[]) {
    const key = `${row.skill_a}::${row.skill_b}`;
    if (wanted.has(key)) result.set(key, row.is_match);
  }
  return result;
}

/**
 * Best-effort cache write. Never throws -- a failed cache write must not
 * affect the match result the caller already computed; it only means the
 * next request re-asks Gemini for the same pair.
 */
export async function upsertSkillCacheResults(
  admin: SupabaseClient,
  results: readonly (OrderedSkillPair & { isMatch: boolean })[]
): Promise<void> {
  if (results.length === 0) return;
  try {
    await admin.from("skill_match_cache").upsert(
      results.map((r) => ({ skill_a: r.skillA, skill_b: r.skillB, is_match: r.isMatch })),
      { onConflict: "skill_a,skill_b" }
    );
  } catch {
    // Swallow -- see doc comment above.
  }
}

export function cacheKeyFor(pair: OrderedSkillPair): string {
  return pairKey(pair);
}
