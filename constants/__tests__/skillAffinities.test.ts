import { companionSkills, ALL_SKILLS, SKILL_AFFINITIES } from '../skills';

/**
 * The affinity table names skills as string literals, so a typo produces an
 * entry that silently never appears. `companionSkills` drops anything not in
 * the live vocabulary, which is the right runtime behaviour and exactly what
 * would hide the mistake -- the first draft of this table had NINE invented
 * names in it and the code still "worked".
 *
 * WHICH IS WHY THE FIRST ASSERTION BELOW READS THE TABLE AND NOT THE FUNCTION.
 * This test used to drive `companionSkills` with every real skill and check
 * that everything it returned was in the vocabulary -- and that CANNOT FAIL,
 * because the filter it was re-checking removes invalid names before they are
 * returned. An invented entry would have sailed through. The guard now
 * inspects `SKILL_AFFINITIES` itself, which is the authority, so a typo in any
 * of its ~50 entries fails here rather than going quiet in production.
 */
describe('skill affinities', () => {
  it('names only skills that exist, in every group', () => {
    const vocabulary = new Set(ALL_SKILLS);
    const invented: string[] = [];
    for (const group of SKILL_AFFINITIES) {
      for (const skill of group) {
        if (!vocabulary.has(skill)) invented.push(skill);
      }
    }
    expect(invented).toEqual([]);
  });

  // Guard-the-guard: if the table were ever emptied or failed to import, the
  // loop above would pass having inspected nothing at all.
  it('is actually inspecting a populated table', () => {
    expect(SKILL_AFFINITIES.length).toBeGreaterThanOrEqual(10);
    expect(SKILL_AFFINITIES.every((group) => group.length >= 2)).toBe(true);
  });

  it('only ever suggests skills that exist', () => {
    const vocabulary = new Set(ALL_SKILLS);
    // The runtime filter, checked separately from the data above.
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
