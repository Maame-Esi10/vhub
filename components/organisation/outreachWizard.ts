import type { ExperienceLevel, OutreachRoleType, VolunteerCategory } from '@/types/database';
// From the module, not the '@/components/ui' barrel. This file is pure logic
// with no UI in it, and the barrel's first export pulls in React Native — which
// made the module unloadable in Jest, whose config here has no RN preset.
import { isTimeAfter, isTodayOrFutureDate, parseClockTime } from '@/components/ui/dateUtils';

/** One per-category role slot as the wizard holds it, before it has a database id. */
export interface RoleDraft {
  category: VolunteerCategory;
  roleType: OutreachRoleType;
  /** Null means any level. A FLOOR, not an exact match. */
  minExperienceLevel: ExperienceLevel | null;
  slotsTotal: number;
}

/**
 * Local Create Outreach wizard state. Field values are kept as plain strings
 * (matching the masked `Input` entry) and translated to `CreateOutreachParams`
 * only at submit time — see `toCreateOutreachParams`.
 */
export interface OutreachWizardState {
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  region: string | null;
  district: string | null;
  locationName: string;
  requiredSkills: string[];
  requiredCategory: string | null;
  roleType: OutreachRoleType | null;
  slotsTotal: number;
  /**
   * Per-category role slots. EMPTY means single-role mode, where
   * requiredCategory / roleType / slotsTotal above describe the requirement —
   * the same "presence of rows, and nothing else" rule the database uses, so
   * the form and the schema agree on what mode means.
   *
   * In multi-role mode `slotsTotal` is NOT sent on submit: the database derives
   * the outreach total as the sum of its roles, and a client value would be
   * overwritten by the trigger.
   */
  roles: RoleDraft[];
  /**
   * Cloudinary URL of the flyer, or null. Uploaded as soon as it is picked
   * rather than held as a local file and sent on submit: the wizard has four
   * steps and an abandoned draft would otherwise leave the org waiting on an
   * upload at the very end. An orphaned Cloudinary asset from an abandoned
   * wizard is the accepted cost, and is cheap on the free tier.
   */
  flyerUrl: string | null;
}

export const INITIAL_WIZARD_STATE: OutreachWizardState = {
  title: '',
  description: '',
  date: '',
  startTime: '',
  endTime: '',
  region: null,
  district: null,
  locationName: '',
  requiredSkills: [],
  requiredCategory: null,
  roleType: null,
  slotsTotal: 5,
  roles: [],
  flyerUrl: null,
};

export type WizardFieldError = Partial<
  Record<'title' | 'date' | 'startTime' | 'endTime' | 'slotsTotal', string>
>;

/** Validates the fields the spec calls out explicitly: title, date, time ordering, slots. */
export function validateWizard(state: OutreachWizardState): WizardFieldError {
  const errors: WizardFieldError = {};

  if (!state.title.trim()) {
    errors.title = 'Give this outreach a title.';
  }

  if (!state.date.trim()) {
    errors.date = 'Pick an event date.';
  } else if (!isTodayOrFutureDate(state.date)) {
    errors.date = 'Enter a valid date (YYYY-MM-DD) that is today or later.';
  }

  if (state.startTime && !parseClockTime(state.startTime)) {
    errors.startTime = 'Enter a valid 24-hour time (HH:MM).';
  }
  if (state.endTime && !parseClockTime(state.endTime)) {
    errors.endTime = 'Enter a valid 24-hour time (HH:MM).';
  }
  if (
    state.startTime &&
    state.endTime &&
    parseClockTime(state.startTime) &&
    parseClockTime(state.endTime) &&
    !isTimeAfter(state.startTime, state.endTime)
  ) {
    errors.endTime = 'End time must be after the start time.';
  }

  if (!Number.isInteger(state.slotsTotal) || state.slotsTotal < 1) {
    errors.slotsTotal = 'Enter at least 1 volunteer slot.';
  }

  return errors;
}

export function hasWizardErrors(errors: WizardFieldError): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Validation for EDITING an outreach that already exists.
 *
 * Identical to `validateWizard` with one deliberate relaxation: a date in the
 * past is only an error if the organisation actually CHANGED it. Creating an
 * event in the past is meaningless, but an event that has already happened is
 * an ordinary thing to edit — fixing a typo in the title of last month's
 * clinic, or attaching the flyer to an outreach posted before flyers existed
 * (which is the case for every outreach on the platform predating that
 * feature). Refusing to save those because their own date is behind us would
 * make the whole screen useless for exactly the events that need it most.
 *
 * Rescheduling INTO the past is still refused, which is the rule that matters.
 */
export function validateOutreachEdit(
  state: OutreachWizardState,
  originalDate: string
): WizardFieldError {
  const errors = validateWizard(state);

  if (errors.date && state.date.trim() === originalDate) {
    delete errors.date;
  }

  return errors;
}

/**
 * Hydrates the form from the rows already in the database.
 *
 * `roles` empty means single-role mode, exactly as everywhere else — so an
 * outreach with no role rows opens on the "Any volunteers" side of the toggle
 * with its own category, role type and total, and one with role rows opens on
 * "Specific roles". Nothing infers the mode from anything but the rows.
 */
export function wizardStateFromOutreach(
  outreach: {
    title: string;
    description: string | null;
    date: string;
    start_time: string | null;
    end_time: string | null;
    region: string | null;
    district: string | null;
    location_name: string | null;
    required_skills: string[] | null;
    required_category: string | null;
    role_type: OutreachRoleType | null;
    slots_total: number;
    flyer_url: string | null;
  },
  roles: {
    category: VolunteerCategory;
    role_type: OutreachRoleType;
    min_experience_level: ExperienceLevel | null;
    slots_total: number;
  }[]
): OutreachWizardState {
  return {
    title: outreach.title,
    description: outreach.description ?? '',
    date: outreach.date,
    // The pickers read and write 'HH:MM'; Postgres `time` comes back as
    // 'HH:MM:SS', and the extra seconds would fail parseClockTime on save.
    startTime: trimClockSeconds(outreach.start_time),
    endTime: trimClockSeconds(outreach.end_time),
    region: outreach.region,
    district: outreach.district,
    locationName: outreach.location_name ?? '',
    requiredSkills: outreach.required_skills ?? [],
    requiredCategory: outreach.required_category,
    roleType: outreach.role_type,
    slotsTotal: outreach.slots_total,
    roles: roles.map((role) => ({
      category: role.category,
      roleType: role.role_type,
      minExperienceLevel: role.min_experience_level,
      slotsTotal: role.slots_total,
    })),
    flyerUrl: outreach.flyer_url,
  };
}

function trimClockSeconds(time: string | null): string {
  if (!time) return '';
  return time.slice(0, 5);
}

/** True when the role list differs from the one already stored, in any field. */
export function rolesChanged(before: RoleDraft[], after: RoleDraft[]): boolean {
  if (before.length !== after.length) return true;

  const key = (role: RoleDraft) =>
    `${role.category}|${role.roleType}|${role.minExperienceLevel ?? 'any'}|${role.slotsTotal}`;
  const beforeKeys = before.map(key).sort();
  const afterKeys = after.map(key).sort();

  return beforeKeys.some((value, index) => value !== afterKeys[index]);
}
