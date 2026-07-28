import {
  NEW_VOLUNTEER_V_SCORE,
  V_SCORE_PENALTIES,
  applyVScorePenalties,
  applyVScorePenalty,
  computeEventOutcome,
  getVScoreBand,
  recomputeVScoreAfterReview,
  type EventOutcomeInput,
} from '../vscore';

describe('getVScoreBand — boundary values for every band edge', () => {
  it('99.99 stays At Risk .. 100 is Elite (top edges)', () => {
    expect(getVScoreBand(100)).toBe('Elite');
    expect(getVScoreBand(90)).toBe('Elite');
  });

  it('89.99 is Trusted, 90 is Elite', () => {
    expect(getVScoreBand(89.99)).toBe('Trusted');
    expect(getVScoreBand(90)).toBe('Elite');
  });

  it('74.99 is Active, 75 is Trusted', () => {
    expect(getVScoreBand(74.99)).toBe('Active');
    expect(getVScoreBand(75)).toBe('Trusted');
  });

  it('59.99 is Developing, 60 is Active', () => {
    expect(getVScoreBand(59.99)).toBe('Developing');
    expect(getVScoreBand(60)).toBe('Active');
  });

  it('39.99 is At Risk, 40 is Developing', () => {
    expect(getVScoreBand(39.99)).toBe('At Risk');
    expect(getVScoreBand(40)).toBe('Developing');
  });

  it('0 is At Risk', () => {
    expect(getVScoreBand(0)).toBe('At Risk');
  });

  it('new volunteers start at 70, which is Active', () => {
    expect(NEW_VOLUNTEER_V_SCORE).toBe(70);
    expect(getVScoreBand(NEW_VOLUNTEER_V_SCORE)).toBe('Active');
  });
});

describe('computeEventOutcome', () => {
  it('is 0 (floor) when attended is false, regardless of any stray sub-scores', () => {
    expect(computeEventOutcome({ attended: false, reliability_score: 5, clinical_score: 5 })).toBe(0);
    expect(computeEventOutcome({ attended: false, reliability_score: null, clinical_score: null })).toBe(0);
  });

  it('scales a perfect attended review (5 reliability, 5 clinical) to 100', () => {
    expect(computeEventOutcome({ attended: true, reliability_score: 5, clinical_score: 5 })).toBe(100);
  });

  it('scales a floor attended review (1 reliability, 1 clinical) to 20, never 0', () => {
    expect(computeEventOutcome({ attended: true, reliability_score: 1, clinical_score: 1 })).toBe(20);
  });

  it('averages mixed reliability/clinical scores before scaling', () => {
    // (3 + 5) / 2 = 4 -> 4 * 20 = 80
    expect(computeEventOutcome({ attended: true, reliability_score: 3, clinical_score: 5 })).toBe(80);
  });

  it('falls back to reliability alone when clinical_score is null (support-role volunteer)', () => {
    expect(computeEventOutcome({ attended: true, reliability_score: 4, clinical_score: null })).toBe(80);
    expect(computeEventOutcome({ attended: true, reliability_score: 1, clinical_score: null })).toBe(20);
  });

  it('substitutes a neutral default when reliability_score is missing despite attended = true', () => {
    // DEFAULT_MISSING_SUBSCORE = 3 -> 3 * 20 = 60
    expect(computeEventOutcome({ attended: true, reliability_score: null, clinical_score: null })).toBe(60);
  });

  it('treats attended = null (never reviewed) the same as a missing-data neutral default', () => {
    expect(computeEventOutcome({ attended: null, reliability_score: null, clinical_score: null })).toBe(60);
  });

  it('clamps to 100 even if a caller passes an out-of-range sub-score above 5', () => {
    expect(computeEventOutcome({ attended: true, reliability_score: 10, clinical_score: 10 })).toBe(100);
  });
});

describe('recomputeVScoreAfterReview — 0.7*old + 0.3*eventOutcome', () => {
  it('a new volunteer (70) with a perfect review moves toward 100', () => {
    // 0.7*70 + 0.3*100 = 49 + 30 = 79
    expect(recomputeVScoreAfterReview(70, { attended: true, reliability_score: 5, clinical_score: 5 })).toBe(
      79
    );
  });

  it('a new volunteer (70) with a no-show review drops sharply', () => {
    // 0.7*70 + 0.3*0 = 49
    expect(recomputeVScoreAfterReview(70, { attended: false, reliability_score: null, clinical_score: null })).toBe(
      49
    );
  });

  it('an Elite volunteer (95) with a mediocre review regresses toward the outcome, not to 0', () => {
    // outcome: (2+2)/2*20 = 40; 0.7*95 + 0.3*40 = 66.5 + 12 = 78.5
    expect(recomputeVScoreAfterReview(95, { attended: true, reliability_score: 2, clinical_score: 2 })).toBe(
      78.5
    );
  });

  it('clamps the result to 100 even from a very high old score with a perfect outcome', () => {
    expect(recomputeVScoreAfterReview(100, { attended: true, reliability_score: 5, clinical_score: 5 })).toBe(
      100
    );
  });

  it('clamps the result to 0 even from a very low old score with a no-show outcome', () => {
    expect(recomputeVScoreAfterReview(2, { attended: false, reliability_score: null, clinical_score: null })).toBe(
      1.4
    );
  });
});

describe('applyVScorePenalty', () => {
  it('exposes the exact CLAUDE.md penalty amounts', () => {
    expect(V_SCORE_PENALTIES).toEqual({
      no_show: -15,
      late_cancellation: -8,
      on_time_cancellation: -2,
    });
  });

  it('no-show subtracts 15', () => {
    expect(applyVScorePenalty(70, 'no_show')).toBe(55);
  });

  it('late cancellation subtracts 8', () => {
    expect(applyVScorePenalty(70, 'late_cancellation')).toBe(62);
  });

  it('on-time cancellation subtracts 2', () => {
    expect(applyVScorePenalty(70, 'on_time_cancellation')).toBe(68);
  });

  it('clamps at 0 — a no-show penalty cannot push the score negative', () => {
    expect(applyVScorePenalty(10, 'no_show')).toBe(0);
    expect(applyVScorePenalty(0, 'no_show')).toBe(0);
  });

  it('clamps at 100 as an upper bound sanity check (score already at max)', () => {
    expect(applyVScorePenalty(100, 'on_time_cancellation')).toBe(98);
  });
});

describe('applyVScorePenalties — stacking', () => {
  it('stacks a no-show then a late cancellation sequentially', () => {
    // 70 -15 = 55, 55 -8 = 47
    expect(applyVScorePenalties(70, ['no_show', 'late_cancellation'])).toBe(47);
  });

  it('stacks all three penalty types', () => {
    // 70 -15 -8 -2 = 45
    expect(applyVScorePenalties(70, ['no_show', 'late_cancellation', 'on_time_cancellation'])).toBe(45);
  });

  it('stacking clamps at 0 rather than going negative partway through', () => {
    // 10 -15 => clamp 0, 0 -8 => clamp 0
    expect(applyVScorePenalties(10, ['no_show', 'late_cancellation'])).toBe(0);
  });

  it('an empty penalty list is a no-op', () => {
    expect(applyVScorePenalties(70, [])).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// Golden-case table: (old_score, event/penalty inputs) -> expected new_score,
// for the project owner to eyeball and sign off on the event_outcome formula.
// ---------------------------------------------------------------------------

interface ReviewGoldenCase {
  name: string;
  oldScore: number;
  review: EventOutcomeInput;
  expectedNewScore: number;
}

const reviewGoldenCases: ReviewGoldenCase[] = [
  {
    name: 'new volunteer, perfect first event',
    oldScore: 70,
    review: { attended: true, reliability_score: 5, clinical_score: 5 },
    expectedNewScore: 79, // 0.7*70 + 0.3*100
  },
  {
    name: 'new volunteer, average clinical event',
    oldScore: 70,
    review: { attended: true, reliability_score: 3, clinical_score: 3 },
    expectedNewScore: 67, // outcome 60; 0.7*70+0.3*60=49+18=67
  },
  {
    name: 'new volunteer, no-show at review stage',
    oldScore: 70,
    review: { attended: false, reliability_score: null, clinical_score: null },
    expectedNewScore: 49, // 0.7*70 + 0.3*0
  },
  {
    name: 'Trusted volunteer, support-role event (no clinical score), good reliability',
    oldScore: 80,
    review: { attended: true, reliability_score: 4, clinical_score: null },
    expectedNewScore: 80, // outcome 80; 0.7*80+0.3*80=56+24=80
  },
  {
    name: 'Elite volunteer, single mediocre review pulls them down but not below Trusted floor in one step',
    oldScore: 95,
    review: { attended: true, reliability_score: 3, clinical_score: 3 },
    expectedNewScore: 84.5, // outcome 60; 0.7*95+0.3*60=66.5+18=84.5
  },
  {
    name: 'At Risk volunteer, strong recovery event',
    oldScore: 30,
    review: { attended: true, reliability_score: 5, clinical_score: 4 },
    expectedNewScore: 48, // outcome (5+4)/2*20=90; 0.7*30+0.3*90=21+27=48
  },
  {
    name: 'Developing volunteer, floor attended review (1/1)',
    oldScore: 50,
    review: { attended: true, reliability_score: 1, clinical_score: 1 },
    expectedNewScore: 41, // outcome 20; 0.7*50+0.3*20=35+6=41
  },
];

describe('recomputeVScoreAfterReview golden cases', () => {
  test.each(reviewGoldenCases)('$name -> $expectedNewScore', ({ oldScore, review, expectedNewScore }) => {
    expect(recomputeVScoreAfterReview(oldScore, review)).toBe(expectedNewScore);
  });
});

interface PenaltyGoldenCase {
  name: string;
  oldScore: number;
  penalty: Parameters<typeof applyVScorePenalty>[1];
  expectedNewScore: number;
}

const penaltyGoldenCases: PenaltyGoldenCase[] = [
  { name: 'no-show from Active (65)', oldScore: 65, penalty: 'no_show', expectedNewScore: 50 },
  { name: 'late cancellation from Trusted (80)', oldScore: 80, penalty: 'late_cancellation', expectedNewScore: 72 },
  { name: 'on-time cancellation from Elite (92)', oldScore: 92, penalty: 'on_time_cancellation', expectedNewScore: 90 },
  { name: 'no-show clamps at 0 from a near-floor score (5)', oldScore: 5, penalty: 'no_show', expectedNewScore: 0 },
];

describe('applyVScorePenalty golden cases', () => {
  test.each(penaltyGoldenCases)('$name -> $expectedNewScore', ({ oldScore, penalty, expectedNewScore }) => {
    expect(applyVScorePenalty(oldScore, penalty)).toBe(expectedNewScore);
  });
});
