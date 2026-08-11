import {
  MIN_WAITLIST_CAPACITY,
  isOversubscribed,
  planBatchAccept,
  rankApplicants,
  skillCoverage,
  waitlistCapacity,
  waitlistPositions,
  type RankableApplicant,
} from '../roster';

/** Builds an applicant; every field has a boring default so tests state only what they mean. */
function applicant(over: Partial<RankableApplicant> & { id: string }): RankableApplicant {
  return {
    status: 'pending',
    matchScore: 80,
    vScore: 70,
    createdAt: '2026-08-01T09:00:00.000Z',
    ...over,
  };
}

describe('waitlistCapacity', () => {
  it('is twice the slots once that exceeds the floor', () => {
    expect(waitlistCapacity(10)).toBe(20);
    expect(waitlistCapacity(50)).toBe(100);
  });

  it('never drops below the floor for small outreaches', () => {
    expect(waitlistCapacity(1)).toBe(MIN_WAITLIST_CAPACITY);
    expect(waitlistCapacity(2)).toBe(MIN_WAITLIST_CAPACITY);
    // 3 slots -> 6, the first size where doubling wins.
    expect(waitlistCapacity(3)).toBe(6);
  });

  it('handles a zero-slot outreach without going negative', () => {
    expect(waitlistCapacity(0)).toBe(MIN_WAITLIST_CAPACITY);
  });
});

describe('rankApplicants', () => {
  it('orders by ranking score, best first', () => {
    const ranked = rankApplicants([
      applicant({ id: 'low', matchScore: 60 }),
      applicant({ id: 'high', matchScore: 95 }),
      applicant({ id: 'mid', matchScore: 80 }),
    ]);
    expect(ranked.map((a) => a.id)).toEqual(['high', 'mid', 'low']);
  });

  it('applies the reliability multiplier, so an At Risk volunteer falls behind', () => {
    // 90 x 0.70 = 63 for the At Risk volunteer; 70 x 1.00 = 70 for the reliable one.
    const ranked = rankApplicants([
      applicant({ id: 'unreliable', matchScore: 90, vScore: 20 }),
      applicant({ id: 'reliable', matchScore: 70, vScore: 70 }),
    ]);
    expect(ranked.map((a) => a.id)).toEqual(['reliable', 'unreliable']);
  });

  it('never lets reputation overtake fit — the multiplier is bounded at 1.0', () => {
    // An Elite volunteer cannot be boosted past a better-fitting Active one.
    const ranked = rankApplicants([
      applicant({ id: 'elite-worse-fit', matchScore: 80, vScore: 98 }),
      applicant({ id: 'active-better-fit', matchScore: 85, vScore: 70 }),
    ]);
    expect(ranked.map((a) => a.id)).toEqual(['active-better-fit', 'elite-worse-fit']);
  });

  it('breaks ties by who applied first', () => {
    const ranked = rankApplicants([
      applicant({ id: 'later', createdAt: '2026-08-02T09:00:00.000Z' }),
      applicant({ id: 'earlier', createdAt: '2026-08-01T09:00:00.000Z' }),
    ]);
    expect(ranked.map((a) => a.id)).toEqual(['earlier', 'later']);
  });

  it('sorts an unscored application last but keeps it in the list', () => {
    const ranked = rankApplicants([
      applicant({ id: 'unscored', matchScore: null }),
      applicant({ id: 'scored', matchScore: 10 }),
    ]);
    expect(ranked.map((a) => a.id)).toEqual(['scored', 'unscored']);
  });

  it('does not mutate the input array', () => {
    const input = [applicant({ id: 'a', matchScore: 10 }), applicant({ id: 'b', matchScore: 90 })];
    rankApplicants(input);
    expect(input.map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('waitlistPositions', () => {
  it('numbers only the waitlisted, best-ranked first', () => {
    const positions = waitlistPositions([
      applicant({ id: 'accepted', status: 'accepted', matchScore: 99 }),
      applicant({ id: 'w-second', status: 'waitlisted', matchScore: 70 }),
      applicant({ id: 'w-first', status: 'waitlisted', matchScore: 90 }),
      applicant({ id: 'pending', status: 'pending', matchScore: 95 }),
    ]);
    expect(positions.get('w-first')).toBe(1);
    expect(positions.get('w-second')).toBe(2);
    expect(positions.has('accepted')).toBe(false);
    expect(positions.has('pending')).toBe(false);
  });

  it('is empty when nobody is waitlisted', () => {
    expect(waitlistPositions([applicant({ id: 'a' })]).size).toBe(0);
  });
});

describe('planBatchAccept', () => {
  const five = [
    applicant({ id: 'a', matchScore: 95 }),
    applicant({ id: 'b', matchScore: 90 }),
    applicant({ id: 'c', matchScore: 85 }),
    applicant({ id: 'd', matchScore: 80 }),
    applicant({ id: 'e', matchScore: 75 }),
  ];

  it('fills the free slots best-first and waitlists the surplus', () => {
    const plan = planBatchAccept({ applicants: five, slotsTotal: 2, slotsFilled: 0 });
    expect(plan.accept).toEqual(['a', 'b']);
    expect(plan.waitlist).toEqual(['c', 'd', 'e']);
    expect(plan.leftPending).toEqual([]);
  });

  it('counts slots already filled', () => {
    const plan = planBatchAccept({ applicants: five, slotsTotal: 3, slotsFilled: 2 });
    expect(plan.accept).toEqual(['a']);
  });

  it('accepts nobody when the outreach is already full, and still waitlists', () => {
    const plan = planBatchAccept({ applicants: five, slotsTotal: 2, slotsFilled: 2 });
    expect(plan.accept).toEqual([]);
    expect(plan.waitlist).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('honours a smaller explicit limit', () => {
    const plan = planBatchAccept({ applicants: five, slotsTotal: 5, slotsFilled: 0, limit: 2 });
    expect(plan.accept).toEqual(['a', 'b']);
    expect(plan.waitlist).toEqual(['c', 'd', 'e']);
  });

  it('clamps a limit larger than the free slots', () => {
    const plan = planBatchAccept({ applicants: five, slotsTotal: 2, slotsFilled: 0, limit: 99 });
    expect(plan.accept).toEqual(['a', 'b']);
  });

  it('leaves applicants beyond the waitlist cap PENDING — never rejected', () => {
    // 1 slot -> capacity floor of 5. One accepted, five waitlisted, the rest pending.
    const many = Array.from({ length: 9 }, (_, i) =>
      applicant({ id: `v${i}`, matchScore: 100 - i })
    );
    const plan = planBatchAccept({ applicants: many, slotsTotal: 1, slotsFilled: 0 });
    expect(plan.accept).toEqual(['v0']);
    expect(plan.waitlist).toEqual(['v1', 'v2', 'v3', 'v4', 'v5']);
    expect(plan.leftPending).toEqual(['v6', 'v7', 'v8']);
    // Every applicant is accounted for, and none was rejected.
    expect(plan.accept.length + plan.waitlist.length + plan.leftPending.length).toBe(many.length);
  });

  it('counts the existing waitlist against the cap', () => {
    const applicants = [
      ...Array.from({ length: 4 }, (_, i) =>
        applicant({ id: `already${i}`, status: 'waitlisted' as const })
      ),
      applicant({ id: 'p1', matchScore: 90 }),
      applicant({ id: 'p2', matchScore: 80 }),
      applicant({ id: 'p3', matchScore: 70 }),
    ];
    // 1 slot -> capacity 5, four taken, so only one more may be waitlisted.
    const plan = planBatchAccept({ applicants, slotsTotal: 1, slotsFilled: 0 });
    expect(plan.accept).toEqual(['p1']);
    expect(plan.waitlist).toEqual(['p2']);
    expect(plan.leftPending).toEqual(['p3']);
  });

  it('never re-orders or re-decides people who already have a decision', () => {
    const applicants = [
      applicant({ id: 'accepted-poor-fit', status: 'accepted', matchScore: 10 }),
      applicant({ id: 'waitlisted-poor-fit', status: 'waitlisted', matchScore: 10 }),
      applicant({ id: 'cancelled', status: 'cancelled', matchScore: 99 }),
      applicant({ id: 'rejected', status: 'rejected', matchScore: 99 }),
      applicant({ id: 'pending-great-fit', matchScore: 99 }),
    ];
    const plan = planBatchAccept({ applicants, slotsTotal: 5, slotsFilled: 1 });
    expect(plan.accept).toEqual(['pending-great-fit']);
    expect(plan.waitlist).toEqual([]);
    expect(plan.leftPending).toEqual([]);
  });

  it('does nothing when there is nothing pending', () => {
    const plan = planBatchAccept({ applicants: [], slotsTotal: 5, slotsFilled: 0 });
    expect(plan).toEqual({ accept: [], waitlist: [], leftPending: [] });
  });
});

describe('skillCoverage', () => {
  it('reports which required skills the roster holds', () => {
    const coverage = skillCoverage(
      ['Triage', 'Venipuncture', 'Vaccination'],
      [['Triage', 'First Aid'], ['Vaccination']]
    );
    expect(coverage.covered).toEqual(['Triage', 'Vaccination']);
    expect(coverage.missing).toEqual(['Venipuncture']);
    expect(coverage.ratio).toBeCloseTo(2 / 3);
  });

  it('counts a skill once however many volunteers hold it', () => {
    const coverage = skillCoverage(['Triage'], [['Triage'], ['Triage'], ['Triage']]);
    expect(coverage.covered).toEqual(['Triage']);
    expect(coverage.ratio).toBe(1);
  });

  it('treats an outreach requiring nothing as fully covered', () => {
    expect(skillCoverage([], [['Triage']]).ratio).toBe(1);
    expect(skillCoverage(null, []).ratio).toBe(1);
  });

  it('reports zero coverage for an empty roster', () => {
    const coverage = skillCoverage(['Triage', 'Vaccination'], []);
    expect(coverage.covered).toEqual([]);
    expect(coverage.missing).toEqual(['Triage', 'Vaccination']);
    expect(coverage.ratio).toBe(0);
  });

  it('tolerates a volunteer with no skills recorded', () => {
    const coverage = skillCoverage(['Triage'], [null, undefined, ['Triage']]);
    expect(coverage.ratio).toBe(1);
  });

  it('ignores roster skills the outreach does not require', () => {
    const coverage = skillCoverage(['Triage'], [['Triage', 'Surgery', 'Phlebotomy']]);
    expect(coverage.covered).toEqual(['Triage']);
    expect(coverage.ratio).toBe(1);
  });
});

describe('isOversubscribed', () => {
  it('is true only when pending applicants outnumber the free slots', () => {
    expect(isOversubscribed({ pendingCount: 6, slotsTotal: 5, slotsFilled: 0 })).toBe(true);
    expect(isOversubscribed({ pendingCount: 5, slotsTotal: 5, slotsFilled: 0 })).toBe(false);
    expect(isOversubscribed({ pendingCount: 1, slotsTotal: 5, slotsFilled: 5 })).toBe(true);
    expect(isOversubscribed({ pendingCount: 0, slotsTotal: 5, slotsFilled: 5 })).toBe(false);
  });
});
