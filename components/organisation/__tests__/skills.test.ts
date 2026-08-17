import {
  ALL_SKILLS,
  RETIRED_SKILLS,
  SKILL_CATEGORIES,
  getSkillCategory,
  isRetiredSkill,
  skillSectionsFor,
} from '@/constants/skills';

describe('the skills vocabulary', () => {
  it('has no duplicate skills across categories', () => {
    // A duplicate would show twice in the picker and, worse, make
    // getSkillCategory's answer depend on category order.
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const skill of ALL_SKILLS) {
      if (seen.has(skill)) duplicates.push(skill);
      seen.add(skill);
    }
    expect(duplicates).toEqual([]);
  });

  it('never offers a retired skill', () => {
    // The whole point of retiring one is that nobody new can choose it.
    for (const retired of RETIRED_SKILLS) {
      expect(ALL_SKILLS).not.toContain(retired);
      expect(isRetiredSkill(retired)).toBe(true);
    }
  });

  it('covers the outreach types the list was rewritten for', () => {
    // Eye camps, cancer screening and blood drives are among the commonest
    // outreaches run in Ghana and were previously unrepresentable.
    expect(ALL_SKILLS).toContain('Refraction and lens prescribing');
    expect(ALL_SKILLS).toContain('Cataract screening');
    expect(ALL_SKILLS).toContain('Clinical breast examination');
    expect(ALL_SKILLS).toContain('Cervical screening (visual inspection with acetic acid)');
    expect(ALL_SKILLS).toContain('Phlebotomy for donation');
  });

  it('puts every skill in exactly one findable category', () => {
    for (const skill of ALL_SKILLS) {
      expect(getSkillCategory(skill)).toBeDefined();
    }
    expect(getSkillCategory('Something nobody offers')).toBeUndefined();
  });

  it('leaves the sections alone when no retired skill is held', () => {
    expect(skillSectionsFor(['Triage'])).toBe(SKILL_CATEGORIES);
    expect(skillSectionsFor([])).toBe(SKILL_CATEGORIES);
  });

  it('appends a held retired skill so the picker can still draw it', () => {
    // Without this the edit screen cannot render the skill, and drops it the
    // moment anything else is toggled.
    const sections = skillSectionsFor(['Triage', 'Catheterisation']);

    expect(sections).toHaveLength(SKILL_CATEGORIES.length + 1);
    expect(sections[sections.length - 1]).toEqual({
      name: 'No longer offered',
      skills: ['Catheterisation'],
    });
  });

  it('appends only the retired skills actually held', () => {
    const sections = skillSectionsFor(['Compounding']);
    expect(sections[sections.length - 1]?.skills).toEqual(['Compounding']);
  });
});
