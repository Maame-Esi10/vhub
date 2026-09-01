/**
 * The pure arithmetic behind the serverless API's rate limiting.
 *
 * This module holds no state, reads no clock and touches no network: it takes
 * the window a caller is currently inside, the rule being applied and the
 * current time, and returns the decision plus the window to store back. The
 * state itself lives in `api/src/server/rateLimit.ts`, which is the only
 * thing that keeps counters and the only thing that throws.
 *
 * The split is the same one `lib/roster.ts`, `lib/underSubscription.ts` and
 * `lib/dayCoverage.ts` already follow — the rule is pure and unit-tested here,
 * the I/O lives in `api/src/server/`. Window arithmetic is exactly the kind of
 * code that is wrong by one and looks right, so it is worth testing directly
 * rather than only through a running endpoint.
 *
 * FIXED WINDOWS, NOT SLIDING. A window opens on the first request and lasts
 * `windowMs`; the counter resets when the next request arrives after it has
 * expired. The known property of a fixed window is a boundary burst: a caller
 * who spends their whole allowance in the last second of one window and again
 * in the first second of the next has made 2 × limit requests in barely over a
 * second. That is accepted deliberately. The limits here exist to stop a flood
 * that lasts minutes — an attacker holding a rate open, or a looping client —
 * and a doubled burst across one boundary still lands inside the same order of
 * magnitude. A sliding window would need the previous window's count kept and
 * weighted, which is more state and more ways to be wrong, for a difference
 * this application cannot feel.
 */

/** How many requests are allowed, and over how long. */
export interface RateLimitRule {
  /** Requests permitted within one window. Must be at least 1. */
  readonly limit: number;
  /** The window's length in milliseconds. */
  readonly windowMs: number;
}

/** One caller's counter for one rule. Stored by the caller of this module. */
export interface RateLimitWindow {
  /** Epoch milliseconds at which this window opened. */
  readonly startedAt: number;
  /** Requests counted inside it, including the one being decided. */
  readonly count: number;
}

export interface RateLimitDecision {
  /** False when this request takes the caller past the limit. */
  readonly allowed: boolean;
  /** The window to store back against this key — always write it, allowed or not. */
  readonly window: RateLimitWindow;
  /** Requests still available in this window after this one. Zero when refused. */
  readonly remaining: number;
  /**
   * Whole seconds until the window resets, for the `Retry-After` header.
   * Always at least 1 when refused, because `Retry-After: 0` invites an
   * immediate retry that would be refused again.
   */
  readonly retryAfterSeconds: number;
}

/**
 * Counts one request against a rule and says whether it may proceed.
 *
 * A REFUSED REQUEST STILL COUNTS. That is deliberate: if refusals did not
 * increment, a caller hammering the endpoint would sit at exactly the limit
 * forever and the window would expire on schedule, which rewards the flood by
 * letting it through in a steady trickle. Counting refusals means a caller who
 * keeps hammering keeps their window open — the pressure they apply is the
 * thing that holds the door shut.
 *
 * @param existing the window stored for this key, or undefined if there is none
 * @param rule     the limit being applied
 * @param now      epoch milliseconds
 */
export function evaluateRateLimit(
  existing: RateLimitWindow | undefined,
  rule: RateLimitRule,
  now: number
): RateLimitDecision {
  const expired = existing === undefined || now - existing.startedAt >= rule.windowMs;
  const window: RateLimitWindow = expired
    ? { startedAt: now, count: 1 }
    : { startedAt: existing.startedAt, count: existing.count + 1 };

  const allowed = window.count <= rule.limit;
  const elapsed = now - window.startedAt;
  const msRemaining = Math.max(rule.windowMs - elapsed, 0);

  return {
    allowed,
    window,
    remaining: allowed ? rule.limit - window.count : 0,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(msRemaining / 1000)),
  };
}

/**
 * True when a stored window is old enough to carry no information.
 *
 * Only used to prune the in-memory store: a key nobody has touched for a whole
 * window is indistinguishable from a key that was never there, so dropping it
 * changes no decision and keeps the map from growing without bound on a
 * long-lived instance.
 */
export function isWindowExpired(window: RateLimitWindow, rule: RateLimitRule, now: number): boolean {
  return now - window.startedAt >= rule.windowMs;
}
