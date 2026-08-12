import type { ExperienceLevel, OutreachRoleType, VolunteerCategory } from '@/types/database';
import { isTimeAfter, isTodayOrFutureDate, parseClockTime } from '@/components/ui';

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
