/**
 * Multi-role scoring — an outreach that wants "2 doctors, 3 nurses, 5
 * students" rather than a single professional category.
 *
 * ADDITIVE ONLY. `computeLayer1MatchScore` in ./layer1.ts is not touched and
 * remains the path for single-role outreaches, so no score that exists today
 * moves. An outreach with no roles delegates straight back to it.
 *
 * Pure functions, no I/O. See docs/MULTI_ROLE_PLAN.md.
 */

import {
  computeLayer1MatchScore,
  experienceScore,
  type Layer1MatchResult,
  type Layer1Options,
  type Layer1OutreachInput,
  type Layer1VolunteerInput,
} from '@/lib/matching/layer1';
import type { ExperienceLevel, OutreachRoleType, VolunteerCategory } from '@/types/database';

/** One role of a multi-role outreach, as the scorer needs it. */
export interface RoleInput {
  id: string;
  category: VolunteerCategory | null;
  role_type: OutreachRoleType | null;
  /** Minimum acceptable experience. Null means any level. */
  min_experience_level?: ExperienceLevel | null;
  /** Null inherits the outreach's required_skills. */
  required_skills?: readonly string[] | null;
  slots_total: number;
  slots_filled: number;
}

export interface MultiRoleMatchResult extends Layer1MatchResult {
  /** The role that produced this score, or null for a single-role outreach. */
  bestRoleId: string | null;
  /** True when that role has no places left. The score is still real. */
  bestRoleIsFull: boolean;
  /** True when the volunteer is below the role's minimum experience. */
  bestRoleBelowMinimumExperience: boolean;
}

/** Places left on a role, floored at zero. */
export function roleHasSpace(role: Pick<RoleInput, 'slots_total' | 'slots_filled'>): boolean {
  return role.slots_filled < role.slots_total;
}

/**
 * Does the volunteer clear the role's experience floor?
 *
 * `min_experience_level` is a MINIMUM, not an exact match. An exact match would
 * mean a "any level" nurse role could not accept an experienced nurse, which is
 * absurd; and it would make "1 experienced lead + 4 of any level" impossible to
 * express, which is the pattern the whole field exists for.
 *
 * Comparison rides `experienceScore` from layer1 rather than a second ordering
 * of the same enum — one definition of what "more experienced" means.
 */
export function meetsMinimumExperience(
  volunteerLevel: ExperienceLevel | null | undefined,
  minimumLevel: ExperienceLevel | null | undefined
): boolean {
  if (!minimumLevel) return true; // "any level"
  return experienceScore(volunteerLevel) >= experienceScore(minimumLevel);
}

/**
 * Scores a volunteer against every role and returns the BEST result.
 *
 * **Why the maximum and not the average.** A volunteer is one person who will
 * fill one slot. Averaging across roles would score a nurse on a
 * nurses-and-doctors event at roughly 0.75 on category, when their real fit for
 * the role they would actually take is 1.0. The match score answers "how well
 * does this person fit a place on this event", and the answer is the best place
 * available to them.
 *
 * **Full roles are still scored, not skipped.** A volunteer whose only match is
 * a full role should see a real score marked "this role is full", rather than a
 * misleadingly low one computed against a role that suits them worse. This is
 * the feed pre-filter's principle: only exclude the genuinely impossible.
 *
 * **Roles below the volunteer's experience are still scored too**, and flagged.
 * The organisation decides whether a floor is firm; the matcher's job is to
 * report fit, not to silently disqualify.
 *
 * Ordering of equal scores is deterministic — more places left first, then role
 * id — so the same inputs always name the same winning role.
 */
export function computeMultiRoleMatchScore(
  volunteer: Layer1VolunteerInput,
  outreach: Layer1OutreachInput,
  roles: readonly RoleInput[],
  options?: Layer1Options
): MultiRoleMatchResult {
  // Single-role mode: unchanged behaviour, delegated wholesale.
  if (roles.length === 0) {
    return {
      ...computeLayer1MatchScore(volunteer, outreach, options),
      bestRoleId: null,
      bestRoleIsFull: false,
      bestRoleBelowMinimumExperience: false,
    };
  }

  let best: MultiRoleMatchResult | null = null;
  let bestRole: RoleInput | null = null;

  for (const role of roles) {
    // The role supplies its own category, role_type and skills; anything it
    // leaves null falls back to the outreach's own value.
    const roleOutreach: Layer1OutreachInput = {
      ...outreach,
      required_category: role.category ?? outreach.required_category ?? null,
      role_type: role.role_type ?? outreach.role_type ?? null,
      required_skills: role.required_skills ?? outreach.required_skills ?? null,
    };

    const result = computeLayer1MatchScore(volunteer, roleOutreach, options);

    const candidate: MultiRoleMatchResult = {
      ...result,
      bestRoleId: role.id,
      bestRoleIsFull: !roleHasSpace(role),
      bestRoleBelowMinimumExperience: !meetsMinimumExperience(
        volunteer.experience_level,
        role.min_experience_level
      ),
    };

    if (best === null || bestRole === null || isBetter(candidate, role, best, bestRole)) {
      best = candidate;
      bestRole = role;
    }
  }

  return best!;
}

/**
 * Tie-breaking, in order: higher score, then an open role over a full one, then
 * more places left, then role id.
 *
 * The open-over-full rule matters: two roles a volunteer fits equally should
 * resolve to the one they can actually join.
 */
function isBetter(
  candidate: MultiRoleMatchResult,
  candidateRole: RoleInput,
  incumbent: MultiRoleMatchResult,
  incumbentRole: RoleInput
): boolean {
  if (candidate.total !== incumbent.total) return candidate.total > incumbent.total;

  const candidateOpen = roleHasSpace(candidateRole);
  const incumbentOpen = roleHasSpace(incumbentRole);
  if (candidateOpen !== incumbentOpen) return candidateOpen;

  const candidateSpace = candidateRole.slots_total - candidateRole.slots_filled;
  const incumbentSpace = incumbentRole.slots_total - incumbentRole.slots_filled;
  if (candidateSpace !== incumbentSpace) return candidateSpace > incumbentSpace;

  return candidateRole.id < incumbentRole.id;
}

/**
 * Is applying for this role gated on identity verification?
 *
 * The gate reads the ROLE, falling back to the outreach when no role was
 * chosen (single-role mode). This is the per-application half of what
 * `application_role_is_clinical()` enforces in the database — kept in step with
 * it deliberately, so the UI can block early and the database can block
 * finally.
 */
export function roleRequiresVerification(
  role: Pick<RoleInput, 'role_type'> | null | undefined,
  outreachRoleType: OutreachRoleType | null | undefined
): boolean {
  if (role) return role.role_type === 'clinical';
  return outreachRoleType === 'clinical';
}

/** Summary line for a card: "2 doctors · 3 nurses · 5 students". */
export function describeRoles(
  roles: readonly Pick<RoleInput, 'category' | 'slots_total'>[],
  labelFor: (category: VolunteerCategory) => string
): string {
  return roles
    .filter((role): role is typeof role & { category: VolunteerCategory } => role.category !== null)
    .map((role) => `${role.slots_total} ${labelFor(role.category)}`)
    .join(' · ');
}
