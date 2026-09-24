import { facilityWords, findFacilityMatches, nameScore, type Facility } from '../facilityMatch';

const facility = (name: string, extra: Partial<Facility> = {}): Facility => ({
  name,
  type: 'CLINIC',
  region: 'Ashanti',
  location: 'KUMASI METROPOLITAN KUMASI',
  ownership: 'PRIVATE',
  expires: '2027-06-30',
  ...extra,
});

const TODAY = '2026-09-24';

describe('facilityWords', () => {
  it('drops company suffixes and punctuation, and unifies St. with St', () => {
    expect(facilityWords('St. Luke Hospital, Kasei LTD')).toEqual(['ST', 'LUKE', 'HOSPITAL', 'KASEI']);
  });

  it('reads & as and, which is then ignored', () => {
    expect(facilityWords('Mother & Child Clinic')).toEqual(['MOTHER', 'CHILD', 'CLINIC']);
  });
});

describe('nameScore', () => {
  it('scores an identical name at 1 whatever the suffix', () => {
    expect(nameScore('Akuaba Healthcare Ltd', 'AKUABA HEALTHCARE LIMITED')).toBe(1);
  });

  it('never matches on generic words alone', () => {
    expect(nameScore('Hope Medical Centre', 'CITY MEDICAL CENTRE')).toBe(0);
  });

  it('refuses a query with no distinctive word at all', () => {
    expect(nameScore('Medical Centre', 'MEDICAL CENTRE LTD')).toBe(0);
  });

  it('is not diluted by extra words on the register side', () => {
    expect(nameScore('Anwiam Hospital', 'ANWIAM HOSPITAL LIMITED KEJETIA BRANCH')).toBe(1);
  });

  it('weights the distinctive word above the generic ones', () => {
    // Shares "Tafo" (distinctive) but not "Emmanuel": half the identity.
    const partial = nameScore('Emmanuel Tafo Clinic', 'TAFO GOVERNMENT HOSPITAL');
    expect(partial).toBeGreaterThan(0.4);
    expect(partial).toBeLessThan(0.6);
  });
});

describe('findFacilityMatches', () => {
  const register = [
    facility('AKUABA HEALTHCARE LIMITED', { expires: '2027-11-30' }),
    facility('AKUABA MATERNITY HOME', { region: 'Volta', expires: '2025-01-31' }),
    facility('CITY MEDICAL CENTRE'),
  ];

  it('returns the strongest match first and marks expired licences', () => {
    const matches = findFacilityMatches(register, 'Akuaba Healthcare', { region: 'Ashanti', today: TODAY });
    expect(matches[0]?.name).toBe('AKUABA HEALTHCARE LIMITED');
    expect(matches[0]?.expired).toBe(false);
    const other = matches.find((m) => m.name === 'AKUABA MATERNITY HOME');
    expect(other?.expired).toBe(true);
  });

  it('ignores filler words, so "Students for Health" is not a "Centre for Health"', () => {
    expect(nameScore('Students for Health', 'CENTRE FOR HEALTH AND REJUVENATION')).toBe(0);
  });

  it('returns nothing for an organisation that is not a facility', () => {
    expect(findFacilityMatches(register, 'Students for Health Outreach', { today: TODAY })).toEqual([]);
  });

  it('lets a region agreement lift a borderline name over the line', () => {
    // "Tafo" is shared, "Emmanuel" is not: just under the threshold alone.
    const tafo = [facility('TAFO MEDICAL CLINIC', { region: 'Ashanti' })];
    expect(findFacilityMatches(tafo, 'Tafo Emmanuel Medical Clinic', { today: TODAY })).toEqual([]);
    const lifted = findFacilityMatches(tafo, 'Tafo Emmanuel Medical Clinic', { region: 'Ashanti', today: TODAY });
    expect(lifted).toHaveLength(1);
    expect(lifted[0]?.score).toBeLessThanOrEqual(1);
  });

  it('honours the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => facility(`AKUABA CLINIC ${i}`));
    expect(findFacilityMatches(many, 'Akuaba Clinic', { today: TODAY, limit: 3 })).toHaveLength(3);
  });
});
