import { after } from "next/server";
import {
  decideAlert,
  errorFingerprint,
  formatErrorLog,
  isAlertable,
  type AlertWindow,
} from "../../../lib/errorMonitor";
import { env } from "./env";
import { sendMail } from "./mailer";

/**
 * The stateful half of error monitoring: the counters, the log line and the
 * alert email.
 *
 * IT HANGS OFF `errorResponse()` AND NOTHING ELSE. Every route handler in this
 * project already ends its catch block with `return errorResponse(err, req)`, so
 * that one function is the complete set of places a failure becomes a response.
 * Wiring here rather than into twenty route files means a route added next
 * month is monitored without anybody remembering to add anything — the same
 * argument that put the rate limiter inside `authenticate()`.
 *
 * IT SHIPS INERT. With no `ALERT_EMAIL` set, nothing is sent and the only
 * change is that the log line becomes structured. Turning alerting on is one
 * environment variable in the Vercel dashboard, with no deploy — which is
 * deliberate, because whether an inbox should receive this is not a decision
 * that belongs in the repository.
 *
 * THE COUNTERS ARE IN MEMORY, SO THEY ARE PER SERVERLESS INSTANCE. This is the
 * same limitation `server/rateLimit.ts` documents and accepts, and it fails in
 * the same direction: several warm instances mean a widespread fault can send
 * one alert per instance rather than one in total. That is noisier than
 * intended and never quieter, which is the right way round for something whose
 * job is to tell you about a fault. The durable version is a Postgres table,
 * which is a gated schema change and deliberately not taken.
 */

/**
 * Bounded so a pathological run of distinct faults cannot grow this without
 * limit on a long-lived instance. Oldest entry evicted first; an evicted
 * fingerprint simply alerts again, which is the safe direction.
 */
const MAX_TRACKED_FINGERPRINTS = 500;
const windows = new Map<string, AlertWindow>();

/** How long the alert send is given before the request gives up waiting on it. */
const ALERT_SEND_TIMEOUT_MS = 5000;

/**
 * The signed-in caller of a request, remembered so a failure later in the same
 * handler can name them in the log.
 *
 * A WeakMap keyed on the Request, the same arrangement `server/rateLimit.ts`
 * already uses and for the same reason: the entry disappears with the request
 * and nothing has to clean it up. The alternative was threading a user id
 * through every `errorResponse()` call, which would mean every catch block had
 * to be inside the scope where the caller is known — and the ones that matter
 * most are the ones that failed BEFORE it was.
 */
const callers = new WeakMap<Request, string>();

/** Called by `authenticate()` once a request is known to belong to somebody. */
export function rememberCaller(req: Request, userId: string): void {
  callers.set(req, userId);
}

/** The signed-in caller of this request, if authentication got that far. */
export function callerOf(req: Request): string | undefined {
  return callers.get(req);
}

export interface ObservedError {
  /** The request path, e.g. "/api/match". Grouping is per route. */
  route: string;
  status: number;
  code: string;
  message: string;
  /** Only when the request was authenticated. */
  userId?: string;
}

/**
 * Records one failed request: always a log line, sometimes an email.
 *
 * NEVER THROWS. It is called from inside the function that turns errors into
 * responses, so an error here would replace a clean 500 with a crash — an
 * observability tool taking down the thing it observes.
 */
export function observeError(observed: ObservedError): void {
  try {
    const fingerprint = errorFingerprint(observed.route, observed.code, observed.message);

    // The user id goes in the SERVER LOG and never in the email. The log stays
    // inside Vercel, which the owner already controls; the email leaves for a
    // third-party mailbox. An opaque uuid is not much, but "not much" is not a
    // reason to send it somewhere it does not need to go, and the id is only
    // useful next to the database it resolves against anyway.
    console.error(
      formatErrorLog({
        route: observed.route,
        status: observed.status,
        code: observed.code,
        message: observed.message,
        fingerprint,
        ...(observed.userId ? { userId: observed.userId } : {}),
      })
    );

    if (!isAlertable(observed.status)) return;

    const alertTo = env.alertEmail;
    if (!alertTo) return;

    const decision = decideAlert(windows.get(fingerprint), Date.now());
    windows.set(fingerprint, decision.window);
    evictOldest();

    if (!decision.send) return;

    const body = [
      `An endpoint failed and returned ${observed.status}.`,
      "",
      `Route:    ${observed.route}`,
      `Code:     ${observed.code}`,
      `Message:  ${observed.message}`,
      decision.alsoReporting > 0
        ? `Also:     ${decision.alsoReporting} more of the same since the last alert.`
        : null,
      "",
      "Nothing else about the request is included here on purpose: no request",
      "body, no identifiers. The matching server log line carries the rest.",
      "",
      "No more alerts about this particular failure will be sent for the next",
      "15 minutes; the count above says how many were quietly absorbed.",
    ]
      .filter((line) => line !== null)
      .join("\n");

    const send = withTimeout(
      sendMail({
        to: alertTo,
        subject: `V-HUB API error: ${observed.route} (${observed.status})`,
        text: body,
      }),
      ALERT_SEND_TIMEOUT_MS
    ).catch((err) => {
      // Deliberately a plain log and nothing more. An alert that cannot be
      // delivered must not itself become an alert, or a mail outage becomes a
      // loop of failures about failing to report failures.
      console.error(
        "[api-error] alert could not be sent:",
        err instanceof Error ? err.message : err
      );
    });

    scheduleAfterResponse(send);
  } catch (err) {
    console.error(
      "[api-error] monitoring failed:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Runs the send AFTER the response has gone out, so a failing request is not
 * also a slow one.
 *
 * `after()` is what keeps the serverless function alive for it. A floating
 * promise would not: Vercel may freeze the instance the moment a response is
 * returned, and the email would be sent on some later request or not at all.
 *
 * The fallback covers being called outside a request scope — a cron pass, a
 * test — where `after()` throws. There the promise is simply already running
 * and is left to finish; it has its own catch, so an unhandled rejection is not
 * possible either way.
 */
function scheduleAfterResponse(work: Promise<unknown>): void {
  try {
    after(work);
  } catch {
    void work;
  }
}

/**
 * Caps how long the alert send may take.
 *
 * The timer is CLEARED once the race settles. Leaving it pending would keep a
 * five-second handle alive after a send that already succeeded, which on a
 * serverless instance is five seconds of billed time doing nothing.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`alert send timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

function evictOldest(): void {
  while (windows.size > MAX_TRACKED_FINGERPRINTS) {
    // Map iterates in insertion order, so the first key is the oldest.
    const oldest = windows.keys().next();
    if (oldest.done) return;
    windows.delete(oldest.value);
  }
}

/** Test seam: forget everything remembered. Never called by the app. */
export function resetErrorMonitor(): void {
  windows.clear();
}
