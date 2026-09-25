import {
  INITIAL_ROLE,
  INITIAL_WIZARD_STATE,
  daysChanged,
  firstDay,
  rolesChanged,
  swapAdjacent,
  toStoragePayload,
  validateRoles,
  validateOutreachEdit,
  errorsForStep,
  firstFieldWithError,
  hasWizardErrors,
  firstStepWithError,
  summariseStepErrors,
  validateWizard,
  WIZARD_FIELD_STEP,
  wizardStateFromOutreach,
} from '../outreachWizard';
import type { OutreachWizardState, RoleDraft } from '../outreachWizard';
import { dayStringsOf, inheritedDay, type OutreachDayDraft } from '@/lib/outreachDays';

/** A date comfortably in the past, so it can never drift into being valid. */
const PAST_DATE = '2020-03-01';
const FUTURE_DATE = '2099-06-15';

/**
 * Days as the form holds them: a date with no hours of its own, which is the
 * ordinary case and the only one these rules care about — validation is about
 * WHICH days an outreach runs on, never what time each one starts.
 */
function days(...dates: string[]): OutreachDayDraft[] {
  return dates.map(inheritedDay);
}

function stateWith(overrides: Partial<OutreachWizardState>): OutreachWizardState {
  return { ...INITIAL_WIZARD_STATE, title: 'Screening day', days: days(FUTURE_DATE), ...overrides };
}

/** A clinical role, since INITIAL_WIZARD_STATE seeds a support one. */
const CLINICAL_ROLES = [
  { category: null, roleType: 'clinical' as const, minExperienceLevel: null, slotsTotal: 2 },
];

describe('required skills follow the WORK, not every outreach', () => {
  /*
    Changed 2026-09-15, owner-approved. Skills used to be required on every
    outreach. Forcing an organisation to name skills for a registration desk
    asks for data that then does nothing -- and it is how support events ended
    up carrying requirements nobody meant, which the matcher scored against
    across the largest component of the score.

    The matcher no longer scores skills on a support outreach at all (see the
    support-role skills override in lib/matching/layer1.ts), so a requirement
    here would be collected, stored, shown and ignored.
  */
  it('refuses a CLINICAL outreach with no required skills', () => {
    // Still 35 of the 100 match points there, and an empty requirement scores
    // 1.0 for EVERY applicant -- so publishing with none does not relax the
    // match, it stops the largest component discriminating at all.
    const state = stateWith({ requiredSkills: [], roles: CLINICAL_ROLES });
    expect(validateWizard(state).requiredSkills).toBeDefined();
  });

  it('accepts a single skill on a clinical outreach', () => {
    const state = stateWith({ requiredSkills: ['Vital signs monitoring'], roles: CLINICAL_ROLES });
    expect(validateWizard(state).requiredSkills).toBeUndefined();
  });

  it('ALLOWS a support outreach with no required skills', () => {
    // The whole point of the change: a registration desk needs no skill list.
    expect(validateWizard(stateWith({ requiredSkills: [] })).requiredSkills).toBeUndefined();
  });

  it('still allows a support outreach to name skills if it wants to', () => {
    const state = stateWith({ requiredSkills: ['Patient registration'] });
    expect(validateWizard(state).requiredSkills).toBeUndefined();
  });

  it('treats ANY clinical role as making the whole outreach clinical', () => {
    // Same summarising rule outreaches.role_type already follows.
    const mixed = [
      { category: 'nurse' as const, roleType: 'clinical' as const, minExperienceLevel: null, slotsTotal: 3 },
      { category: 'other' as const, roleType: 'support' as const, minExperienceLevel: null, slotsTotal: 6 },
    ];
    expect(validateWizard(stateWith({ requiredSkills: [], roles: mixed })).requiredSkills).toBeDefined();
  });

  it('applies when EDITING too, so a clinical outreach posted before this rule gets repaired', () => {
    const state = stateWith({ requiredSkills: [], roles: CLINICAL_ROLES, days: days(PAST_DATE) });
    expect(validateOutreachEdit(state, [PAST_DATE]).requiredSkills).toBeDefined();
  });
});

describe('validateOutreachEdit', () => {
  it('allows an outreach that already happened to be saved unchanged', () => {
    const state = stateWith({ days: days(PAST_DATE) });

    // The wizard refuses this date, which is right when creating an event...
    expect(validateWizard(state).date).toBeDefined();
    // ...and wrong when editing one that has already taken place. This is the
    // case that matters: attaching a flyer to an outreach posted before
    // flyers existed must not be blocked by its own date.
    expect(validateOutreachEdit(state, [PAST_DATE]).date).toBeUndefined();
  });

  it('still refuses to reschedule an event into the past', () => {
    const state = stateWith({ days: days(PAST_DATE) });

    expect(validateOutreachEdit(state, [FUTURE_DATE]).date).toBeDefined();
  });

  it('still refuses a malformed day list even when the days are untouched', () => {
    // Only the "today or later" rule is relaxed by editing. An empty list is
    // an outreach with nothing to attend, whatever its history.
    expect(validateOutreachEdit(stateWith({ days: [] }), []).date).toBeDefined();
  });

  it('leaves every other rule intact', () => {
    const state = stateWith({ title: '   ', startTime: '14:00', endTime: '09:00' });

    const errors = validateOutreachEdit(state, dayStringsOf(state.days));

    expect(errors.title).toBeDefined();
    expect(errors.endTime).toBeDefined();
  });
});

describe('firstDay', () => {
  it('is the earliest day, whatever order they were added in', () => {
    // outreaches.date is this value, and everything date-based still reads it.
    expect(firstDay(stateWith({ days: days('2099-06-17', '2099-06-15', '2099-06-16') }))).toBe(
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
    expect(validateRoles([nurse, { ...nurse, slotsTotal: 9 }])).toContain('identical');
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

    expect(dayStringsOf(state.days)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it("carries each day's own hours, and keeps null meaning the event's hours", () => {
    // Null is not "unset" here, it is the stored value for "runs to the same
    // hours as the event". Turning it into an empty string would make every
    // ordinary day look like an override that had been cleared.
    const state = wizardStateFromOutreach(row, [], [
      { day: '2026-09-01', start_time: null, end_time: null },
      { day: '2026-09-02', start_time: '14:00:00', end_time: '19:30:00' },
    ]);

    expect(state.days[0]).toEqual({ day: '2026-09-01', startTime: null, endTime: null });
    // Seconds trimmed, because that is what the time picker reads and writes.
    expect(state.days[1]).toEqual({ day: '2026-09-02', startTime: '14:00', endTime: '19:30' });
  });

  it('falls back to the outreach date when the day rows have not loaded', () => {
    // Every outreach has at least one day row, so an empty list here means the
    // read failed rather than that the event has no days. Hydrating an empty
    // list would let a save wipe the real ones.
    expect(wizardStateFromOutreach(row, [], []).days).toEqual([
      { day: '2026-09-01', startTime: null, endTime: null },
    ]);
  });
});

describe('every field a published outreach needs is guarded', () => {
  // A COMPLETE state, so each test below can knock out exactly one field and
  // prove that field alone blocks the wizard.
  function complete(): OutreachWizardState {
    return stateWith({
      title: 'Screening day',
      description: 'A community eye screening.',
      region: 'Greater Accra',
      district: 'Ayawaso West',
      locationName: 'Korle Bu',
      days: days(FUTURE_DATE),
      startTime: '09:00',
      endTime: '15:00',
      requiredSkills: ['Vital Signs'],
      roles: [{ category: 'nurse', roleType: 'clinical', minExperienceLevel: null, slotsTotal: 5 }],
    });
  }

  it('passes when everything is filled in', () => {
    expect(hasWizardErrors(validateWizard(complete()))).toBe(false);
  });

  // Owner, 2026-09-25: an outreach could be published without the organisation
  // ever choosing who it wanted, because the first role came pre-selected.
  it('refuses the untouched first role: profession and role type must be chosen', () => {
    const untouched = { ...complete(), roles: [INITIAL_ROLE] };
    expect(validateWizard(untouched).roles).toBe('Choose who each role is for: a profession, or Any profession.');
    const professionOnly = { ...complete(), roles: [{ ...INITIAL_ROLE, professionChosen: true }] };
    expect(validateWizard(professionOnly).roles).toBe('Choose clinical or support for each role.');
    const both = { ...complete(), roles: [{ ...INITIAL_ROLE, professionChosen: true, roleTypeChosen: true }] };
    expect(validateWizard(both).roles).toBeUndefined();
  });

  // Each of these was UNGUARDED before 2026-08-21: the wizard let an outreach
  // be published without them.
  it.each([
    ['description', { description: '   ' }],
    ['region', { region: null }],
    ['district', { district: null }],
    ['locationName', { locationName: '' }],
    ['startTime', { startTime: '' }],
    ['endTime', { endTime: '' }],
  ])('blocks on a missing %s', (field, override) => {
    const errors = validateWizard(stateWith({ ...complete(), ...override }));
    expect(errors[field as keyof typeof errors]).toBeDefined();
    expect(hasWizardErrors(errors)).toBe(true);
  });

  it('keeps every message to one short line', () => {
    // The red asterisk on the field carries "this is required", so the message
    // only has to say what is wrong. Long explanations were the complaint.
    const errors = validateWizard(stateWith({ title: '', description: '', requiredSkills: [] }));
    for (const message of Object.values(errors)) {
      expect(message).not.toContain('\n');
      expect(message.length).toBeLessThanOrEqual(64);
    }
  });
});

describe('a failed step points at the right place', () => {
  it('puts every field on exactly one step', () => {
    for (const step of Object.values(WIZARD_FIELD_STEP)) {
      expect([1, 2, 3]).toContain(step);
    }
  });

  it('reports only the errors belonging to the step being shown', () => {
    // CLINICAL, because skills are only required there now -- this test is
    // about which STEP an error is reported on, so it needs one to report.
    const errors = validateWizard(stateWith({ title: '', requiredSkills: [], roles: CLINICAL_ROLES }));
    expect(errorsForStep(errors, 1).title).toBeDefined();
    expect(errorsForStep(errors, 1).requiredSkills).toBeUndefined();
    expect(errorsForStep(errors, 3).requiredSkills).toBeDefined();
  });

  it('sends a failed publish back to the EARLIEST step with a problem', () => {
    const errors = validateWizard(stateWith({ title: '', requiredSkills: [] }));
    expect(firstStepWithError(errors)).toBe(1);
  });

  it('is null when nothing is wrong', () => {
    expect(firstStepWithError({})).toBeNull();
  });

  it('scrolls to the first bad field in LAYOUT order, not object order', () => {
    const errors = validateWizard(
      stateWith({ region: null, district: null, locationName: '', startTime: '', endTime: '' })
    );
    expect(firstFieldWithError(errors, 2)).toBe('region');
  });

  it('names what is missing in one sentence', () => {
    const errors = validateWizard(stateWith({ title: '', description: '' }));
    const summary = summariseStepErrors(errors, 1);
    expect(summary).toBe('This step still needs a title and a description.');
  });

  it('says nothing when the step is fine', () => {
    expect(summariseStepErrors({}, 2)).toBeNull();
  });
});
