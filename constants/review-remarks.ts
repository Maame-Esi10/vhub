/**
 * Prefilled review remarks (owner decision, 2026-08-05).
 *
 * Organisers give real feedback by tapping, not by writing prose. This is the
 * same friction argument that drives exception-based attendance: a review step
 * that is a chore does not get done, and a review that does not get done means
 * the accountability system silently does nothing.
 *
 * Slugs are what the database stores (`event_reviews.remark_chips`); labels
 * live here so wording can be reworded without a migration. Never rename a
 * slug that is already in use -- it would orphan every review that carries it.
 * Retiring one means dropping it from this list while leaving historical rows
 * readable.
 */

export type RemarkTone = 'positive' | 'constructive';

export interface ReviewRemark {
  slug: string;
  label: string;
  tone: RemarkTone;
}

export const REVIEW_REMARKS: readonly ReviewRemark[] = [
  { slug: 'punctual', label: 'Punctual', tone: 'positive' },
  { slug: 'great_with_patients', label: 'Great with patients', tone: 'positive' },
  { slug: 'skilled_and_confident', label: 'Skilled and confident', tone: 'positive' },
  { slug: 'helpful_to_the_team', label: 'Helpful to the team', tone: 'positive' },
  { slug: 'took_initiative', label: 'Took initiative', tone: 'positive' },
  { slug: 'calm_under_pressure', label: 'Calm under pressure', tone: 'positive' },
  { slug: 'arrived_late', label: 'Arrived late', tone: 'constructive' },
  { slug: 'needed_extra_supervision', label: 'Needed extra supervision', tone: 'constructive' },
  { slug: 'left_early', label: 'Left early', tone: 'constructive' },
  { slug: 'struggled_with_the_task', label: 'Struggled with the task', tone: 'constructive' },
];

export const POSITIVE_REMARKS = REVIEW_REMARKS.filter((r) => r.tone === 'positive');
export const CONSTRUCTIVE_REMARKS = REVIEW_REMARKS.filter((r) => r.tone === 'constructive');

const REMARKS_BY_SLUG = new Map(REVIEW_REMARKS.map((remark) => [remark.slug, remark]));

/**
 * Display label for a stored slug. Returns null for an unknown slug -- a
 * retired remark still sitting on an old review -- so callers can skip it
 * rather than rendering a raw slug at a volunteer.
 */
export function getRemarkLabel(slug: string): string | null {
  return REMARKS_BY_SLUG.get(slug)?.label ?? null;
}

export function getRemarkTone(slug: string): RemarkTone | null {
  return REMARKS_BY_SLUG.get(slug)?.tone ?? null;
}
