import {
  LAYER1_WEIGHTS,
  availabilityScore,
  categoryScore,
  computeLayer1MatchScore,
  experienceScore,
  locationScore,
  skillsScore,
  type Layer1OutreachInput,
  type Layer1VolunteerInput,
} from '../layer1';

describe('skillsScore', () => {
  it('is 1.0 for a perfect overlap', () => {
    expect(skillsScore(['wound care', 'triage'], ['wound care', 'triage'])).toBe(1);
  });

  it('is 0 when required_skills is empty (ASSUMPTION: not a free pass)', () => {
    expect(skillsScore(['wound care'], [])).toBe(0);
  });

  it('is 0 when volunteer skill_tags is empty', () => {
    expect(skillsScore([], ['wound care'])).toBe(0);
  });

  it('is 0 when both arrays are empty', () => {
    expect(skillsScore([], [])).toBe(0);
  });

  it('is 0 when there is no overlap at all', () => {
    expect(skillsScore(['pharmacy'], ['surgery'])).toBe(0);
  });

  it('divides by the size of the LARGER set for a partial overlap', () => {
    // volunteer has 3 tags, required has 2, 1 overlaps -> 1/3
    expect(skillsScore(['wound care', 'triage', 'cpr'], ['wound care', 'immunisation'])).toBeCloseTo(
      1 / 3
    );
  });

  it('divides by the required set size when it is larger', () => {
    // volunteer has 1 tag, required has 4, 1 overlaps -> 1/4
    expect(
      skillsScore(['cpr'], ['cpr', 'triage', 'immunisation', 'wound care'])
    ).toBeCloseTo(0.25);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(skillsScore([' Wound Care ', 'CPR'], ['wound care', 'cpr'])).toBe(1);
  });

  it('deduplicates case/whitespace variants of the same tag before dividing', () => {
    // Without de-duplication this might be read as 2 volunteer tags; it's really 1 distinct tag.
    expect(skillsScore(['Wound Care', 'wound care ', ' WOUND CARE'], ['wound care'])).toBe(1);
  });

  it('handles null/undefined arrays without throwing', () => {
    expect(skillsScore(null, ['cpr'])).toBe(0);
    expect(skillsScore(['cpr'], undefined)).toBe(0);
    expect(skillsScore(null, null)).toBe(0);
  });

  it('accepts an injected equivalence map for Layer 2 semantic matches', () => {
    const equivalences = new Map<string, ReadonlySet<string>>([
      ['venipuncture', new Set(['blood draw'])],
    ]);
    expect(skillsScore(['blood draw'], ['venipuncture'], equivalences)).toBe(1);
    // symmetric lookup direction also works
    expect(skillsScore(['venipuncture'], ['blood draw'], equivalences)).toBe(1);
  });

  it('does not apply equivalences when none are injected', () => {
    expect(skillsScore(['blood draw'], ['venipuncture'])).toBe(0);
  });
});

describe('categoryScore', () => {
  it('is 1.0 for an exact match', () => {
    expect(categoryScore('nurse', 'nurse')).toBe(1);
  });

  it('is 0.5 for a related pairing (nurse <-> midwife)', () => {
    expect(categoryScore('midwife', 'nurse')).toBe(0.5);
  });

  it('is 0.5 for a related pairing (doctor <-> nurse)', () => {
    expect(categoryScore('nurse', 'doctor')).toBe(0.5);
  });

  it('is 0 for an unrelated pairing', () => {
    expect(categoryScore('first_aider', 'doctor')).toBe(0);
  });

  it('is 0 when volunteer category is null', () => {
    expect(categoryScore(null, 'nurse')).toBe(0);
  });

  it('is 0 when required category is null', () => {
    expect(categoryScore('nurse', null)).toBe(0);
  });

  it('treats an unrecognised/legacy required_category string as null rather than throwing', () => {
    expect(categoryScore('nurse', 'pharmacy_student')).toBe(0);
  });
});

describe('locationScore', () => {
  it('is 1.0 for the same district (same region implied)', () => {
    expect(
      locationScore(
        { region: 'Greater Accra', district: 'Accra Metropolitan' },
        { region: 'Greater Accra', district: 'Accra Metropolitan' }
      )
    ).toBe(1);
  });

  it('is 0.5 for the same region but a different district', () => {
    expect(
      locationScore(
        { region: 'Ashanti', district: 'Kumasi Metropolitan' },
        { region: 'Ashanti', district: 'Obuasi Municipal' }
      )
    ).toBe(0.5);
  });

  it('is 0 for a different region entirely', () => {
    expect(
      locationScore(
        { region: 'Ashanti', district: 'Kumasi Metropolitan' },
        { region: 'Northern', district: 'Tamale Metropolitan' }
      )
    ).toBe(0);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(
      locationScore(
        { region: ' greater accra ', district: 'ACCRA METROPOLITAN' },
        { region: 'Greater Accra', district: 'Accra Metropolitan' }
      )
    ).toBe(1);
  });

  it('is 0 when both districts are null but regions match (falls through to region tier)', () => {
    expect(
      locationScore(
        { region: 'Ashanti', district: null },
        { region: 'Ashanti', district: null }
      )
    ).toBe(0.5);
  });

  it('is 0 when region/district are entirely missing on one side', () => {
    expect(locationScore({ region: null, district: null }, { region: 'Ashanti', district: 'Kumasi' })).toBe(
      0
    );
    expect(locationScore({ region: 'Ashanti', district: 'Kumasi' }, { region: null, district: null })).toBe(
      0
    );
  });
});

describe('experienceScore', () => {
  it('is 1.0 for experienced', () => {
    expect(experienceScore('experienced')).toBe(1);
  });

  it('is 0.6 for intermediate', () => {
    expect(experienceScore('intermediate')).toBe(0.6);
  });

  it('is 0.3 for beginner', () => {
    expect(experienceScore('beginner')).toBe(0.3);
  });

  it('is 0 for null/undefined (unset experience_level)', () => {
    expect(experienceScore(null)).toBe(0);
    expect(experienceScore(undefined)).toBe(0);
  });
});

describe('availabilityScore', () => {
  // 2026-08-01 is a Saturday (verified: 2026-01-01 is a Thursday; +212 days lands on Saturday).
  const saturdayOutreach = { date: '2026-08-01', start_time: '13:00', end_time: '16:00' }; // afternoon only

  it('is 1 when the volunteer has a matching day+slot token', () => {
    expect(availabilityScore(['sat_afternoon'], saturdayOutreach)).toBe(1);
  });

  it('is 0 when the volunteer has the right day but wrong slot', () => {
    expect(availabilityScore(['sat_morning'], saturdayOutreach)).toBe(0);
  });

  it('is 0 when the volunteer has the right slot but wrong day', () => {
    expect(availabilityScore(['sun_afternoon'], saturdayOutreach)).toBe(0);
  });

  it('is 0 for an empty availability_slots array', () => {
    expect(availabilityScore([], saturdayOutreach)).toBe(0);
  });

  it('is 0 for null/undefined availability_slots', () => {
    expect(availabilityScore(null, saturdayOutreach)).toBe(0);
    expect(availabilityScore(undefined, saturdayOutreach)).toBe(0);
  });

  it('matches ANY overlapping slot for a multi-window event (morning+afternoon)', () => {
    const spanning = { date: '2026-08-01', start_time: '10:00', end_time: '14:00' };
    expect(availabilityScore(['sat_morning'], spanning)).toBe(1);
    expect(availabilityScore(['sat_afternoon'], spanning)).toBe(1);
    expect(availabilityScore(['sat_evening'], spanning)).toBe(0);
  });

  it('matches all three windows for an event spanning morning through evening', () => {
    const allDay = { date: '2026-08-01', start_time: '09:00', end_time: '19:00' };
    expect(availabilityScore(['sat_morning'], allDay)).toBe(1);
    expect(availabilityScore(['sat_afternoon'], allDay)).toBe(1);
    expect(availabilityScore(['sat_evening'], allDay)).toBe(1);
  });

  it('treats a missing start/end time as all-day (any slot on the weekday counts)', () => {
    const noTimes = { date: '2026-08-01', start_time: null, end_time: null };
    expect(availabilityScore(['sat_evening'], noTimes)).toBe(1);
  });

  it('treats an unparseable time as all-day rather than throwing', () => {
    const badTimes = { date: '2026-08-01', start_time: 'not-a-time', end_time: 'also-not-a-time' };
    expect(availabilityScore(['sat_morning'], badTimes)).toBe(1);
  });

  it('is 0 for a missing outreach date (cannot verify weekday, fails closed)', () => {
    expect(availabilityScore(['sat_afternoon'], { date: null, start_time: '13:00', end_time: '16:00' })).toBe(
      0
    );
  });

  it('is 0 for an unparseable/invalid outreach date (e.g. Feb 30)', () => {
    expect(
      availabilityScore(['sat_afternoon'], { date: '2026-02-30', start_time: '13:00', end_time: '16:00' })
    ).toBe(0);
    expect(
      availabilityScore(['sat_afternoon'], { date: 'not-a-date', start_time: '13:00', end_time: '16:00' })
    ).toBe(0);
  });

  it('silently ignores malformed/unknown weekday tokens instead of throwing', () => {
    expect(
      availabilityScore(['saturday_afternoon', 'sat_afternoon', 'xyz_evening', 'sat'], saturdayOutreach)
    ).toBe(1);
    // and if NO token is valid, it's just 0, not an error
    expect(availabilityScore(['saturday_afternoon', 'foo_bar'], saturdayOutreach)).toBe(0);
  });

  it('is case-insensitive and trims whitespace on tokens', () => {
    expect(availabilityScore([' SAT_AFTERNOON '], saturdayOutreach)).toBe(1);
  });
});

describe('computeLayer1MatchScore weighting', () => {
  it('exposes the fixed CLAUDE.md weights', () => {
    expect(LAYER1_WEIGHTS).toEqual({
      skills: 35,
      category: 20,
      location: 20,
      availability: 15,
      experience: 10,
    });
  });

  it('sums a perfect match to exactly 100', () => {
    const volunteer: Layer1VolunteerInput = {
      category: 'nurse',
      skill_tags: ['wound care', 'triage'],
      experience_level: 'experienced',
      availability_slots: ['sat_afternoon'],
      region: 'Greater Accra',
      district: 'Accra Metropolitan',
    };
    const outreach: Layer1OutreachInput = {
      required_skills: ['wound care', 'triage'],
      required_category: 'nurse',
      region: 'Greater Accra',
      district: 'Accra Metropolitan',
      date: '2026-08-01',
      start_time: '13:00',
      end_time: '16:00',
    };
    const result = computeLayer1MatchScore(volunteer, outreach);
    expect(result.total).toBe(100);
    expect(result.skills.weighted).toBe(35);
    expect(result.category.weighted).toBe(20);
    expect(result.location.weighted).toBe(20);
    expect(result.availability.weighted).toBe(15);
    expect(result.experience.weighted).toBe(10);
  });

  it('sums a total mismatch to exactly 0', () => {
    const volunteer: Layer1VolunteerInput = {
      category: 'first_aider',
      skill_tags: ['first aid'],
      experience_level: null,
      availability_slots: ['sun_morning'],
      region: 'Northern',
      district: 'Tamale Metropolitan',
    };
    const outreach: Layer1OutreachInput = {
      required_skills: ['surgery'],
      required_category: 'doctor',
      region: 'Ashanti',
      district: 'Kumasi Metropolitan',
      date: '2026-08-01', // Saturday
      start_time: '13:00',
      end_time: '16:00',
    };
    const result = computeLayer1MatchScore(volunteer, outreach);
    expect(result.total).toBe(0);
  });

  it('breakdown raw scores are each between 0 and 1', () => {
    const result = computeLayer1MatchScore(
      { category: 'student', skill_tags: ['cpr'], experience_level: 'beginner', region: 'Volta', district: 'Ho Municipal', availability_slots: [] },
      { required_skills: ['cpr', 'triage'], required_category: 'nurse', region: 'Volta', district: 'Hohoe Municipal', date: '2026-08-01', start_time: '13:00', end_time: '16:00' }
    );
    for (const component of [result.skills, result.category, result.location, result.availability, result.experience]) {
      expect(component.raw).toBeGreaterThanOrEqual(0);
      expect(component.raw).toBeLessThanOrEqual(1);
    }
  });
});

describe('support-role category override', () => {
  // Owner-approved: a `support` outreach forces the category component to 1.0
  // for every volunteer, regardless of their category or the required one.
  const baseVolunteer: Layer1VolunteerInput = {
    category: 'other',
    skill_tags: [],
    experience_level: null,
    availability_slots: [],
    region: 'Northern',
    district: 'Tamale Metropolitan',
  };

  it('forces category to 1.0 for a support outreach even when the category mismatches', () => {
    const result = computeLayer1MatchScore(baseVolunteer, {
      required_category: 'doctor', // volunteer is 'other' — would be 0 if scored strictly
      role_type: 'support',
    });
    expect(result.category.raw).toBe(1);
    expect(result.category.weighted).toBe(20);
  });

  it('forces category to 1.0 for a support outreach even when no required_category is set', () => {
    const result = computeLayer1MatchScore(baseVolunteer, { role_type: 'support' });
    expect(result.category.raw).toBe(1);
  });

  it('does NOT override for a clinical outreach — category is scored strictly', () => {
    const result = computeLayer1MatchScore(baseVolunteer, {
      required_category: 'doctor',
      role_type: 'clinical',
    });
    expect(result.category.raw).toBe(0);
  });

  it('scores category strictly when role_type is absent (backwards-compatible)', () => {
    const result = computeLayer1MatchScore(
      { ...baseVolunteer, category: 'nurse' },
      { required_category: 'doctor' } // nurse↔doctor are related → 0.5
    );
    expect(result.category.raw).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Golden-case table: representative volunteer/outreach pairings with
// hand-verified expected totals, for the project owner to eyeball.
// ---------------------------------------------------------------------------

interface GoldenCase {
  name: string;
  volunteer: Layer1VolunteerInput;
  outreach: Layer1OutreachInput;
  expectedTotal: number;
}

const goldenCases: GoldenCase[] = [
  {
    name: 'perfect match: exact skills, exact category, same district, available slot, experienced',
    volunteer: {
      category: 'nurse',
      skill_tags: ['wound care', 'triage'],
      experience_level: 'experienced',
      availability_slots: ['sat_afternoon'],
      region: 'Greater Accra',
      district: 'Accra Metropolitan',
    },
    outreach: {
      required_skills: ['wound care', 'triage'],
      required_category: 'nurse',
      region: 'Greater Accra',
      district: 'Accra Metropolitan',
      date: '2026-08-01',
      start_time: '13:00',
      end_time: '16:00',
    },
    // 35 + 20 + 20 + 15 + 10
    expectedTotal: 100,
  },
  {
    name: 'total mismatch: no skill overlap, unrelated category, different region, unavailable, no experience',
    volunteer: {
      category: 'first_aider',
      skill_tags: ['first aid'],
      experience_level: null,
      availability_slots: ['sun_morning'],
      region: 'Northern',
      district: 'Tamale Metropolitan',
    },
    outreach: {
      required_skills: ['surgery'],
      required_category: 'doctor',
      region: 'Ashanti',
      district: 'Kumasi Metropolitan',
      date: '2026-08-01',
      start_time: '13:00',
      end_time: '16:00',
    },
    expectedTotal: 0,
  },
  {
    name: 'nursing student, same region different district, available Saturday afternoon, clinical outreach',
    volunteer: {
      category: 'student', // related to 'nurse' -> 0.5
      skill_tags: ['wound care', 'cpr'],
      experience_level: 'intermediate',
      availability_slots: ['sat_afternoon'],
      region: 'Ashanti',
      district: 'Obuasi Municipal',
    },
    outreach: {
      required_skills: ['wound care', 'triage', 'immunisation'],
      required_category: 'nurse',
      region: 'Ashanti',
      district: 'Kumasi Metropolitan',
      date: '2026-08-01', // Saturday
      start_time: '13:00',
      end_time: '16:00',
    },
    // skills: 1/3 * 35 = 11.6667; category: 0.5 * 20 = 10; location: 0.5 * 20 = 10;
    // availability: 1 * 15 = 15; experience: 0.6 * 10 = 6 => total 52.6667 -> 52.67
    expectedTotal: 52.67,
  },
  {
    name: 'doctor, same district, wrong availability day, related category not needed (exact), no clinical skills match',
    volunteer: {
      category: 'doctor',
      skill_tags: ['general medicine'],
      experience_level: 'experienced',
      availability_slots: ['sun_morning'],
      region: 'Greater Accra',
      district: 'Tema Metropolitan',
    },
    outreach: {
      required_skills: ['minor surgery', 'wound care'],
      required_category: 'doctor',
      region: 'Greater Accra',
      district: 'Tema Metropolitan',
      date: '2026-08-01', // Saturday
      start_time: '09:00',
      end_time: '12:00',
    },
    // skills: 0/2 = 0; category: 1*20=20; location: 1*20=20; availability: 0 (sun token, event is Sat) = 0; experience: 1*10=10
    expectedTotal: 50,
  },
  {
    name: 'pharmacist student support role, no category required (support satisfied via exact/none), different region',
    volunteer: {
      category: 'student',
      skill_tags: ['logistics', 'crowd management'],
      experience_level: 'beginner',
      availability_slots: ['fri_evening'],
      region: 'Volta',
      district: 'Ho Municipal',
    },
    outreach: {
      required_skills: ['logistics'],
      required_category: null,
      region: 'Eastern',
      district: 'New Juaben Municipal',
      date: '2026-08-07', // Friday
      start_time: '18:00',
      end_time: '21:00',
    },
    // skills: 1/2 * 35 = 17.5; category: null required -> 0 * 20 = 0; location: different region -> 0;
    // availability: fri_evening matches, event 18:00-21:00 is evening -> 15; experience: 0.3*10=3
    expectedTotal: 35.5,
  },
  {
    name: 'midwife related to required nurse, same region diff district, multi-window event, intermediate exp',
    volunteer: {
      category: 'midwife',
      skill_tags: ['prenatal care', 'triage'],
      experience_level: 'intermediate',
      availability_slots: ['wed_morning'],
      region: 'Central',
      district: 'Cape Coast Metropolitan',
    },
    outreach: {
      required_skills: ['triage', 'prenatal care', 'immunisation'],
      required_category: 'nurse',
      region: 'Central',
      district: 'Elmina', // different district, same region
      date: '2026-08-05', // Wednesday
      start_time: '11:00',
      end_time: '13:00', // spans morning + afternoon
    },
    // skills: 2/3 * 35 = 23.3333; category: related 0.5*20=10; location: same region 0.5*20=10;
    // availability: wed_morning matches (event overlaps morning) -> 15; experience: 0.6*10=6
    expectedTotal: 64.33,
  },
  {
    name: 'no availability data at all (empty array), otherwise strong match',
    volunteer: {
      category: 'nurse',
      skill_tags: ['wound care'],
      experience_level: 'experienced',
      availability_slots: [],
      region: 'Bono',
      district: 'Sunyani Municipal',
    },
    outreach: {
      required_skills: ['wound care'],
      required_category: 'nurse',
      region: 'Bono',
      district: 'Sunyani Municipal',
      date: '2026-08-01',
      start_time: '13:00',
      end_time: '16:00',
    },
    // skills: 1*35=35; category:20; location:20; availability: 0 (no tokens); experience: 10 => 85
    expectedTotal: 85,
  },
  {
    name: 'first aider, unrelated to required doctor, but full skills/location/availability/experience match',
    volunteer: {
      category: 'first_aider',
      skill_tags: ['cpr', 'bandaging'],
      experience_level: 'experienced',
      availability_slots: ['tue_evening'],
      region: 'Upper East',
      district: 'Bolgatanga Municipal',
    },
    outreach: {
      required_skills: ['cpr', 'bandaging'],
      required_category: 'doctor',
      region: 'Upper East',
      district: 'Bolgatanga Municipal',
      date: '2026-08-04', // Tuesday
      start_time: '18:30',
      end_time: '20:00',
    },
    // skills: 35; category: unrelated 0; location: 20; availability: 15; experience: 10 => 80
    expectedTotal: 80,
  },
  {
    name: 'missing outreach date, otherwise perfect match (availability fails closed)',
    volunteer: {
      category: 'nurse',
      skill_tags: ['wound care'],
      experience_level: 'experienced',
      availability_slots: ['sat_afternoon'],
      region: 'Greater Accra',
      district: 'Accra Metropolitan',
    },
    outreach: {
      required_skills: ['wound care'],
      required_category: 'nurse',
      region: 'Greater Accra',
      district: 'Accra Metropolitan',
      date: null,
      start_time: '13:00',
      end_time: '16:00',
    },
    // skills:35; category:20; location:20; availability: 0 (no date); experience:10 => 85
    expectedTotal: 85,
  },
  {
    name: 'unverified/no experience_level set, no skill tags, unrelated everything (near-floor case)',
    volunteer: {
      category: 'other',
      skill_tags: null,
      experience_level: null,
      availability_slots: null,
      region: null,
      district: null,
    },
    outreach: {
      required_skills: ['triage'],
      required_category: 'nurse',
      region: 'Western',
      district: 'Sekondi-Takoradi Metropolitan',
      date: '2026-08-01',
      start_time: '13:00',
      end_time: '16:00',
    },
    expectedTotal: 0,
  },
  {
    name: 'support outreach: category overridden to 1.0 despite mismatch (35 skills + 20 category + 20 location + 15 avail + 3 exp)',
    volunteer: {
      category: 'other', // mismatches required 'nurse', but role_type support overrides to 1.0
      skill_tags: ['crowd control'],
      experience_level: 'beginner',
      availability_slots: ['sat_morning'],
      region: 'Greater Accra',
      district: 'Accra Metropolitan',
    },
    outreach: {
      required_skills: ['crowd control'],
      required_category: 'nurse',
      role_type: 'support',
      region: 'Greater Accra',
      district: 'Accra Metropolitan',
      date: '2026-08-01', // Saturday
      start_time: '09:00',
      end_time: '11:00',
    },
    expectedTotal: 93,
  },
];

describe('golden cases', () => {
  test.each(goldenCases)('$name -> $expectedTotal', ({ volunteer, outreach, expectedTotal }) => {
    const result = computeLayer1MatchScore(volunteer, outreach);
    expect(result.total).toBe(expectedTotal);
  });
});
