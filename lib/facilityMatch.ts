/**
 * Finds an organisation's likely entries in HeFRA's register of licensed
 * health facilities (built 2026-09-24). Pure: no I/O, fully unit-tested.
 *
 * WHAT IT IS FOR. An admin reviewing an organisation that calls itself a
 * hospital or clinic can see at a glance whether HeFRA licenses a facility of
 * that name, where, and until when. It is EVIDENCE for the admin's judgement
 * and never a gate: most organisations that run outreach are NGOs, churches
 * and student associations, which are not facilities and will never appear on
 * the register. "No match" must never read as "suspicious" on its own.
 *
 * HOW NAMES ARE COMPARED. Both names are reduced to their words, minus the
 * company suffixes (LTD, LIMITED, LBG) and filler (THE, OF, AND). What is left
 * is weighted: a DISTINCTIVE word ("Akuaba", "Emmanuel", "Tamale") carries the
 * match, while a GENERIC word ("hospital", "clinic", "medical") counts for
 * little, because two unrelated places both called "... Medical Centre" share
 * nothing that matters. The score is the share of the organisation's own
 * weighted words found in the facility's name, so a long register entry is not
 * penalised for extra words, and a region agreement nudges the score up.
 */

export interface Facility {
  name: string;
  type: string | null;
  region: string | null;
  location: string | null;
  ownership: string;
  /** ISO date, yyyy-mm-dd. */
  expires: string;
}

export interface FacilityMatch extends Facility {
  /** 0 to 1. */
  score: number;
  /** True when the licence date is before `today`. */
  expired: boolean;
}

/** Dropped entirely: company suffixes and filler carry no identity at all. */
const IGNORED = new Set([
  'LTD', 'LIMITED', 'LBG', 'CO', 'COMPANY', 'THE', 'OF', 'AND', 'FOR', 'IN', 'A', 'AT', 'ON', 'TO', 'BY', 'WITH', 'S', 'GH', 'GHANA', 'PLC', 'INC', 'ENTERPRISE', 'ENTERPRISES',
]);

/** Kept but light: words half the register shares. */
const GENERIC = new Set([
  'HOSPITAL', 'CLINIC', 'CLINICS', 'MEDICAL', 'CENTRE', 'CENTER', 'HEALTH', 'HEALTHCARE', 'CARE', 'SERVICES', 'SERVICE',
  'MATERNITY', 'HOME', 'DIAGNOSTIC', 'DIAGNOSTICS', 'LABORATORY', 'LAB', 'SPECIALIST', 'CHPS', 'COMPOUND', 'POLYCLINIC',
  'DENTAL', 'EYE', 'GOVERNMENT', 'DISTRICT', 'MUNICIPAL', 'REGIONAL', 'COMMUNITY', 'MEMORIAL', 'FAMILY', 'ST', 'SAINT',
  'PRIMARY', 'IMAGING', 'OPTOMETRY', 'FOUNDATION', 'MISSION', 'INTERNATIONAL', 'GENERAL', 'NEW',
]);

const GENERIC_WEIGHT = 0.15;

/**
 * Below this, a candidate is noise and is not shown. 0.6 rather than 0.5
 * because at 0.5 "Hope Medical Outreach" matched two unrelated "Hope" clinics
 * on one shared word out of two, which is a coincidence of names, not evidence.
 */
export const MATCH_THRESHOLD = 0.6;
const REGION_BONUS = 0.1;

/** Uppercase words with punctuation removed; `St.` and `St` become the same word. */
export function facilityWords(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 0 && !IGNORED.has(word));
}

function weight(word: string): number {
  return GENERIC.has(word) ? GENERIC_WEIGHT : 1;
}

/**
 * How much of `query`'s identity appears in `candidate`, from 0 to 1.
 *
 * Returns 0 when the query has no distinctive word at all ("Medical Centre"):
 * matching on generic words alone would list half the register as candidates.
 */
export function nameScore(query: string, candidate: string): number {
  const queryWords = [...new Set(facilityWords(query))];
  if (!queryWords.some((word) => !GENERIC.has(word))) return 0;

  const candidateWords = new Set(facilityWords(candidate));
  const total = queryWords.reduce((sum, word) => sum + weight(word), 0);
  const shared = queryWords.reduce((sum, word) => sum + (candidateWords.has(word) ? weight(word) : 0), 0);
  const distinctiveShared = queryWords.some((word) => !GENERIC.has(word) && candidateWords.has(word));

  // Sharing only generic words is never a match, however many there are.
  return distinctiveShared ? shared / total : 0;
}

function sameRegion(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The best register entries for an organisation, strongest first.
 *
 * `today` is a parameter, not `new Date()`, so a test can pin it and so the
 * caller decides what "expired" means (the server's clock, once).
 */
export function findFacilityMatches(
  facilities: readonly Facility[],
  organisationName: string,
  options: { region?: string | null; today: string; limit?: number }
): FacilityMatch[] {
  const limit = options.limit ?? 5;
  const matches: FacilityMatch[] = [];

  for (const facility of facilities) {
    const base = nameScore(organisationName, facility.name);
    if (base === 0) continue;
    const score = Math.min(1, base + (sameRegion(options.region, facility.region) ? REGION_BONUS : 0));
    if (score < MATCH_THRESHOLD) continue;
    matches.push({ ...facility, score, expired: facility.expires < options.today });
  }

  return matches
    .sort((a, b) => b.score - a.score || b.expires.localeCompare(a.expires))
    .slice(0, limit);
}
