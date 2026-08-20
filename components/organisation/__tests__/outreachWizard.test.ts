import {
  INITIAL_WIZARD_STATE,
  daysChanged,
  firstDay,
  rolesChanged,
  swapAdjacent,
  toStoragePayload,
  validateRoles,
  validateOutreachEdit,
  validateWizard,
  wizardStateFromOutreach,
} from '../outreachWizard';
import type { OutreachWizardState, RoleDraft } from '../outreachWizard';

/** A date comfortably in the past, so it can never drift into being valid. */
const PAST_DATE = '2020-03-01';
const FUTURE_DATE = '2099-06-15';

function stateWith(overrides: Partial<OutreachWizardState>): OutreachWizardState {
  return { ...INITIAL_WIZARD_STATE, title: 'Screening day', days: [FUTURE_DATE], ...overrides };
}

describe('required skills are not optional', () => {
  it('refuses an outreach with no required skills', () => {
    // Skills are 35 of the 100 match points, and an empty requirement scores
    // 1.0 for EVERY applicant — so publishing with none does not relax the
    // match, it stops the largest component discriminating at all.
    expect(validateWizard(stateWith({ requiredSkills: [] })).requiredSkills).toBeDefined();
  });

  it('accepts a single skill', () => {
    expect(
      validateWizard(stateWith({ requiredSkills: ['Vital Signs'] })).requiredSkills
    ).toBeUndefined();
  });

  it('applies when EDITING too, so an outreach posted before this rule gets repaired', () => {
    const state = stateWith({ requiredSkills: [], days: [PAST_DATE] });
    expect(validateOutreachEdit(state, [PAST_DATE]).requiredSkills).toBeDefined();
  });
});

describe('validateOutreachEdit', () => {
  it('allows an outreach that already happened to be saved unchanged', () => {
    const state = stateWith({ days: [PAST_DATE] });

    // The wizard refuses this date, which is right when creating an event...
    expect(validateWizard(state).date).toBeDefined();
    // ...and wrong when editing one that has already taken place. This is the
    // case that matters: attaching a flyer to an outreach posted before
    // flyers existed must not be blocked by its own date.
    expect(validateOutreachEdit(state, [PAST_DATE]).date).toBeUndefined();
  });

  it('still refuses to reschedule an event into the past', () => {
    const state = stateWith({ days: [PAST_DATE] });

    expect(validateOutreachEdit(state, [FUTURE_DATE]).date).toBeDefined();
  });

  it('still refuses a malformed day list even when the days are untouched', () => {
    // Only the "today or later" rule is relaxed by editing. An empty list is
    // an outreach with nothing to attend, whatever its history.
    expect(validateOutreachEdit(stateWith({ days: [] }), []).date).toBeDefined();
  });

  it('leaves every other rule intact', () => {
    const state = stateWith({ title: '   ', startTime: '14:00', endTime: '09:00' });

    const errors = validateOutreachEdit(state, state.days);

    expect(errors.title).toBeDefined();
    expect(errors.endTime).toBeDefined();
  });
});

describe('firstDay', () => {
  it('is the earliest day, whatever order they were added in', () => {
    // outreaches.date is this value, and everything date-based still reads it.
    expect(firstDay(stateWith({ days: ['2099-06-17', '2099-06-15', '2099-06-16'] }))).toBe(
      '2099-06-15'
    );
  });

  it('is empty when no day has been picked yet', () => {
    expect(firstDay(stateWith({ days: [] }))).toBe('');
  });
});

describe('daysChanged', () => {
  it('ignores the order the days are held in', () => {
    expect(daysChanged(['2099-06-15', '2099-06-16'], ['2099-06-16', '2099-06-15'])).toBe(false);
  });

  it('sees an added day', () => {
    expect(daysChanged(['2099-06-15'], ['2099-06-15', '2099-06-16'])).toBe(true);
  });

  it('sees a removed day', () => {
    expect(daysChanged(['2099-06-15', '2099-06-16'], ['2099-06-15'])).toBe(true);
  });

  it('sees a moved day', () => {
    expect(daysChanged(['2099-06-15'], ['2099-06-22'])).toBe(true);
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

  it('turns single-role storage into a one-role list', () => {
    const state = wizardStateFromOutreach(row, []);

    // The form has no modes: an outreach with no child rows still arrives as
    // a list, so "add another role" works on it without any conversion step.
    expect(state.roles).toHaveLength(1);
    expect(state.roles[0]).toEqual({
      category: 'nurse',
      roleType: 'clinical',
      minExperienceLevel: null,
      slotsTotal: 8,
    });
  });

  it('reads a category outside the vocabulary as no category at all', () => {
    const state = wizardStateFromOutreach({ ...row, required_category: 'wizard' }, []);

    expect(state.roles[0]?.category).toBeNull();
  });

  it('falls back to clinical when an old row has no role type, so the gate fails closed', () => {
    const state = wizardStateFromOutreach({ ...row, role_type: null }, []);

    expect(state.roles[0]?.roleType).toBe('clinical');
  });

  it('uses the role rows when there are any', () => {
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

  it('notices a list appearing or disappearing entirely', () => {
    // Compared in STORAGE terms: [] is an outreach with no child rows, so
    // this is the move between the two shapes.
    expect(rolesChanged([], [nurse])).toBe(true);
    expect(rolesChanged([nurse], [])).toBe(true);
  });
});

describe('toStoragePayload — the one place that knows there are two shapes', () => {
  const nurse: RoleDraft = {
    category: 'nurse',
    roleType: 'clinical',
    minExperienceLevel: null,
    slotsTotal: 2,
  };

  it('writes a lone role the way every outreach has always been written', () => {
    const payload = toStoragePayload(stateWith({ roles: [nurse] }));

    // No child rows: the outreach's own columns carry the requirement, so
    // nothing about an ordinary single-category event moves.
    expect(payload.roles).toEqual([]);
    expect(payload.requiredCategory).toBe('nurse');
    expect(payload.roleType).toBe('clinical');
    expect(payload.slotsTotal).toBe(2);
  });

  it('keeps "any profession" expressible, as a lone role with no category', () => {
    const payload = toStoragePayload(
      stateWith({ roles: [{ ...nurse, category: null, roleType: 'support' }] })
    );

    expect(payload.requiredCategory).toBeNull();
    expect(payload.roles).toEqual([]);
  });

  it('uses child rows once there are two roles', () => {
    const payload = toStoragePayload(
      stateWith({
        roles: [
          nurse,
          { category: 'student', roleType: 'support', minExperienceLevel: null, slotsTotal: 4 },
        ],
      })
    );

    expect(payload.roles).toHaveLength(2);
    // No single answer once there are several.
    expect(payload.requiredCategory).toBeNull();
    expect(payload.slotsTotal).toBe(6);
  });

  it('uses a child row for a lone role with an experience floor', () => {
    // Single-role storage has nowhere to put a floor, so this shape has to
    // become a row even though there is only one of it.
    const payload = toStoragePayload(
      stateWith({ roles: [{ ...nurse, minExperienceLevel: 'experienced' }] })
    );

    expect(payload.roles).toHaveLength(1);
    expect(payload.requiredCategory).toBeNull();
  });

  it('summarises role type to clinical if ANY role is', () => {
    const payload = toStoragePayload(
      stateWith({
        roles: [
          { category: 'student', roleType: 'support', minExperienceLevel: null, slotsTotal: 6 },
          nurse,
        ],
      })
    );

    expect(payload.roleType).toBe('clinical');
  });

  it('never returns a null role type', () => {
    // A null one is read as "support" by every verification gate in the app,
    // so an outreach that lost it quietly stopped requiring verification.
    for (const roles of [
      [nurse],
      [{ ...nurse, category: null, roleType: 'support' as const }],
      [nurse, { ...nurse, category: 'student' as const }],
    ]) {
      expect(toStoragePayload(stateWith({ roles })).roleType).not.toBeNull();
    }
  });
});

describe('validateRoles', () => {
  const nurse: RoleDraft = {
    category: 'nurse',
    roleType: 'clinical',
    minExperienceLevel: null,
    slotsTotal: 2,
  };

  it('accepts a lone role with no category — that is "anyone"', () => {
    expect(validateRoles([{ ...nurse, category: null }])).toBeNull();
  });

  it('requires a category once a second role exists', () => {
    // Two roles become outreach_roles rows, where category is NOT NULL, so
    // "anyone" stops being storable rather than merely unusual.
    expect(validateRoles([nurse, { ...nurse, category: null }])).toContain('profession');
  });

  it('requires a category before an experience floor can be set', () => {
    expect(
      validateRoles([{ ...nurse, category: null, minExperienceLevel: 'experienced' }])
    ).toContain('profession');
  });

  it('rejects two roles with the same profession and level', () => {
    expect(validateRoles([nurse, { ...nurse, slotsTotal: 9 }])).toContain('same profession');
  });

  it('allows the same profession at different levels', () => {
    // "1 experienced nurse to lead, 4 nurses of any level" — the pairing the
    // unique index includes experience for.
    expect(
      validateRoles([nurse, { ...nurse, minExperienceLevel: 'experienced', slotsTotal: 1 }])
    ).toBeNull();
  });

  it('rejects an empty list and a role with no places', () => {
    expect(validateRoles([])).not.toBeNull();
    expect(validateRoles([{ ...nurse, slotsTotal: 0 }])).not.toBeNull();
  });
});

describe('swapAdjacent — the gallery reorder both screens share', () => {
  const list = ['a', 'b', 'c'];

  it('moves an item later', () => {
    expect(swapAdjacent(list, 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('moves an item earlier', () => {
    expect(swapAdjacent(list, 2, -1)).toEqual(['a', 'c', 'b']);
  });

  it('returns the ORIGINAL array at either end, identity included', () => {
    // Identity is the signal callers use to skip a write and a re-render, so
    // a defensive copy here would be worse than useless.
    expect(swapAdjacent(list, 0, -1)).toBe(list);
    expect(swapAdjacent(list, 2, 1)).toBe(list);
  });

  it('returns the original for an index that is not in the list', () => {
    expect(swapAdjacent(list, -1, 1)).toBe(list);
    expect(swapAdjacent(list, 9, -1)).toBe(list);
  });

  it('leaves the input untouched', () => {
    swapAdjacent(list, 0, 1);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  it('handles a single-item list', () => {
    const one = ['only'];
    expect(swapAdjacent(one, 0, 1)).toBe(one);
    expect(swapAdjacent(one, 0, -1)).toBe(one);
  });
});

describe('wizardStateFromOutreach — days', () => {
  const row = {
    title: 'Free BP Screening',
    description: null,
    date: '2026-09-01',
    start_time: '09:00:00',
    end_time: '15:30:00',
    region: 'Greater Accra',
    district: 'Ayawaso West',
    location_name: null,
    required_skills: null,
    required_category: 'nurse',
    role_type: 'clinical' as const,
    slots_total: 8,
    flyer_url: null,
  };

  it('reads every day row, in order', () => {
    const state = wizardStateFromOutreach(row, [], [
      { day: '2026-09-03' },
      { day: '2026-09-01' },
      { day: '2026-09-02' },
    ]);

    expect(state.days).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('falls back to the outreach date when the day rows have not loaded', () => {
    // Every outreach has at least one day row, so an empty list here means the
    // read failed rather than that the event has no days. Hydrating an empty
    // list would let a save wipe the real ones.
    expect(wizardStateFromOutreach(row, [], []).days).toEqual(['2026-09-01']);
  });
});
