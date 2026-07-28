// Single source of truth for the type is types/database.ts (it mirrors the
// volunteer_category Postgres enum). Re-exported here so existing importers of
// '@/constants/categories' keep working, without a second definition to drift.
import type { VolunteerCategory } from '@/types/database';

export type { VolunteerCategory };

// Order: qualified professionals, then students, then support roles.
export const VOLUNTEER_CATEGORIES: { value: VolunteerCategory; label: string }[] = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'midwife', label: 'Midwife' },
  { value: 'pharmacist', label: 'Pharmacist' },
  { value: 'student', label: 'Health or Medical Student' },
  { value: 'first_aider', label: 'First Aider' },
  { value: 'other', label: 'Other' },
];

/**
 * Related-category map for the Layer 1 matching engine's category component
 * (CLAUDE.md → Matching Engine). This is the single source of truth the Phase 3
 * scorer (lib/matching/layer1.ts) reads instead of scattering the pairings
 * across conditionals.
 *
 * Relations (symmetric — if A lists B, B lists A):
 *   - doctor / nurse / midwife are related to one another (clinical peers).
 *   - pharmacist and student are related.
 *   - student is additionally related to nurse, doctor, and midwife (a health
 *     or medical student is a partial fit for any clinical role).
 *   - first_aider and other are related to nothing.
 * See docs/REPORT_NOTES.md.
 */
export const RELATED_CATEGORIES: Record<VolunteerCategory, readonly VolunteerCategory[]> = {
  doctor: ['nurse', 'midwife', 'student'],
  nurse: ['doctor', 'midwife', 'student'],
  midwife: ['doctor', 'nurse', 'student'],
  pharmacist: ['student'],
  student: ['pharmacist', 'nurse', 'doctor', 'midwife'],
  first_aider: [],
  other: [],
};

/**
 * Category component of the Layer 1 match score (CLAUDE.md → Matching Engine):
 * exact match = 1.0, related = 0.5, otherwise 0. Pure and I/O-free; the Phase 3
 * scorer calls this so the exact/related/none rule lives in exactly one place.
 * Either side may be null (a volunteer without a set category, or an outreach
 * that names no required category), which scores 0 — nothing to match on.
 */
export function categoryMatchScore(
  volunteerCategory: VolunteerCategory | null | undefined,
  requiredCategory: VolunteerCategory | null | undefined
): 0 | 0.5 | 1 {
  if (!volunteerCategory || !requiredCategory) return 0;
  if (volunteerCategory === requiredCategory) return 1;
  return RELATED_CATEGORIES[requiredCategory].includes(volunteerCategory) ? 0.5 : 0;
}

export type ExperienceLevel = 'beginner' | 'intermediate' | 'experienced';

export const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'experienced', label: 'Experienced' },
];

export type RoleType = 'clinical' | 'support';

export const ROLE_TYPES: { value: RoleType; label: string }[] = [
  { value: 'clinical', label: 'Clinical' },
  { value: 'support', label: 'Support' },
];

export type OutreachStatus = 'draft' | 'open' | 'closed' | 'completed';

export const OUTREACH_STATUSES: { value: OutreachStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'completed', label: 'Completed' },
];

export type ApplicationType = 'quick_join' | 'full';

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'waitlisted' | 'cancelled';

export const APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'cancelled', label: 'Cancelled' },
];
