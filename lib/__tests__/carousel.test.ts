import { nextCarouselIndex, directionAfterSettle } from '../carousel';

/**
 * The owner cut the intro carousel from three slides to two on 2026-09-15 and
 * asked for confirmation that the dots, the auto-advance and the reversal all
 * still behave. These are that confirmation.
 *
 * The dots need no test of their own: PagerDots renders `SLIDES.length` of
 * them and interpolates each one off the scroll position, so it is correct for
 * any count by construction. What could break at n=2 is the bounce, because
 * with two slides EVERY slide is an end.
 */

/** Walks the carousel the way the autoplay timer does. */
function run(count: number, steps: number): number[] {
  let index = 0;
  let direction: 1 | -1 = 1;
  const visited = [index];
  for (let i = 0; i < steps; i += 1) {
    const step = nextCarouselIndex(index, direction, count);
    index = step.index;
    direction = step.direction;
    visited.push(index);
  }
  return visited;
}

describe('autoplay with TWO slides', () => {
  it('ping-pongs between the two, never off either end', () => {
    expect(run(2, 6)).toEqual([0, 1, 0, 1, 0, 1, 0]);
  });

  it('never produces an index outside the slide list', () => {
    const visited = run(2, 50);
    expect(Math.min(...visited)).toBe(0);
    expect(Math.max(...visited)).toBe(1);
  });

  it('reverses at the end rather than rewinding to the start', () => {
    // From the last slide, forward, the next move is BACK one -- not a jump to 0.
    expect(nextCarouselIndex(1, 1, 2)).toEqual({ index: 0, direction: -1 });
  });

  it('reverses at the start too', () => {
    expect(nextCarouselIndex(0, -1, 2)).toEqual({ index: 1, direction: 1 });
  });
});

describe('autoplay still behaves at other counts', () => {
  it('three slides bounce 0,1,2,1,0,... as before the cut', () => {
    expect(run(3, 6)).toEqual([0, 1, 2, 1, 0, 1, 2]);
  });

  it('a single slide stays put instead of oscillating', () => {
    expect(run(1, 4)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('direction after a user swipe', () => {
  it('turns back when the user lands on the last of two', () => {
    expect(directionAfterSettle(1, 1, 2)).toBe(-1);
  });

  it('turns forward when the user lands on the first of two', () => {
    expect(directionAfterSettle(0, -1, 2)).toBe(1);
  });

  it('leaves a middle slide alone', () => {
    expect(directionAfterSettle(1, 1, 3)).toBe(1);
    expect(directionAfterSettle(1, -1, 3)).toBe(-1);
  });

  it('agrees with the autoplay rule at both ends', () => {
    // Whatever the user did, the next automatic move must stay in range.
    for (const index of [0, 1]) {
      const direction = directionAfterSettle(index, 1, 2);
      const step = nextCarouselIndex(index, direction, 2);
      expect(step.index).toBeGreaterThanOrEqual(0);
      expect(step.index).toBeLessThan(2);
    }
  });
});
