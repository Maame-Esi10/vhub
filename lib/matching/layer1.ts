/**
 * Layer 1 deterministic match scorer (CLAUDE.md -> Matching Engine, spec final).
 *
 * PURE. No I/O, no network, no Supabase, no Date.now() (the only clock-ish
 * behaviour is deriving a weekday from the outreach's own `date` string,
 * which is a pure parse of that string, not "now"). Safe to import from the
 * mobile app AND the serverless API.
 *
 *   Total = Skills x35 + Category x20 + Location x20 + Availability x15 + Experience x10
 *
 * Each component is normalised to 0-1 before weighting; the weighted total is
 * 0-100. Every exported component function is individually unit-tested in
 * lib/matching/__tests__/layer1.test.ts, and `computeLayer1MatchScore` is the
 * single entry point that combines them with a per-component breakdown for
 * the Info Hub's "why this match" display.
 *
 * Layer 2 (serverless-only Gemini semantic skill matching) is NOT implemented
 * here -- this file only exposes an optional injection point
 * (`skillsScore`'s `equivalences` param / `computeLayer1MatchScore`'s
 * `options.skillEquivalences`) so the api-engineer's Layer 2 code can supply
 * semantic matches without this function's signature or any Layer 1 caller
 * changing. Layer 1 itself never calls out to anything.
 */

import type { ExperienceLevel, OutreachRoleType, VolunteerCategory } from '@/types/database';
import { categoryMatchScore, VOLUNTEER_CATEGORIES } from '@/constants/categories';

/** Point value each component contributes when its normalised score is 1.0. */
export const LAYER1_WEIGHTS = {
  skills: 35,
  category: 20,
  location: 20,
  availability: 15,
  experience: 10,
} as const;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function toNormalizedSet(values: readonly string[] | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const value of values ?? []) {
    const normalized = normalizeTag(value);
    if (normalized) set.add(normalized);
  }
  return set;
}

// ---------------------------------------------------------------------------
// Skills (x35)
// ---------------------------------------------------------------------------

/**
 * Skills component (CLAUDE.md: "overlap of skill_tags vs required_skills
 * divided by the size of the larger set").
 *
 * ASSUMPTION flagged for owner sign-off (docs/REPORT_NOTES.md): CLAUDE.md
 * doesn't state what an empty list means. We define an empty
 * `requiredSkills` list OR an empty `volunteerTags` list as scoring 0 (not a
 * "free pass" 1.0) -- Skills is the single largest weight (35 of 100), and
 * missing data on either side should never silently max it out.
 *
 * Matching is case-insensitive and whitespace-trimmed, and duplicate/
 * whitespace/case variants of the same tag are deduplicated before
 * comparing (`["Wound Care", "wound care "]` counts once), so denominators
 * reflect distinct skills, not raw array length.
 *
 * `equivalences` is an optional injected map of normalized-skill ->
 * normalized-equivalent-skills (e.g. "venipuncture" -> {"blood draw"}),
 * reserved for the serverless Layer 2 (Gemini semantic matching) to pass in
 * without changing this function's signature. Layer 1 itself never computes
 * or looks up equivalences on its own; when omitted, matching is purely
 * literal (case/whitespace-insensitive string equality).
 */
export function skillsScore(
  volunteerTags: readonly string[] | null | undefined,
  requiredSkills: readonly string[] | null | undefined,
  equivalences?: ReadonlyMap<string, ReadonlySet<string>>
): number {
  const volunteerSet = toNormalizedSet(volunteerTags);
  const requiredSet = toNormalizedSet(requiredSkills);

  if (volunteerSet.size === 0 || requiredSet.size === 0) return 0;

  const areEquivalent = (a: string, b: string): boolean => {
    if (a === b) return true;
    if (!equivalences) return false;
    return equivalences.get(a)?.has(b) === true || equivalences.get(b)?.has(a) === true;
  };

  let matched = 0;
  for (const required of requiredSet) {
    for (const owned of volunteerSet) {
      if (areEquivalent(required, owned)) {
        matched += 1;
        break;
      }
    }
  }

  const denominator = Math.max(volunteerSet.size, requiredSet.size);
  return matched / denominator;
}

// ---------------------------------------------------------------------------
// Category (x20)
// ---------------------------------------------------------------------------

const KNOWN_VOLUNTEER_CATEGORIES: ReadonlySet<string> = new Set(
  VOLUNTEER_CATEGORIES.map((c) => c.value)
);

function isVolunteerCategory(value: string | null | undefined): value is VolunteerCategory {
  return !!value && KNOWN_VOLUNTEER_CATEGORIES.has(value);
}

/**
 * Category component. Delegates to `categoryMatchScore` in
 * constants/categories.ts (the single source of truth for exact/related/none
 * -- do not re-implement the pairing rules here). `outreach.required_category`
 * is typed as a plain `string | null` in types/database.ts (not narrowed to
 * `VolunteerCategory`), so an unrecognised/legacy string is treated the same
 * as a null required category (categoryMatchScore's own "nothing to match
 * on" -> 0 rule), rather than throwing.
 */
export function categoryScore(
  volunteerCategory: VolunteerCategory | null | undefined,
  requiredCategory: string | null | undefined
): 0 | 0.5 | 1 {
  const normalizedRequired = isVolunteerCategory(requiredCategory) ? requiredCategory : null;
  return categoryMatchScore(volunteerCategory, normalizedRequired);
}

// ---------------------------------------------------------------------------
// Location (x20)
// ---------------------------------------------------------------------------

/**
 * Location component: same district = 1.0, same region (different or
 * unspecified district) = 0.5, different region = 0. A null/blank region or
 * district on either side can't be verified, so it scores 0 for that tier's
 * comparison (falls through to the next, less specific tier, or to 0).
 * Comparison is case-insensitive and whitespace-trimmed.
 */
export function locationScore(
  volunteer: { region?: string | null; district?: string | null },
  outreach: { region?: string | null; district?: string | null }
): 0 | 0.5 | 1 {
  const norm = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase();

  const vDistrict = norm(volunteer.district);
  const oDistrict = norm(outreach.district);
  if (vDistrict && oDistrict && vDistrict === oDistrict) return 1;

  const vRegion = norm(volunteer.region);
  const oRegion = norm(outreach.region);
  if (vRegion && oRegion && vRegion === oRegion) return 0.5;

  return 0;
}

// ---------------------------------------------------------------------------
// Availability (x15)
// ---------------------------------------------------------------------------

type Slot = 'morning' | 'afternoon' | 'evening';
type DayAbbrev = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

// Index-aligned with JS/Date's getUTCDay() (0 = Sunday .. 6 = Saturday).
const DAYS_BY_UTC_INDEX: readonly DayAbbrev[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const VALID_DAYS: ReadonlySet<string> = new Set(DAYS_BY_UTC_INDEX);
const VALID_SLOTS: readonly Slot[] = ['morning', 'afternoon', 'evening'];

// Slot windows in minutes-since-midnight. Boundaries are shared on purpose
// (morning ends exactly where afternoon begins, etc.) to mirror CLAUDE.md's
// literal "morning <= 12:00, afternoon 12:00-17:00" definition, where noon
// belongs to both the end of morning and the start of afternoon.
const SLOT_WINDOWS_MINUTES: Record<Slot, readonly [number, number]> = {
  morning: [0, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 24 * 60],
};

function parseTimeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Which of the three fixed slot windows the outreach's [start_time, end_time)
 * overlaps. An event spanning multiple windows (e.g. 10:00-19:00) overlaps
 * all of them -- ANY one being available is enough for the volunteer.
 *
 * ASSUMPTION (owner sign-off, docs/REPORT_NOTES.md): a missing or
 * unparseable start/end time -- OR a malformed range where end <= start --
 * is treated as "all day", so any slot on the matching weekday counts. This
 * mirrors the task brief's explicit example ("no times -> treat as all-day")
 * and extends the same fail-open logic to other unparseable/nonsensical time
 * data, rather than silently failing the whole availability check over a
 * data-quality issue unrelated to the volunteer's actual availability.
 */
function overlappingSlots(
  startTime: string | null | undefined,
  endTime: string | null | undefined
): ReadonlySet<Slot> {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);

  if (start === null || end === null || end <= start) {
    return new Set(VALID_SLOTS);
  }

  const result = new Set<Slot>();
  for (const slot of VALID_SLOTS) {
    const [windowStart, windowEnd] = SLOT_WINDOWS_MINUTES[slot];
    if (start <= windowEnd && end >= windowStart) result.add(slot);
  }
  return result;
}

/**
 * Derives the outreach's weekday from its `date` (YYYY-MM-DD) as a pure,
 * timezone-safe calendar-date parse -- Date.UTC(y, m-1, d) so a "2026-08-01"
 * string always means the same calendar day regardless of the host machine's
 * local timezone (Ghana is UTC+0, but the scorer must be correct wherever it
 * runs, e.g. a CI box or a device in another timezone).
 *
 * ASSUMPTION (owner sign-off, docs/REPORT_NOTES.md): a missing or
 * unparseable/invalid date (including calendar-impossible dates like
 * 2026-02-30, caught via a round-trip check) means we cannot verify which
 * weekday token to look for, so availabilityScore fails CLOSED (0) rather
 * than guessing or assuming a match. This favours under- over over-matching
 * on bad/missing outreach data.
 */
function weekdayFromDate(date: string | null | undefined): DayAbbrev | null {
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const isValidCalendarDate =
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day;
  if (!isValidCalendarDate) return null;

  return DAYS_BY_UTC_INDEX[utcDate.getUTCDay()] ?? null;
}

function parseAvailabilityToken(token: string): { day: DayAbbrev; slot: Slot } | null {
  const parts = token.trim().toLowerCase().split('_');
  if (parts.length !== 2) return null;
  const [day, slot] = parts;
  if (!day || !slot) return null;
  if (!VALID_DAYS.has(day)) return null;
  if (!(VALID_SLOTS as readonly string[]).includes(slot)) return null;
  return { day: day as DayAbbrev, slot: slot as Slot };
}

/**
 * Availability component: 1.0 if the volunteer's `availability_slots`
 * contains at least one "{day}_{slot}" token whose day matches the
 * outreach's weekday AND whose slot overlaps the outreach's time window;
 * else 0. Unknown/malformed tokens (bad weekday spelling, missing
 * underscore, unrecognised slot name, stray whitespace/case) are silently
 * ignored rather than thrown on, so one bad token in a volunteer's array
 * can't crash matching for the whole app -- see the "unknown weekday
 * strings" test cases.
 */
export function availabilityScore(
  availabilitySlots: readonly string[] | null | undefined,
  outreach: {
    date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
  }
): 0 | 1 {
  const weekday = weekdayFromDate(outreach.date);
  if (!weekday) return 0;

  const slots = overlappingSlots(outreach.start_time, outreach.end_time);

  for (const token of availabilitySlots ?? []) {
    const parsed = parseAvailabilityToken(token);
    if (parsed && parsed.day === weekday && slots.has(parsed.slot)) return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Experience (x10)
// ---------------------------------------------------------------------------

const EXPERIENCE_SCORES: Record<ExperienceLevel, number> = {
  experienced: 1,
  intermediate: 0.6,
  beginner: 0.3,
};

/** Experience component: experienced 1.0, intermediate 0.6, beginner 0.3, null/unknown 0. */
export function experienceScore(level: ExperienceLevel | null | undefined): number {
  if (!level) return 0;
  return EXPERIENCE_SCORES[level] ?? 0;
}

// ---------------------------------------------------------------------------
// Combined scorer
// ---------------------------------------------------------------------------

/**
 * Subset of `VolunteerProfile` + `Profile` fields the scorer needs --
 * deliberately not the full DB rows, so this stays trivially constructible
 * in tests and reusable regardless of how callers fetch/join the data.
 */
export interface Layer1VolunteerInput {
  category?: VolunteerCategory | null;
  skill_tags?: readonly string[] | null;
  experience_level?: ExperienceLevel | null;
  availability_slots?: readonly string[] | null;
  region?: string | null;
  district?: string | null;
}

/** Subset of `Outreach` fields the scorer needs. */
export interface Layer1OutreachInput {
  required_skills?: readonly string[] | null;
  required_category?: string | null;
  /**
   * Drives the support-role category override below. When 'support', the
   * category component is forced to 1.0 (see computeLayer1MatchScore).
   */
  role_type?: OutreachRoleType | null;
  region?: string | null;
  district?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

export interface Layer1ComponentBreakdown {
  /** Normalised 0-1 score for this component. */
  raw: number;
  /** Points this component contributes at raw = 1.0 (e.g. 35 for skills). */
  weight: number;
  /** raw * weight -- points actually earned. */
  weighted: number;
}

export interface Layer1MatchResult {
  /** 0-100 weighted total. */
  total: number;
  skills: Layer1ComponentBreakdown;
  category: Layer1ComponentBreakdown;
  location: Layer1ComponentBreakdown;
  availability: Layer1ComponentBreakdown;
  experience: Layer1ComponentBreakdown;
}

export interface Layer1Options {
  /** Optional Layer-2-injected skill equivalence map; see `skillsScore`. */
  skillEquivalences?: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Top-level Layer 1 entry point: computes the weighted 0-100 total AND a
 * per-component breakdown (raw 0-1 score + weighted points) so /api/match
 * and the Info Hub's "why this match" UI can both consume it.
 */
export function computeLayer1MatchScore(
  volunteer: Layer1VolunteerInput,
  outreach: Layer1OutreachInput,
  options?: Layer1Options
): Layer1MatchResult {
  const build = (raw: number, weight: number): Layer1ComponentBreakdown => ({
    raw: roundTo(raw, 4),
    weight,
    weighted: roundTo(raw * weight, 4),
  });

  const skills = build(
    skillsScore(volunteer.skill_tags, outreach.required_skills, options?.skillEquivalences),
    LAYER1_WEIGHTS.skills
  );
  // Support-role category override (owner-approved, docs/REPORT_NOTES.md):
  // a `support` outreach needs no specific profession, so every volunteer
  // fully satisfies its category component. Clinical outreaches score category
  // strictly via categoryScore. Applied here rather than inside categoryScore
  // so that function stays a pure category-vs-category comparison.
  const categoryRaw =
    outreach.role_type === 'support'
      ? 1
      : categoryScore(volunteer.category, outreach.required_category);
  const category = build(categoryRaw, LAYER1_WEIGHTS.category);
  const location = build(locationScore(volunteer, outreach), LAYER1_WEIGHTS.location);
  const availability = build(
    availabilityScore(volunteer.availability_slots, outreach),
    LAYER1_WEIGHTS.availability
  );
  const experience = build(experienceScore(volunteer.experience_level), LAYER1_WEIGHTS.experience);

  const total = roundTo(
    skills.weighted +
      category.weighted +
      location.weighted +
      availability.weighted +
      experience.weighted,
    2
  );

  return { total, skills, category, location, availability, experience };
}
