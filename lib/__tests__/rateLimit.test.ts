import { evaluateRateLimit, isWindowExpired, type RateLimitRule, type RateLimitWindow } from '@/lib/rateLimit';

const RULE: RateLimitRule = { limit: 3, windowMs: 60_000 };
const T0 = 1_700_000_000_000;

describe('evaluateRateLimit', () => {
  it('opens a window on the first request and allows it', () => {
    const decision = evaluateRateLimit(undefined, RULE, T0);
    expect(decision.allowed).toBe(true);
    expect(decision.window).toEqual({ startedAt: T0, count: 1 });
    expect(decision.remaining).toBe(2);
    expect(decision.retryAfterSeconds).toBe(0);
  });

  it('allows exactly `limit` requests inside one window', () => {
    let window: RateLimitWindow | undefined;
    const outcomes: boolean[] = [];
    for (let i = 0; i < 4; i += 1) {
      const decision = evaluateRateLimit(window, RULE, T0 + i * 1_000);
      outcomes.push(decision.allowed);
      window = decision.window;
    }
    expect(outcomes).toEqual([true, true, true, false]);
  });

  it('reports remaining counting down to zero, and zero once refused', () => {
    const first = evaluateRateLimit(undefined, RULE, T0);
    const second = evaluateRateLimit(first.window, RULE, T0);
    const third = evaluateRateLimit(second.window, RULE, T0);
    const fourth = evaluateRateLimit(third.window, RULE, T0);
    expect([first.remaining, second.remaining, third.remaining, fourth.remaining]).toEqual([2, 1, 0, 0]);
  });

  it('counts a refused request, so hammering holds the window open', () => {
    // Three allowed, then two refusals. The window must NOT reset early just
    // because the caller kept pushing -- the refusals are counted too.
    let window: RateLimitWindow | undefined;
    for (let i = 0; i < 5; i += 1) {
      window = evaluateRateLimit(window, RULE, T0).window;
    }
    expect(window).toEqual({ startedAt: T0, count: 5 });
  });

  it('resets once the window has fully elapsed', () => {
    const exhausted: RateLimitWindow = { startedAt: T0, count: 9 };
    const decision = evaluateRateLimit(exhausted, RULE, T0 + RULE.windowMs);
    expect(decision.allowed).toBe(true);
    expect(decision.window).toEqual({ startedAt: T0 + RULE.windowMs, count: 1 });
  });

  it('does not reset one millisecond early', () => {
    const exhausted: RateLimitWindow = { startedAt: T0, count: 9 };
    const decision = evaluateRateLimit(exhausted, RULE, T0 + RULE.windowMs - 1);
    expect(decision.allowed).toBe(false);
    expect(decision.window.startedAt).toBe(T0);
  });

  it('rounds Retry-After up, so it never points back inside the closed window', () => {
    const exhausted: RateLimitWindow = { startedAt: T0, count: 9 };
    // 1500ms left -> 2 seconds, not 1.
    const decision = evaluateRateLimit(exhausted, RULE, T0 + RULE.windowMs - 1_500);
    expect(decision.retryAfterSeconds).toBe(2);
  });

  it('never returns Retry-After: 0 on a refusal', () => {
    const exhausted: RateLimitWindow = { startedAt: T0, count: 9 };
    const decision = evaluateRateLimit(exhausted, RULE, T0 + RULE.windowMs - 1);
    expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('treats a limit of 1 as one request per window', () => {
    const rule: RateLimitRule = { limit: 1, windowMs: 1_000 };
    const first = evaluateRateLimit(undefined, rule, T0);
    const second = evaluateRateLimit(first.window, rule, T0 + 500);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
  });
});

describe('isWindowExpired', () => {
  it('is false inside the window and true once it has elapsed', () => {
    const window: RateLimitWindow = { startedAt: T0, count: 1 };
    expect(isWindowExpired(window, RULE, T0 + RULE.windowMs - 1)).toBe(false);
    expect(isWindowExpired(window, RULE, T0 + RULE.windowMs)).toBe(true);
  });

  it('agrees with evaluateRateLimit about when a window resets', () => {
    const window: RateLimitWindow = { startedAt: T0, count: 99 };
    const boundary = T0 + RULE.windowMs;
    expect(isWindowExpired(window, RULE, boundary)).toBe(true);
    expect(evaluateRateLimit(window, RULE, boundary).window.startedAt).toBe(boundary);
  });
});
