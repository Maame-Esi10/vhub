import {
  GHANA_REGION_ADJACENCY,
  GHANA_REGION_NAMES,
  getReachableRegions,
} from '../ghana-locations';

describe('GHANA_REGION_ADJACENCY', () => {
  it('covers all 16 regions and nothing else', () => {
    expect(GHANA_REGION_NAMES).toHaveLength(16);
    expect(Object.keys(GHANA_REGION_ADJACENCY).sort()).toEqual([...GHANA_REGION_NAMES].sort());
  });

  it('only names real regions as neighbours', () => {
    const known = new Set(GHANA_REGION_NAMES);
    for (const [region, neighbours] of Object.entries(GHANA_REGION_ADJACENCY)) {
      for (const neighbour of neighbours) {
        expect(known.has(neighbour)).toBe(true);
        // A region bordering itself would silently double-count it in the
        // reachable set.
        expect(neighbour).not.toBe(region);
      }
    }
  });

  // The property that matters most in practice. A one-way edge would make the
  // feed asymmetric — volunteers in one region seeing a neighbour's events
  // while that neighbour never saw theirs — and nothing in the UI would ever
  // reveal it.
  it('is symmetric: if A borders B then B borders A', () => {
    const asymmetric: string[] = [];
    for (const [region, neighbours] of Object.entries(GHANA_REGION_ADJACENCY)) {
      for (const neighbour of neighbours) {
        if (!GHANA_REGION_ADJACENCY[neighbour]?.includes(region)) {
          asymmetric.push(`${region} -> ${neighbour} has no return edge`);
        }
      }
    }
    expect(asymmetric).toEqual([]);
  });

  it('lists no duplicate neighbours', () => {
    for (const neighbours of Object.values(GHANA_REGION_ADJACENCY)) {
      expect(new Set(neighbours).size).toBe(neighbours.length);
    }
  });

  it('leaves no region isolated', () => {
    for (const neighbours of Object.values(GHANA_REGION_ADJACENCY)) {
      expect(neighbours.length).toBeGreaterThan(0);
    }
  });
});

describe('getReachableRegions', () => {
  it('includes the volunteer’s own region first, then its neighbours', () => {
    const reachable = getReachableRegions('Greater Accra');
    expect(reachable[0]).toBe('Greater Accra');
    expect(reachable).toEqual(
      expect.arrayContaining(['Greater Accra', 'Central', 'Eastern', 'Volta'])
    );
    expect(reachable).not.toContain('Upper West');
  });

  it('trims whitespace around a stored region name', () => {
    expect(getReachableRegions('  Volta  ')).toEqual(getReachableRegions('Volta'));
  });

  // Callers must read an empty result as "no filter possible, search
  // everywhere" — never as "nothing is reachable", which would empty the feed
  // for anyone whose profile region is missing or misspelled.
  it('returns empty for a missing or unrecognised region', () => {
    expect(getReachableRegions(null)).toEqual([]);
    expect(getReachableRegions(undefined)).toEqual([]);
    expect(getReachableRegions('')).toEqual([]);
    expect(getReachableRegions('   ')).toEqual([]);
    expect(getReachableRegions('Brong Ahafo')).toEqual([]); // pre-2019 region
  });

  it('never returns a region twice', () => {
    for (const region of GHANA_REGION_NAMES) {
      const reachable = getReachableRegions(region);
      expect(new Set(reachable).size).toBe(reachable.length);
    }
  });
});
