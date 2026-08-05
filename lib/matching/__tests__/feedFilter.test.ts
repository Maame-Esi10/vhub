import { FEED_MIN_CANDIDATES, shouldWidenFeedSearch } from '../feedFilter';

const base = {
  hasExplicitRegionFilter: false,
  reachableRegionCount: 5,
  candidateCount: 20,
};

describe('shouldWidenFeedSearch', () => {
  it('does not widen when the region search already found enough', () => {
    expect(shouldWidenFeedSearch({ ...base, candidateCount: FEED_MIN_CANDIDATES })).toBe(false);
    expect(shouldWidenFeedSearch({ ...base, candidateCount: 50 })).toBe(false);
  });

  // The failure this rule exists to prevent: a volunteer in a low-activity
  // region must never be shown an empty or near-empty feed as a side effect of
  // an optimisation.
  it('widens when the region search came up thin', () => {
    for (let count = 0; count < FEED_MIN_CANDIDATES; count += 1) {
      expect(shouldWidenFeedSearch({ ...base, candidateCount: count })).toBe(true);
    }
  });

  it('widens on an empty result, the worst case', () => {
    expect(shouldWidenFeedSearch({ ...base, candidateCount: 0 })).toBe(true);
  });

  it('never overrides the volunteer’s own explicit region filter', () => {
    expect(
      shouldWidenFeedSearch({ ...base, hasExplicitRegionFilter: true, candidateCount: 0 })
    ).toBe(false);
  });

  // Zero reachable regions means no restriction was applied at all, so the
  // first query already searched the whole platform. Widening would repeat an
  // identical query for an identical result.
  it('does not repeat a search that was already unrestricted', () => {
    expect(shouldWidenFeedSearch({ ...base, reachableRegionCount: 0, candidateCount: 0 })).toBe(
      false
    );
  });

  it('the boundary sits exactly at FEED_MIN_CANDIDATES', () => {
    expect(shouldWidenFeedSearch({ ...base, candidateCount: FEED_MIN_CANDIDATES - 1 })).toBe(true);
    expect(shouldWidenFeedSearch({ ...base, candidateCount: FEED_MIN_CANDIDATES })).toBe(false);
  });
});
