import { ALL_SKILLS } from '../skills';
import { MEDICAL_SPECIALTIES } from '../specialties';
import { VOLUNTEER_CATEGORIES } from '../categories';
import {
  SKILL_ELIGIBILITY,
  SKILL_LIMIT,
  canClaimSkill,
  eligibleSkills,
  eligibleSpecialties,
  hasSpecialtyStep,
  pruneSkills,
  pruneSpecialties,
  skillCategoriesFor,
} from '../skillEligibility';

describe('skill eligibility table', () => {
  it('covers every live skill, so a new skill cannot silently become unclaimable', () => {
    const missing = ALL_SKILLS.filter((skill) => !(skill in SKILL_ELIGIBILITY));
    expect(missing).toEqual([]);
  });

  it('names no skill that is not in the vocabulary (a typo would never match)', () => {
    const unknown = Object.keys(SKILL_ELIGIBILITY).filter((skill) => !ALL_SKILLS.includes(skill));
    expect(unknown).toEqual([]);
  });

  it('leaves every role enough to fill the limit, so nobody is squeezed below it', () => {
    for (const { value } of VOLUNTEER_CATEGORIES) {
      expect(eligibleSkills(value).length).toBeGreaterThanOrEqual(SKILL_LIMIT);
    }
  });

  it('gives every role every General Support skill', () => {
    const support = skillCategoriesFor('other').find((group) => group.name === 'General Support');
    for (const { value } of VOLUNTEER_CATEGORIES) {
      const group = skillCategoriesFor(value).find((g) => g.name === 'General Support');
      expect(group?.skills).toEqual(support?.skills);
    }
  });
});

describe('the owner-reported cases', () => {
  it('a first aider cannot claim physical examination, antenatal care or prescription review', () => {
    expect(canClaimSkill('first_aider', 'Physical examination')).toBe(false);
    expect(canClaimSkill('first_aider', 'Antenatal care')).toBe(false);
    expect(canClaimSkill('first_aider', 'Prescription review')).toBe(false);
  });

  it('a first aider keeps the emergency work they are trained for', () => {
    expect(canClaimSkill('first_aider', 'Cardiopulmonary resuscitation (CPR)')).toBe(true);
    expect(canClaimSkill('first_aider', 'Airway management')).toBe(true);
    expect(canClaimSkill('first_aider', 'Blood pressure measurement')).toBe(true);
  });

  it('a first aider, pharmacist, student or other has no specialty step at all', () => {
    for (const role of ['first_aider', 'pharmacist', 'student', 'other'] as const) {
      expect(hasSpecialtyStep(role)).toBe(false);
      expect(pruneSpecialties(role, ['Cardiology'])).toEqual([]);
    }
  });

  it('a doctor may claim any specialty; a midwife only the maternal and child ones', () => {
    expect(eligibleSpecialties('doctor')).toEqual(MEDICAL_SPECIALTIES);
    expect(eligibleSpecialties('midwife')).toContain('Obstetrics & Gynaecology');
    expect(eligibleSpecialties('midwife')).not.toContain('Cardiology');
  });
});

describe('helpers', () => {
  it('no role means nothing is claimable', () => {
    expect(canClaimSkill(null, 'Health education')).toBe(false);
    expect(eligibleSkills(undefined)).toEqual([]);
  });

  it('pruneSkills keeps order and drops only what the role cannot claim', () => {
    expect(
      pruneSkills('first_aider', ['Health education', 'Venipuncture', 'Triage', 'Retired thing'])
    ).toEqual(['Health education', 'Triage']);
  });

  it('skillCategoriesFor drops a group left empty for the role', () => {
    const names = skillCategoriesFor('other').map((group) => group.name);
    expect(names).not.toContain('Nursing Procedures');
    expect(names).toContain('General Support');
  });
});
