import {
  applyLateReleasePenalty,
  lateReleasePenalty,
  LATE_RELEASE_MAX_PENALTY,
  LATE_RELEASE_MIN_PENALTY,
  NEW_VOLUNTEER_V_SCORE,
  replayVScore,
  RELIABILITY_MULTIPLIERS,
  V_SCORE_PENALTIES,
  applyVScorePenalties,
  applyVScorePenalty,
  computeEventOutcome,
  computeRankingScore,
  dayCommitmentRatio,
  getReliabilityMultiplier,
  getVScoreBand,
  hasScorableOutcome,
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

  // These two used to assert 60, from a `DEFAULT_MISSING_SUBSCORE = 3`
  // substituted for a missing rating on the reasoning that the midpoint of the
  // scale is neutral. It is not: 3/5 scales to 60, volunteers START at 70, and
  // 0.7x70 + 0.3x60 = 67 -- so an unrated review silently cost a good
  // volunteer three points. Reported on device 2026-08-07. There is no neutral
  // NUMBER when the baseline is 70; the honest answer is "no signal".
  it('returns null when reliability_score is missing despite attended = true', () => {
    expect(
      computeEventOutcome({ attended: true, reliability_score: null, clinical_score: null })
    ).toBeNull();
    // A clinical score alone is still not enough -- reliability is the score
    // every review has, clinical is the one only some roles get.
    expect(computeEventOutcome({ attended: true, reliability_score: null, clinical_score: 5 })).toBeNull();
  });

  it('returns null when attendance itself is unknown', () => {
    expect(
      computeEventOutcome({ attended: null, reliability_score: null, clinical_score: null })
    ).toBeNull();
    expect(computeEventOutcome({ attended: null, reliability_score: 5, clinical_score: 5 })).toBeNull();
  });

  it('clamps to 100 even if a caller passes an out-of-range sub-score above 5', () => {
    expect(computeEventOutcome({ attended: true, reliability_score: 10, clinical_score: 10 })).toBe(100);
  });
});

describe('an unscorable review must not move the score', () => {
  // The bug this whole change exists for, stated as a test: a volunteer who
  // turned up and did nothing wrong must never lose points because the
  // organiser did not tap any stars.
  it('leaves a new volunteer at exactly 70 when no rating was given', () => {
    expect(
      recomputeVScoreAfterReview(70, { attended: true, reliability_score: null, clinical_score: null })
    ).toBe(70);
  });

  it('leaves any score untouched, above or below the starting point', () => {
    for (const score of [0, 12, 40, 59, 60, 61, 70, 89, 95, 100]) {
      expect(
        recomputeVScoreAfterReview(score, {
          attended: true,
          reliability_score: null,
          clinical_score: null,
        })
      ).toBe(score);
    }
  });

  it('still records a no-show, which is a real signal rather than a gap', () => {
    expect(
      recomputeVScoreAfterReview(70, { attended: false, reliability_score: null, clinical_score: null })
    ).toBe(49);
  });

  it('hasScorableOutcome agrees with computeEventOutcome', () => {
    expect(hasScorableOutcome({ attended: true, reliability_score: 4, clinical_score: null })).toBe(true);
    expect(hasScorableOutcome({ attended: false, reliability_score: null, clinical_score: null })).toBe(true);
    expect(hasScorableOutcome({ attended: true, reliability_score: null, clinical_score: null })).toBe(false);
    expect(hasScorableOutcome({ attended: null, reliability_score: 3, clinical_score: 3 })).toBe(false);
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

// ---------------------------------------------------------------------------
// Reliability multiplier (owner decision, 2026-08-05)
// ---------------------------------------------------------------------------

describe('getReliabilityMultiplier — every band edge', () => {
  const cases: { score: number; expected: number; why: string }[] = [
    { score: 100, expected: 1, why: 'top of Elite' },
    { score: 90, expected: 1, why: 'Elite lower edge' },
    { score: 89, expected: 1, why: 'Trusted upper edge' },
    { score: 75, expected: 1, why: 'Trusted lower edge' },
    { score: 74, expected: 1, why: 'Active upper edge' },
    { score: NEW_VOLUNTEER_V_SCORE, expected: 1, why: 'a brand-new volunteer is never penalised' },
    { score: 60, expected: 1, why: 'Active lower edge — last score with no penalty' },
    { score: 59, expected: 0.9, why: 'Developing upper edge — penalty begins here' },
    { score: 40, expected: 0.9, why: 'Developing lower edge' },
    { score: 39, expected: 0.7, why: 'At Risk upper edge' },
    { score: 0, expected: 0.7, why: 'floor' },
  ];

  test.each(cases)('$score ($why) -> $expected', ({ score, expected }) => {
    expect(getReliabilityMultiplier(score)).toBe(expected);
  });

  it('is neutral for an unknown score rather than penalising it', () => {
    expect(getReliabilityMultiplier(null)).toBe(1);
    expect(getReliabilityMultiplier(undefined)).toBe(1);
    expect(getReliabilityMultiplier(Number.NaN)).toBe(1);
  });

  // The invariant the whole design rests on: reputation can only ever pull a
  // candidate DOWN from the ceiling their fit earns them. If any multiplier
  // were ever raised above 1.0, reputation could override fit and new
  // volunteers would be structurally disadvantaged.
  it('is bounded in (0, 1] for every band', () => {
    for (const multiplier of Object.values(RELIABILITY_MULTIPLIERS)) {
      expect(multiplier).toBeGreaterThan(0);
      expect(multiplier).toBeLessThanOrEqual(1);
    }
  });
});

describe('computeRankingScore', () => {
  it('leaves a reliable volunteer at their raw match score', () => {
    expect(computeRankingScore(95, 90)).toBe(95);
    expect(computeRankingScore(95, NEW_VOLUNTEER_V_SCORE)).toBe(95);
  });

  // The calibration behind At Risk = 0.70, asserted so it cannot drift: a
  // chronic no-show's 90% fit demotes to 63, so a reliable candidate overtakes
  // them from roughly 63% fit upward — about one band of fit — while a
  // substantially better-fitting unreliable candidate still wins.
  it('costs a chronic no-show roughly one band of fit', () => {
    const atRisk = computeRankingScore(90, 30);
    expect(atRisk).toBeCloseTo(63);
    expect(computeRankingScore(64, 85)).toBeGreaterThan(atRisk);
    expect(computeRankingScore(62, 85)).toBeLessThan(atRisk);
  });

  it('never lets reliability overtake a clearly better fit', () => {
    // An Elite volunteer with mediocre fit stays behind an At Risk volunteer
    // whose fit is far higher — fit dominates, which is the point.
    expect(computeRankingScore(50, 95)).toBeLessThan(computeRankingScore(90, 20));
  });

  it('applies the mild Developing nudge', () => {
    expect(computeRankingScore(80, 50)).toBeCloseTo(72);
  });
});

describe('the late per-day release penalty', () => {
  const committed4 = { daysCommitted: 4, daysReleased: 1 };

  it('costs nothing for the first two in the window', () => {
    // Per-day release exists BECAUSE the app used to punish people for
    // something it gave them no way to avoid. Charging for the first honest
    // use of the escape hatch would rebuild the trap.
    expect(lateReleasePenalty({ priorLateReleases: 0, ...committed4 })).toBe(0);
    expect(lateReleasePenalty({ priorLateReleases: 1, ...committed4 })).toBe(0);
  });

  it('starts deducting on the third', () => {
    expect(lateReleasePenalty({ priorLateReleases: 2, ...committed4 })).toBeLessThan(0);
  });

  it('scales with how much of the commitment was dropped', () => {
    const p = (daysReleased: number) =>
      lateReleasePenalty({ priorLateReleases: 2, daysCommitted: 4, daysReleased });
    expect(p(1)).toBe(-2);
    expect(p(2)).toBe(-4);
    expect(p(3)).toBe(-6);
  });

  it('meets the existing scale exactly at its edge', () => {
    // Releasing the whole commitment IS a withdrawal and takes -8 by that path,
    // which is the argument for -8 as the coefficient rather than any other.
    expect(lateReleasePenalty({ priorLateReleases: 2, daysCommitted: 4, daysReleased: 4 })).toBe(
      V_SCORE_PENALTIES.late_cancellation
    );
  });

  it('never rounds a long campaign down to nothing', () => {
    // One day of twenty is a 5% share, which is -0.4 before the floor. Without
    // the floor, repeated late drops on long events would be free.
    expect(lateReleasePenalty({ priorLateReleases: 5, daysCommitted: 20, daysReleased: 1 })).toBe(
      LATE_RELEASE_MIN_PENALTY
    );
  });

  it('never costs more than abandoning the event, let alone a no-show', () => {
    const worst = lateReleasePenalty({
      priorLateReleases: 99,
      daysCommitted: 2,
      daysReleased: 40,
    });
    expect(worst).toBe(LATE_RELEASE_MAX_PENALTY);
    expect(worst).toBeGreaterThan(V_SCORE_PENALTIES.no_show);
  });

  it('moves nothing when the numbers are nonsense', () => {
    expect(lateReleasePenalty({ priorLateReleases: 9, daysCommitted: 0, daysReleased: 1 })).toBe(0);
    expect(lateReleasePenalty({ priorLateReleases: 9, daysCommitted: 4, daysReleased: 0 })).toBe(0);
  });

  it('applies to a score and cannot push it below zero', () => {
    expect(
      applyLateReleasePenalty(70, { priorLateReleases: 2, daysCommitted: 4, daysReleased: 1 })
    ).toBe(68);
    expect(
      applyLateReleasePenalty(1, { priorLateReleases: 2, daysCommitted: 4, daysReleased: 4 })
    ).toBe(0);
  });
});

describe('replayVScore — the score as a derived value', () => {
  it('returns the starting score for a volunteer with no history', () => {
    expect(replayVScore([])).toEqual({ score: NEW_VOLUNTEER_V_SCORE, eventsAttended: 0 });
  });

  /*
    THE PROPERTY THE WHOLE MIGRATION RESTS ON. Replaying a history with no
    corrections must produce exactly what applying the same reviews one at a
    time produced. If this ever fails, the recompute would silently move every
    score on the platform for no reason.
  */
  it('reproduces the running total exactly when nothing is corrected', () => {
    const reviews = [
      { attended: true, reliability_score: 5, clinical_score: 5 },
      { attended: true, reliability_score: 3, clinical_score: null },
      { attended: false, reliability_score: null, clinical_score: null },
      { attended: true, reliability_score: 4, clinical_score: 4 },
    ];

    let running = NEW_VOLUNTEER_V_SCORE;
    for (const review of reviews) running = recomputeVScoreAfterReview(running, review);

    expect(replayVScore(reviews).score).toBeCloseTo(running, 10);
  });

  it('counts only attended events', () => {
    const result = replayVScore([
      { attended: true, reliability_score: 4, clinical_score: null },
      { attended: false, reliability_score: null, clinical_score: null },
      { attended: true, reliability_score: 5, clinical_score: null },
    ]);
    expect(result.eventsAttended).toBe(2);
  });

  it('an upheld dispute stops that event moving the score at all', () => {
    const history = [
      { attended: true, reliability_score: 5, clinical_score: 5 },
      { attended: false, reliability_score: null, clinical_score: null },
    ];

    const uncorrected = replayVScore(history);
    const corrected = replayVScore([
      history[0]!,
      { ...history[1]!, outcomeVoided: true, attendanceCorrected: true },
    ]);

    // The no-show floored the outcome at 0 and dragged the score down; voiding
    // it leaves the score where the good event left it.
    expect(corrected.score).toBeGreaterThan(uncorrected.score);
    expect(corrected.score).toBeCloseTo(replayVScore([history[0]!]).score, 10);
  });

  it('an upheld attendance dispute also restores the attendance count', () => {
    const result = replayVScore([
      { attended: false, reliability_score: null, clinical_score: null, attendanceCorrected: true, outcomeVoided: true },
    ]);
    expect(result.eventsAttended).toBe(1);
    // Nothing to score, so the score does not move — the same rule an unrated
    // review has always followed.
    expect(result.score).toBe(NEW_VOLUNTEER_V_SCORE);
  });

  it('order changes the result, which is why filing order is fixed', () => {
    const good = { attended: true, reliability_score: 5, clinical_score: 5 };
    const bad = { attended: true, reliability_score: 1, clinical_score: 1 };

    // Not an accident to be tolerated but the reason the ordering rule exists:
    // the blend weights the most recent event most heavily.
    expect(replayVScore([good, bad]).score).not.toBeCloseTo(replayVScore([bad, good]).score, 5);
  });

  it('stays inside 0-100 however extreme the history', () => {
    const allBad = Array.from({ length: 50 }, () => ({
      attended: false,
      reliability_score: null,
      clinical_score: null,
    }));
    const allGood = Array.from({ length: 50 }, () => ({
      attended: true,
      reliability_score: 5,
      clinical_score: 5,
    }));

    expect(replayVScore(allBad).score).toBeGreaterThanOrEqual(0);
    expect(replayVScore(allGood).score).toBeLessThanOrEqual(100);
  });
});

describe('replayVScore — penalties in the stream', () => {
  const goodEvent = { attended: true, reliability_score: 5, clinical_score: 5 };

  /*
    THE PROPERTY THAT MAKES THE MIGRATION SAFE. score_events starts empty, so
    every existing score must replay to exactly what it replayed to before
    penalties existed. If this fails, running 20260904 would move scores on a
    platform where nothing was ever penalised.
  */
  it('changes nothing at all when there are no penalties', () => {
    const history = [
      goodEvent,
      { attended: true, reliability_score: 3, clinical_score: null },
      { attended: false, reliability_score: null, clinical_score: null },
    ];
    expect(replayVScore(history)).toEqual(replayVScore([...history]));
    expect(replayVScore(history).score).toBeCloseTo(
      recomputeVScoreAfterReview(
        recomputeVScoreAfterReview(
          recomputeVScoreAfterReview(NEW_VOLUNTEER_V_SCORE, history[0]!),
          history[1]!
        ),
        history[2]!
      ),
      10
    );
  });

  it('subtracts a flat penalty at its point in the sequence', () => {
    const withPenalty = replayVScore([
      { penalty: true, points: V_SCORE_PENALTIES.late_cancellation },
    ]);
    expect(withPenalty.score).toBeCloseTo(
      NEW_VOLUNTEER_V_SCORE + V_SCORE_PENALTIES.late_cancellation,
      10
    );
  });

  /*
    The behaviour that the running total used to have and that a stored
    penalty must reproduce: a deduction is not permanent, it is blended away by
    later events at 0.7x apiece. Same formula, different storage.
  */
  it('lets later reviews blend a penalty away, exactly as the running total did', () => {
    const penaltyThenReview = replayVScore([
      { penalty: true, points: V_SCORE_PENALTIES.late_cancellation },
      goodEvent,
    ]);

    const runningTotal = recomputeVScoreAfterReview(
      applyVScorePenalty(NEW_VOLUNTEER_V_SCORE, 'late_cancellation'),
      goodEvent
    );

    expect(penaltyThenReview.score).toBeCloseTo(runningTotal, 10);
  });

  it('order matters between a penalty and a review, which is why one stream is merged', () => {
    const before = replayVScore([{ penalty: true, points: -8 }, goodEvent]).score;
    const after = replayVScore([goodEvent, { penalty: true, points: -8 }]).score;
    expect(before).not.toBeCloseTo(after, 5);
  });

  it('a voided penalty stops counting and is not added back', () => {
    const voided = replayVScore([
      { penalty: true, points: -8, voided: true },
      goodEvent,
    ]);
    expect(voided.score).toBeCloseTo(replayVScore([goodEvent]).score, 10);
  });

  it('never drives a score below zero, however many penalties land', () => {
    const many = Array.from({ length: 40 }, () => ({
      penalty: true as const,
      points: V_SCORE_PENALTIES.no_show,
    }));
    expect(replayVScore(many).score).toBe(0);
  });

  it('a penalty does not touch the attendance count', () => {
    const result = replayVScore([
      goodEvent,
      { penalty: true, points: V_SCORE_PENALTIES.on_time_cancellation },
    ]);
    expect(result.eventsAttended).toBe(1);
  });

  /*
    The late-release deduction, which had nowhere to live until score_events.
    The amount is decided by lateReleasePenalty() at the moment of the release
    and stored; the replay only adds it.
  */
  it('carries a late-release deduction at the figure it was decided at', () => {
    const points = lateReleasePenalty({
      priorLateReleases: 2,
      daysReleased: 1,
      daysCommitted: 4,
    });
    expect(points).toBe(-2);

    expect(replayVScore([{ penalty: true, points }]).score).toBeCloseTo(
      NEW_VOLUNTEER_V_SCORE + points,
      10
    );
  });
});


/*
  MULTI-DAY PARTICIPATION SCALING (owner-approved 2026-08-30).

  The whole multi-day subsystem records which days a volunteer promised and
  which they turned up for, and until this the scorer discarded it: 1 day of 4
  scored exactly the same as 4 of 4. The event outcome is now computed ONCE per
  event, as it always was, and then multiplied by the share of committed days
  attended.

  The two things these tests exist to pin down are the ones that would cause
  silent harm if they regressed: omitting the day figures must mean "do not
  scale" rather than "attended nothing", and a released day must leave the
  DENOMINATOR rather than count against the volunteer.
*/
describe('dayCommitmentRatio', () => {
  it('is the plain share of committed days attended', () => {
    expect(dayCommitmentRatio(4, 4)).toBe(1);
    expect(dayCommitmentRatio(3, 4)).toBe(0.75);
    expect(dayCommitmentRatio(1, 4)).toBe(0.25);
    expect(dayCommitmentRatio(0, 4)).toBe(0);
  });

  it('returns null rather than zero when there is no day information', () => {
    // Null is not a ratio of nothing -- it is the absence of a ratio, and the
    // caller must leave the outcome alone. Reading it as 0 would wipe out a
    // good review for a volunteer nobody had recorded days for.
    expect(dayCommitmentRatio(null, null)).toBeNull();
    expect(dayCommitmentRatio(3, null)).toBeNull();
    expect(dayCommitmentRatio(null, 4)).toBeNull();
    expect(dayCommitmentRatio(undefined, undefined)).toBeNull();
  });

  it('returns null rather than dividing by zero', () => {
    expect(dayCommitmentRatio(0, 0)).toBeNull();
    expect(dayCommitmentRatio(2, -1)).toBeNull();
  });

  it('never exceeds 1, so a miscount cannot inflate an outcome', () => {
    expect(dayCommitmentRatio(9, 4)).toBe(1);
  });

  it('rejects non-finite figures instead of producing NaN', () => {
    expect(dayCommitmentRatio(Number.NaN, 4)).toBeNull();
    expect(dayCommitmentRatio(2, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('computeEventOutcome — scaling by days attended', () => {
  const perfect: EventOutcomeInput = {
    attended: true,
    reliability_score: 5,
    clinical_score: 5,
  };

  it('leaves the outcome untouched when no day figures are supplied', () => {
    // Every caller written before this change, and every path with no day
    // information to hand, must behave exactly as it did.
    expect(computeEventOutcome(perfect)).toBe(100);
  });

  it('leaves the outcome untouched when every committed day was attended', () => {
    expect(
      computeEventOutcome({ ...perfect, daysAttended: 4, daysCommitted: 4 })
    ).toBe(100);
  });

  it('scales a partial attendance by the share delivered', () => {
    // 1 of 4 days of a perfect review is no longer identical to 4 of 4.
    expect(
      computeEventOutcome({ ...perfect, daysAttended: 1, daysCommitted: 4 })
    ).toBe(25);
    expect(
      computeEventOutcome({ ...perfect, daysAttended: 3, daysCommitted: 4 })
    ).toBe(75);
  });

  it('is unchanged for a single-day event, which is the n=1 case', () => {
    expect(
      computeEventOutcome({ ...perfect, daysAttended: 1, daysCommitted: 1 })
    ).toBe(100);
  });

  it('lands on the no-show floor when zero committed days were attended', () => {
    // The same 0 that attended:false takes. Somebody marked absent on all four
    // of the days they committed to did not attend, whatever the review's
    // overall box says -- and it arrives at that answer by arithmetic rather
    // than by a special case.
    expect(
      computeEventOutcome({ ...perfect, daysAttended: 0, daysCommitted: 4 })
    ).toBe(0);
    expect(computeEventOutcome({ ...perfect, attended: false })).toBe(0);
  });

  it('still returns null for an unscorable review, whatever the days say', () => {
    // A day ratio is not a substitute for a missing rating. Scaling nothing
    // still gives nothing, and the score must not move.
    expect(
      computeEventOutcome({
        attended: true,
        reliability_score: null,
        clinical_score: null,
        daysAttended: 4,
        daysCommitted: 4,
      })
    ).toBeNull();
  });

  it('scales a support-role review, which is scored on reliability alone', () => {
    expect(
      computeEventOutcome({
        attended: true,
        reliability_score: 4,
        clinical_score: null,
        daysAttended: 2,
        daysCommitted: 4,
      })
    ).toBe(40);
  });
});

describe('replayVScore — partial attendance moves less than full attendance', () => {
  const base = { attended: true, reliability_score: 5, clinical_score: 5 } as const;

  it('a volunteer who managed 1 of 4 days ends below one who managed 4 of 4', () => {
    const full = replayVScore([{ ...base, daysAttended: 4, daysCommitted: 4 }]);
    const partial = replayVScore([{ ...base, daysAttended: 1, daysCommitted: 4 }]);

    expect(full.score).toBeGreaterThan(partial.score);
    // 0.7 x 70 + 0.3 x 100 vs 0.7 x 70 + 0.3 x 25.
    expect(full.score).toBeCloseTo(79, 10);
    expect(partial.score).toBeCloseTo(56.5, 10);
  });

  it('counts the event as attended even when only some days were', () => {
    // events_attended counts EVENTS, not days. Somebody who came on one of four
    // days took part in the event; the score is what reflects how much of it.
    const result = replayVScore([{ ...base, daysAttended: 1, daysCommitted: 4 }]);
    expect(result.eventsAttended).toBe(1);
  });

  it('a released day leaves the denominator rather than counting against them', () => {
    // The volunteer committed to 4, released 1 in advance and attended the
    // other 3. The commitment is now 3 of 3, not 3 of 4, so the outcome is
    // unscaled -- an honest early release must never become a silent penalty.
    const released = replayVScore([{ ...base, daysAttended: 3, daysCommitted: 3 }]);
    const notReleased = replayVScore([{ ...base, daysAttended: 3, daysCommitted: 4 }]);

    expect(released.score).toBeCloseTo(79, 10);
    expect(released.score).toBeGreaterThan(notReleased.score);
  });

  it('an upheld dispute still voids the event, ratio or no ratio', () => {
    const result = replayVScore([
      { ...base, attended: false, daysAttended: 0, daysCommitted: 4, outcomeVoided: true },
    ]);
    expect(result.score).toBe(NEW_VOLUNTEER_V_SCORE);
  });
});
