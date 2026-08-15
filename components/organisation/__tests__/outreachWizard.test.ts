import {
  INITIAL_WIZARD_STATE,
  rolesChanged,
  validateOutreachEdit,
  validateWizard,
  wizardStateFromOutreach,
} from '../outreachWizard';
import type { OutreachWizardState, RoleDraft } from '../outreachWizard';

/** A date comfortably in the past, so it can never drift into being valid. */
const PAST_DATE = '2020-03-01';
const FUTURE_DATE = '2099-06-15';

function stateWith(overrides: Partial<OutreachWizardState>): OutreachWizardState {
  return { ...INITIAL_WIZARD_STATE, title: 'Screening day', date: FUTURE_DATE, ...overrides };
}

describe('validateOutreachEdit', () => {
  it('allows an outreach that already happened to be saved unchanged', () => {
    const state = stateWith({ date: PAST_DATE });

    // The wizard refuses this date, which is right when creating an event...
    expect(validateWizard(state).date).toBeDefined();
    // ...and wrong when editing one that has already taken place. This is the
    // case that matters: attaching a flyer to an outreach posted before
    // flyers existed must not be blocked by its own date.
    expect(validateOutreachEdit(state, PAST_DATE).date).toBeUndefined();
  });

  it('still refuses to reschedule an event into the past', () => {
    const state = stateWith({ date: PAST_DATE });

    expect(validateOutreachEdit(state, FUTURE_DATE).date).toBeDefined();
  });

  it('leaves every other rule intact', () => {
    const state = stateWith({ title: '   ', startTime: '14:00', endTime: '09:00' });

    const errors = validateOutreachEdit(state, state.date);

    expect(errors.title).toBeDefined();
    expect(errors.endTime).toBeDefined();
  });
});

describe('wizardStateFromOutreach', () => {
  const row = {
    title: 'Free BP Screening',
    description: null,
    date: '2026-09-01',
    start_time: '09:00:00',
    end_time: '15:30:00',
    region: 'Greater Accra',
    district: 'Ayawaso West',
    location_name: null,
    required_skills: ['Blood pressure measurement'],
    required_category: 'nurse',
    role_type: 'clinical' as const,
    slots_total: 8,
    flyer_url: null,
  };

  it('trims the seconds Postgres returns, so the times survive a round trip', () => {
    const state = wizardStateFromOutreach(row, []);

    // 'HH:MM:SS' would fail parseClockTime on save, silently blocking the form.
    expect(state.startTime).toBe('09:00');
    expect(state.endTime).toBe('15:30');
  });

  it('opens on single-role mode when there are no role rows', () => {
    const state = wizardStateFromOutreach(row, []);

    expect(state.roles).toEqual([]);
    expect(state.requiredCategory).toBe('nurse');
    expect(state.slotsTotal).toBe(8);
  });

  it('opens on multi-role mode when role rows exist', () => {
    const state = wizardStateFromOutreach(row, [
      {
        category: 'nurse',
        role_type: 'clinical',
        min_experience_level: 'experienced',
        slots_total: 2,
      },
      { category: 'student', role_type: 'support', min_experience_level: null, slots_total: 4 },
    ]);

    expect(state.roles).toHaveLength(2);
    expect(state.roles[0]).toEqual({
      category: 'nurse',
      roleType: 'clinical',
      minExperienceLevel: 'experienced',
      slotsTotal: 2,
    });
    expect(state.roles[1]?.minExperienceLevel).toBeNull();
  });

  it('turns null text columns into the empty strings the inputs expect', () => {
    const state = wizardStateFromOutreach(row, []);

    expect(state.description).toBe('');
    expect(state.locationName).toBe('');
  });
});

describe('rolesChanged', () => {
  const nurse: RoleDraft = {
    category: 'nurse',
    roleType: 'clinical',
    minExperienceLevel: null,
    slotsTotal: 2,
  };
  const student: RoleDraft = {
    category: 'student',
    roleType: 'support',
    minExperienceLevel: null,
    slotsTotal: 4,
  };

  it('is false for an untouched list', () => {
    expect(rolesChanged([nurse, student], [nurse, student])).toBe(false);
  });

  it('is false when only the order differs', () => {
    // Order is not meaningful — the list is re-sorted on read — and treating a
    // reorder as a change would trigger the destructive delete-and-reinsert
    // rewrite on a save that altered nothing.
    expect(rolesChanged([nurse, student], [student, nurse])).toBe(false);
  });

  it('notices a changed slot count', () => {
    expect(rolesChanged([nurse], [{ ...nurse, slotsTotal: 3 }])).toBe(true);
  });

  it('notices a changed role type, which moves the verification gate', () => {
    expect(rolesChanged([nurse], [{ ...nurse, roleType: 'support' }])).toBe(true);
  });

  it('notices a changed experience floor', () => {
    expect(rolesChanged([nurse], [{ ...nurse, minExperienceLevel: 'experienced' }])).toBe(true);
  });

  it('notices an added or removed role', () => {
    expect(rolesChanged([nurse], [nurse, student])).toBe(true);
    expect(rolesChanged([nurse, student], [nurse])).toBe(true);
  });

  it('notices the switch to and from single-role mode', () => {
    expect(rolesChanged([], [nurse])).toBe(true);
    expect(rolesChanged([nurse], [])).toBe(true);
  });
});
