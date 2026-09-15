import { companionSkills, ALL_SKILLS } from '../skills';

/**
 * The affinity table names skills as string literals, so a typo produces an
 * entry that silently never appears. `companionSkills` drops anything not in
 * the live vocabulary, which is the right runtime behaviour and exactly what
 * would hide the mistake -- the first draft of this table had NINE invented
 * names in it and the code still "worked".
 */
describe('skill affinities', () => {
  it('only ever suggests skills that exist', () => {
    const vocabulary = new Set(ALL_SKILLS);
    // Drive every group by seeding one real skill from each and checking the
    // companions it pulls back.
    for (const seed of ALL_SKILLS) {
      for (const suggestion of companionSkills([seed], 20)) {
        expect(vocabulary.has(suggestion)).toBe(true);
      }
    }
  });

  it('never suggests something already selected', () => {
    const selected = ['Blood pressure measurement', 'Vital signs monitoring'];
    expect(companionSkills(selected)).not.toContain('Blood pressure measurement');
    expect(companionSkills(selected)).not.toContain('Vital signs monitoring');
  });

  it('suggests nothing when nothing is selected', () => {
    // Offering "popular" skills to somebody who has chosen none is a second
    // list to ignore, not a prompt.
    expect(companionSkills([])).toEqual([]);
  });

  it('prompts the rest of the screening table from one of it', () => {
    const out = companionSkills(['Blood pressure measurement']);
    expect(out).toContain('Vital signs monitoring');
    expect(out).toContain('Temperature measurement');
  });

  it('prompts the support desk from one support skill', () => {
    // The case that matters most: somebody who ticks one thing and does not
    // think of themselves as skilled.
    const out = companionSkills(['Patient registration']);
    expect(out).toContain('Data entry');
    expect(out).toContain('Crowd and queue management');
  });

  it('respects the limit', () => {
    expect(companionSkills(['Patient registration'], 2)).toHaveLength(2);
  });

  it('returns no duplicates across overlapping groups', () => {
    // 'Patient registration' appears in two groups.
    const out = companionSkills(['Patient registration', 'Physical examination'], 20);
    expect(new Set(out).size).toBe(out.length);
  });
});
