import type { OutreachRoleType } from '@/types/database';
import { isTimeAfter, isTodayOrFutureDate, parseClockTime } from '@/components/ui';

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
