/**
 * The intro carousel's bounce arithmetic, as pure functions.
 *
 * WHY IT LEFT THE COMPONENT (2026-09-15). The carousel reverses at each end
 * (0, 1, 2, 1, 0, 1, ...) rather than rewinding, so every move is exactly one
 * slide wide and can travel at a constant readable speed. That rule lived
 * inline in two callbacks inside `welcome.tsx`, where the only way to check it
 * was to watch the screen for twelve seconds.
 *
 * When the owner cut the carousel from three slides to two and asked whether
 * the dots, the auto-advance and the reversal still behaved, there was no way
 * to answer except by reasoning about it out loud. Now there is: the rule is
 * eight lines with no React in them, and lib/__tests__/carousel.test.ts walks
 * a two-slide carousel through a full cycle.
 *
 * The component keeps the refs and the timer; it just no longer keeps the
 * arithmetic as well.
 */

export interface CarouselStep {
  /** Slide to move to. */
  index: number;
  /** Direction to carry forward: +1 forward, -1 back. */
  direction: 1 | -1;
}

/**
 * The next slide for autoplay, reversing at either end.
 *
 * REQUIRES AT LEAST TWO SLIDES. With one there is nowhere to bounce to and the
 * only honest answer is "stay put", which is what it returns -- autoplay on a
 * single slide should do nothing rather than oscillate against both walls.
 */
export function nextCarouselIndex(current: number, direction: 1 | -1, count: number): CarouselStep {
  if (count <= 1) return { index: 0, direction };

  const candidate = current + direction;
  if (candidate >= count || candidate < 0) {
    const reversed: 1 | -1 = direction === 1 ? -1 : 1;
    return { index: current + reversed, direction: reversed };
  }
  return { index: candidate, direction };
}

/**
 * Which way to travel after the user's own swipe settles.
 *
 * Carries on AWAY from whichever end they landed on, rather than marching them
 * straight back into the wall they just swiped up against. A slide in the
 * middle leaves the direction alone.
 */
export function directionAfterSettle(index: number, direction: 1 | -1, count: number): 1 | -1 {
  if (count <= 1) return direction;
  if (index >= count - 1) return -1;
  if (index <= 0) return 1;
  return direction;
}
