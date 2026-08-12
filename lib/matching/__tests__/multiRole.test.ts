import { computeLayer1MatchScore } from '../layer1';
import {
  computeMultiRoleMatchScore,
  describeRoles,
  meetsMinimumExperience,
  roleHasSpace,
  roleRequiresVerification,
  type RoleInput,
} from '../multiRole';
import type { Layer1OutreachInput, Layer1VolunteerInput } from '../layer1';

const nurse: Layer1VolunteerInput = {
  category: 'nurse',
  skill_tags: ['Triage', 'Vaccination'],
  experience_level: 'intermediate',
  availability_slots: ['sat_morning'],
  region: 'Greater Accra',
  district: 'Accra Metropolitan',
};

const outreach: Layer1OutreachInput = {
  required_skills: ['Triage', 'Vaccination'],
  required_category: 'doctor',
  role_type: 'clinical',
  region: 'Greater Accra',
  district: 'Accra Metropolitan',
  date: '2026-08-15', // a Saturday
  start_time: '09:00',
  end_time: '12:00',
};

function role(over: Partial<RoleInput> & { id: string }): RoleInput {
  return {
    category: 'nurse',
    role_type: 'clinical',
    min_experience_level: null,
    required_skills: null,
    slots_total: 5,
    slots_filled: 0,
    ...over,
  };
}

describe('computeMultiRoleMatchScore — single-role mode is untouched', () => {
  it('delegates to the existing scorer when there are no roles, byte for byte', () => {
    const legacy = computeLayer1MatchScore(nurse, outreach);
    const result = computeMultiRoleMatchScore(nurse, outreach, []);

    expect(result.total).toBe(legacy.total);
    expect(result.skills).toEqual(legacy.skills);
    expect(result.category).toEqual(legacy.category);
    expect(result.location).toEqual(legacy.location);
    expect(result.availability).toEqual(legacy.availability);
    expect(result.experience).toEqual(legacy.experience);
    expect(result.bestRoleId).toBeNull();
  });

  it('reports no role state at all in single-role mode', () => {
    const result = computeMultiRoleMatchScore(nurse, outreach, []);
    expect(result.bestRoleIsFull).toBe(false);
    expect(result.bestRoleBelowMinimumExperience).toBe(false);
  });
});

describe('computeMultiRoleMatchScore — picking the best role', () => {
  it('scores against the role the volunteer actually fits, not the outreach default', () => {
    // The outreach's own required_category is 'doctor'; a nurse role exists.
    const result = computeMultiRoleMatchScore(nurse, outreach, [
      role({ id: 'doctors', category: 'doctor' }),
      role({ id: 'nurses', category: 'nurse' }),
    ]);
    expect(result.bestRoleId).toBe('nurses');
    // Exact category match, so the full category weight.
    expect(result.category.raw).toBe(1);
  });

  it('takes the maximum, never an average across roles', () => {
    const roles = [
      role({ id: 'nurses', category: 'nurse' }),
      role({ id: 'others', category: 'other' }),
    ];
    const best = computeMultiRoleMatchScore(nurse, outreach, roles);
    const nurseOnly = computeMultiRoleMatchScore(nurse, outreach, [roles[0]!]);
    expect(best.total).toBe(nurseOnly.total);
  });

  it('still scores a full role rather than skipping it, and flags it', () => {
    const result = computeMultiRoleMatchScore(nurse, outreach, [
      role({ id: 'nurses', category: 'nurse', slots_total: 2, slots_filled: 2 }),
    ]);
    expect(result.bestRoleId).toBe('nurses');
    expect(result.bestRoleIsFull).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });

  it('prefers an open role over a full one when the scores tie', () => {
    const result = computeMultiRoleMatchScore(nurse, outreach, [
      role({ id: 'a-full', category: 'nurse', slots_total: 2, slots_filled: 2 }),
      role({ id: 'b-open', category: 'nurse', slots_total: 4, slots_filled: 1 }),
    ]);
    expect(result.bestRoleId).toBe('b-open');
    expect(result.bestRoleIsFull).toBe(false);
  });

  it('breaks a remaining tie deterministically by role id', () => {
    const roles = [
      role({ id: 'zzz', category: 'nurse', slots_total: 3, slots_filled: 0 }),
      role({ id: 'aaa', category: 'nurse', slots_total: 3, slots_filled: 0 }),
    ];
    expect(computeMultiRoleMatchScore(nurse, outreach, roles).bestRoleId).toBe('aaa');
    // Order of the input must not change the answer.
    expect(computeMultiRoleMatchScore(nurse, outreach, [...roles].reverse()).bestRoleId).toBe('aaa');
  });

  it('uses the role required_skills when set, and inherits the outreach list when null', () => {
    const withOwnSkills = computeMultiRoleMatchScore(nurse, outreach, [
      role({ id: 'r', category: 'nurse', required_skills: ['Surgery'] }),
    ]);
    // The nurse holds neither of those, so skills score 0.
    expect(withOwnSkills.skills.raw).toBe(0);

    const inherited = computeMultiRoleMatchScore(nurse, outreach, [
      role({ id: 'r', category: 'nurse', required_skills: null }),
    ]);
    // Inherits Triage + Vaccination, both held.
    expect(inherited.skills.raw).toBe(1);
  });

  it('applies the support-role category override per role', () => {
    // A support role needs no particular profession, so category is forced to
    // 1.0 even for a category that would otherwise score zero.
    const result = computeMultiRoleMatchScore({ ...nurse, category: 'other' }, outreach, [
      role({ id: 'helpers', category: 'doctor', role_type: 'support' }),
    ]);
    expect(result.category.raw).toBe(1);
  });
});

describe('meetsMinimumExperience', () => {
  it('treats a null minimum as any level', () => {
    expect(meetsMinimumExperience('beginner', null)).toBe(true);
    expect(meetsMinimumExperience(null, null)).toBe(true);
  });

  it('is a floor, not an exact match — more experience always clears it', () => {
    expect(meetsMinimumExperience('experienced', 'beginner')).toBe(true);
    expect(meetsMinimumExperience('intermediate', 'beginner')).toBe(true);
    expect(meetsMinimumExperience('experienced', 'intermediate')).toBe(true);
  });

  it('fails when the volunteer is below the floor', () => {
    expect(meetsMinimumExperience('beginner', 'experienced')).toBe(false);
    expect(meetsMinimumExperience('intermediate', 'experienced')).toBe(false);
  });

  it('clears its own level', () => {
    for (const level of ['beginner', 'intermediate', 'experienced'] as const) {
      expect(meetsMinimumExperience(level, level)).toBe(true);
    }
  });

  it('supports the lead-plus-team pattern the constraint exists for', () => {
    // "1 experienced nurse to lead, 4 nurses of any level."
    const lead = { min_experience_level: 'experienced' as const };
    const team = { min_experience_level: null };

    expect(meetsMinimumExperience('experienced', lead.min_experience_level)).toBe(true);
    expect(meetsMinimumExperience('beginner', lead.min_experience_level)).toBe(false);
    // And the experienced nurse is NOT shut out of the any-level role.
    expect(meetsMinimumExperience('experienced', team.min_experience_level)).toBe(true);
  });

  it('flags a below-floor volunteer without excluding them from scoring', () => {
    const result = computeMultiRoleMatchScore({ ...nurse, experience_level: 'beginner' }, outreach, [
      role({ id: 'lead', category: 'nurse', min_experience_level: 'experienced' }),
    ]);
    expect(result.bestRoleId).toBe('lead');
    expect(result.bestRoleBelowMinimumExperience).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });
});

describe('roleHasSpace', () => {
  it('is false only once the role is full', () => {
    expect(roleHasSpace({ slots_total: 3, slots_filled: 2 })).toBe(true);
    expect(roleHasSpace({ slots_total: 3, slots_filled: 3 })).toBe(false);
  });
});

describe('roleRequiresVerification', () => {
  it('reads the role when one was chosen', () => {
    expect(roleRequiresVerification({ role_type: 'clinical' }, 'support')).toBe(true);
    expect(roleRequiresVerification({ role_type: 'support' }, 'clinical')).toBe(false);
  });

  it('falls back to the outreach in single-role mode', () => {
    expect(roleRequiresVerification(null, 'clinical')).toBe(true);
    expect(roleRequiresVerification(undefined, 'support')).toBe(false);
  });

  it('lets a support role on a clinical event stay open to unverified volunteers', () => {
    // The whole point of the feature: an event badged clinical because it needs
    // nurses must not lock unverified helpers out of its support roles.
    expect(roleRequiresVerification({ role_type: 'support' }, 'clinical')).toBe(false);
  });
});

describe('describeRoles', () => {
  const label = (c: string) => ({ doctor: 'doctors', nurse: 'nurses', student: 'students' }[c] ?? c);

  it('summarises the breakdown for a card', () => {
    expect(
      describeRoles(
        [
          { category: 'doctor', slots_total: 2 },
          { category: 'nurse', slots_total: 3 },
          { category: 'student', slots_total: 5 },
        ],
        label as never
      )
    ).toBe('2 doctors · 3 nurses · 5 students');
  });

  it('is empty for no roles, so a single-role card renders nothing extra', () => {
    expect(describeRoles([], label as never)).toBe('');
  });
});
