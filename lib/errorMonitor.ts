/**
 * The pure rule behind the serverless API's error alerting.
 *
 * WHAT IT IS FOR. Every route in `api/` funnels its failures through one
 * function, `errorResponse()`, and until now that function's only reaction to
 * an unexpected error was a single `console.error` line. On Vercel's Hobby plan
 * runtime logs are a live tail with roughly an hour of retention and no alerts
 * on them, so an endpoint that started failing at two in the morning left no
 * trace by breakfast. The way anybody found out was a volunteer saying the app
 * did not work.
 *
 * The state lives in `api/src/server/errorMonitor.ts`, which is the only thing
 * that keeps counters, reads the clock or sends anything. The split, and the
 * reasons for it, are the same as `lib/rateLimit.ts`: grouping and throttling
 * arithmetic is exactly the kind of code that is wrong by one and looks right.
 */

/**
 * How long one kind of failure stays quiet after it has been reported once.
 *
 * Fifteen minutes. An endpoint that is broken is usually broken for every
 * request, so without a throttle a bad deploy would send one email per request
 * — hundreds of identical messages, straight past a Gmail sending limit shared
 * with the app's real mail, drowning the very notification they were meant to
 * be. The suppressed count travels with the next alert, so nothing is hidden:
 * the message says how many more of the same arrived while it was quiet.
 */
export const ERROR_ALERT_THROTTLE_MS = 15 * 60 * 1000;

/**
 * Only 5xx alerts, and this is the decision that keeps the alerting useful.
 *
 * A 400, 401, 403, 404, 409 or 429 is the API WORKING: refusing a malformed
 * body, an expired token, somebody else's document, a flood. Alerting on those
 * would produce a steady trickle of mail about normal operation, and the one
 * message that mattered would arrive in the middle of it and be ignored. A 5xx
 * is the only class that means "this failed and it was our fault".
 */
export function isAlertable(status: number): boolean {
  return status >= 500;
}

/**
 * A stable key for "the same failure", so repeats of one fault group together.
 *
 * The volatile parts of a message are replaced before hashing, because they are
 * what makes two instances of one bug look like two bugs. A row id, a
 * timestamp, a port number, a quoted value: all differ per request while the
 * fault behind them is identical. Without this, throttling would never engage —
 * every message would be its own kind, and a broken endpoint would still send
 * one email per request, which is the failure mode the throttle exists to stop.
 *
 * Deliberately NOT a hash. A readable fingerprint is what somebody reading a
 * log line or an inbox actually wants, and there is no reason to make it
 * opaque.
 */
export function errorFingerprint(route: string, code: string, message: string): string {
  const normalised = message
    // UUIDs first: they would otherwise be partly eaten by the digit rule.
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    // Anything quoted is nearly always the specific value that failed.
    .replace(/"[^"]*"/g, '"<value>"')
    .replace(/'[^']*'/g, "'<value>'")
    // Bare numbers, including decimals and negatives.
    .replace(/-?\d+(\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  return `${route}|${code}|${normalised}`;
}

/** What is remembered about one fingerprint between requests. */
export interface AlertWindow {
  /** Epoch ms of the last alert actually sent for this fingerprint. */
  readonly lastAlertedAt: number;
  /** Occurrences since that alert, not counting the one that produced it. */
  readonly suppressed: number;
}

export interface AlertDecision {
  /** True when this occurrence should produce a notification. */
  readonly send: boolean;
  /** The window to store back — always write it, sent or not. */
  readonly window: AlertWindow;
  /**
   * How many earlier occurrences this alert is also reporting. Zero on a first
   * alert; the count of everything the throttle swallowed on a later one.
   */
  readonly alsoReporting: number;
}

/**
 * Decides whether this occurrence is reported, and folds the suppressed count
 * into the alert that finally goes out.
 *
 * A FIRST occurrence always alerts — the point of the tool is to hear about a
 * new fault immediately, not after a window has elapsed.
 */
export function decideAlert(
  previous: AlertWindow | undefined,
  now: number,
  throttleMs: number = ERROR_ALERT_THROTTLE_MS
): AlertDecision {
  if (!previous) {
    return { send: true, window: { lastAlertedAt: now, suppressed: 0 }, alsoReporting: 0 };
  }

  if (now - previous.lastAlertedAt >= throttleMs) {
    return {
      send: true,
      window: { lastAlertedAt: now, suppressed: 0 },
      alsoReporting: previous.suppressed,
    };
  }

  return {
    send: false,
    window: { lastAlertedAt: previous.lastAlertedAt, suppressed: previous.suppressed + 1 },
    alsoReporting: 0,
  };
}

/** The fields a log line carries. Kept flat so one line is one greppable record. */
export interface ErrorLogFields {
  readonly route: string;
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly fingerprint: string;
  /** Present only when the request was authenticated. Never leaves the server log. */
  readonly userId?: string;
}

/**
 * One line, one failure, machine-readable.
 *
 * JSON rather than prose so the live tail can be filtered on a field instead of
 * read. The previous `[api] unhandled error: TypeError: ...` could only be
 * grepped for a substring, which meant "how many times has this happened
 * today?" had no answer.
 */
export function formatErrorLog(fields: ErrorLogFields): string {
  return `[api-error] ${JSON.stringify(fields)}`;
}
