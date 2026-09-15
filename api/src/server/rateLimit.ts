import {
  evaluateRateLimit,
  isWindowExpired,
  type RateLimitRule,
  type RateLimitWindow,
} from "@/lib/rateLimit";
import { Errors } from "./httpErrors";

/**
 * Rate limiting for every serverless route.
 *
 * WHAT THIS PROTECTS AGAINST. Every route in this API is a public URL, and the
 * first thing each one does is verify the caller's token -- which is itself a
 * network call to Supabase Auth, plus a `profiles` read. So a stranger with no
 * account at all can make this project spend Supabase Auth requests and Vercel
 * invocations simply by sending a stream of POSTs with a junk token. On a free
 * tier that is the whole attack: not stolen data, but a quota burned through
 * and an app that stops working for real users. Beyond that, `/api/match`
 * spends Gemini's ~1,500-a-day allowance, `/api/document-url` mints signed
 * links to identity documents, and `/api/vscore` writes reputation data.
 *
 * WHERE IT IS ENFORCED, in three places, each closing a gap the others leave:
 *
 *  - `enforceIpRateLimit` is the FIRST statement of every route handler, ahead
 *    of reading the body. Without that, a flood of malformed bodies would be
 *    rejected by validation before any limiter ran and would never be counted.
 *  - It is called AGAIN inside `authenticate()` and `assertCronSecret()`, which
 *    between them every route already calls. That is the belt-and-braces half:
 *    a route added next month is covered even if whoever adds it forgets the
 *    first line. Calling it twice in one request counts once -- see
 *    `ipDecisionsThisRequest`.
 *  - Endpoints where one request costs real money or touches something
 *    sensitive add a tighter per-user limit after authentication
 *    (`enforceUserRateLimit`).
 *
 * THREE LIMITS, DOING THREE DIFFERENT JOBS:
 *
 *  - `ip` counts every request from one address, before any work is done. It
 *    is set high on purpose (see IP_RULE) because Ghanaian mobile networks put
 *    many real users behind one carrier-grade NAT address, and a limit tight
 *    enough to be interesting would lock out a whole neighbourhood.
 *  - `auth_failure` counts only requests whose token was missing, expired or
 *    junk, again per address. This is the one that actually bites an attacker,
 *    and it can be strict precisely because a signed-in app almost never fails
 *    authentication -- the mobile client refreshes its session before calling.
 *  - the per-user rules count a signed-in caller's requests to one endpoint.
 *    These bound what a compromised or misbehaving account can spend.
 *
 * ---------------------------------------------------------------------------
 * THE HONEST LIMITATION, WHICH MUST NOT BE FORGOTTEN: THE COUNTERS ARE
 * IN-MEMORY AND THEREFORE PER-INSTANCE.
 *
 * Vercel runs these routes as serverless functions. A warm instance serves
 * many requests and keeps this module's Map between them, so a sustained flood
 * from one source is throttled. But instances are created and destroyed
 * freely, and under load Vercel runs several at once -- so an attacker spread
 * across instances gets a multiple of these limits, and a cold start begins
 * with an empty Map. This is a real mitigation, not a guarantee.
 *
 * The durable version is a small Postgres table plus one atomic RPC, so every
 * instance counts against the same row. That is a schema change, which
 * CLAUDE.md gates behind the owner's approval, so it is deliberately not done
 * here. When it is approved, the only thing that changes is `hit()` below --
 * the rules, the placement and the pure arithmetic in `lib/rateLimit.ts` all
 * stay exactly as they are.
 * ---------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/**
 * Per IP address, across every route.
 *
 * 120 a minute is deliberately loose. A single real user of the mobile app
 * makes a handful of calls a minute at most -- nearly all data reads go
 * straight to Supabase under RLS and never touch this API -- but dozens of
 * real users can share one carrier NAT address, so the limit has to leave room
 * for all of them. It is set to stop a flood (thousands a minute), not to
 * shape normal traffic. The strict work is done by AUTH_FAILURE_RULE.
 */
const IP_RULE: RateLimitRule = { limit: 120, windowMs: 60_000 };

/**
 * Per IP address, counting ONLY requests that failed authentication.
 *
 * A working client does not fail authentication: it holds a live session and
 * refreshes it before calling. So repeated failures from one address mean
 * either a probe or a badly broken client, and twenty a minute is generous for
 * both. This is the limit that makes a token-less flood cheap to refuse -- it
 * bites after twenty requests instead of a hundred and twenty, and it cannot
 * inconvenience a signed-in user because they never enter this counter.
 *
 * `pingApi()` in the mobile client deliberately makes ONE unauthenticated call
 * to /api/match to prove the deployment is reachable, and so lands here. Once
 * per app start against a limit of twenty is not a problem, and the client
 * treats a 429 as "reachable" for exactly this reason.
 */
const AUTH_FAILURE_RULE: RateLimitRule = { limit: 20, windowMs: 60_000 };

/**
 * Per signed-in user, per endpoint. `default` applies to every route that does
 * not name its own; the named ones are the endpoints where a single request
 * costs real money or touches something sensitive.
 *
 * All windows are one minute. A memory-backed counter cannot honestly enforce
 * a daily quota -- the instance holding it will not live a day -- so this
 * module does not pretend to offer one. Daily caps belong with the durable
 * store described above.
 */
export type UserRateLimitBucket =
  | "default"
  | "match"
  | "document_url"
  | "upload_signature"
  | "vscore"
  | "skill_suggest"
  | "account_closure";

const USER_RULES: Readonly<Record<UserRateLimitBucket, RateLimitRule>> = {
  /** Ordinary endpoints. Generous: a person tapping through screens cannot reach it. */
  default: { limit: 60, windowMs: 60_000 },
  /** Every call may spend Gemini quota, which is ~1,500 a DAY across all users. */
  match: { limit: 20, windowMs: 60_000 },
  /** Each call mints a signed link to somebody's identity document. */
  document_url: { limit: 20, windowMs: 60_000 },
  /** Each call authorises an upload to Cloudinary, whose free tier is also finite. */
  upload_signature: { limit: 20, windowMs: 60_000 },
  /** Writes reputation data and replays a volunteer's whole score history. */
  vscore: { limit: 30, windowMs: 60_000 },
  /**
   * Also spends Gemini quota, and the legitimate pattern is one call per
   * outreach created and one per volunteer onboarding -- never per keystroke
   * or per view. Tighter than `match` because nothing about this is automatic:
   * every call is somebody pressing a button.
   */
  skill_suggest: { limit: 10, windowMs: 60_000 },
  /** Irreversible, and done once in an account's lifetime. A retry or two, no more. */
  account_closure: { limit: 5, windowMs: 60_000 },
};

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/**
 * Module scope, so it survives between requests on a warm instance. Keys are
 * `<rule>:<identity>` -- the rule name is part of the key so the IP counter and
 * the auth-failure counter for one address never collide.
 */
const windows = new Map<string, RateLimitWindow>();

/**
 * Above this many live keys, expired entries are swept before the next write.
 * Without it a long-lived instance seeing many distinct addresses would hold a
 * key for every one of them forever. The number is arbitrary but small enough
 * that the map stays trivial next to a Node process, and the sweep is O(n) over
 * a map this size, run rarely.
 */
const SWEEP_THRESHOLD = 5_000;

function sweepIfLarge(now: number, rule: RateLimitRule): void {
  if (windows.size < SWEEP_THRESHOLD) return;
  for (const [key, window] of windows) {
    if (isWindowExpired(window, rule, now)) windows.delete(key);
  }
}

/** Counts one request against a key and returns the decision. */
function hit(key: string, rule: RateLimitRule): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  sweepIfLarge(now, rule);
  const decision = evaluateRateLimit(windows.get(key), rule, now);
  windows.set(key, decision.window);
  return { allowed: decision.allowed, retryAfterSeconds: decision.retryAfterSeconds };
}

// ---------------------------------------------------------------------------
// Identifying the caller
// ---------------------------------------------------------------------------

/**
 * The caller's IP address, as reported by Vercel's proxy.
 *
 * `x-vercel-forwarded-for` is read FIRST and it matters that it is: Vercel sets
 * that header itself and overwrites anything the client sent, whereas
 * `x-forwarded-for` can carry client-supplied entries. Preferring the
 * spoofable header would let an attacker rotate a fake address and skip the
 * limit entirely.
 *
 * When no header identifies the caller at all -- local development, or a proxy
 * layout this code does not know about -- everything falls into one shared
 * "unknown" bucket. That is the safe direction to fail: unidentified traffic is
 * limited together rather than waved through individually.
 */
export function clientIp(req: Request): string {
  const vercel = req.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercel) return vercel.split(",")[0]!.trim();

  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = req.headers.get("x-forwarded-for")?.trim();
  if (forwarded) return forwarded.split(",")[0]!.trim();

  return "unknown";
}

// ---------------------------------------------------------------------------
// The three things routes (and auth.ts) call
// ---------------------------------------------------------------------------

/**
 * One decision per Request object, so calling `enforceIpRateLimit` twice in
 * the same request counts once.
 *
 * This matters because the call is made in TWO places on purpose: as the first
 * statement of every route handler, so a request with a malformed body is
 * limited even though it never reaches authentication; and inside
 * `authenticate()`, so a route added later is covered even if whoever adds it
 * forgets the first line. Without this map those two calls would each consume
 * an allowance and the effective limit would silently be half the number
 * written above. A WeakMap keyed on the Request means the entry disappears
 * with the request itself and nothing has to clean it up.
 */
const ipDecisionsThisRequest = new WeakMap<Request, { allowed: boolean; retryAfterSeconds: number }>();

/**
 * Counts this request against the caller's address and refuses if the address
 * is flooding. Called first in every route handler and again at the top of
 * `authenticate()` / `assertCronSecret()` -- before any network call is made on
 * the caller's behalf, and before the body is even parsed.
 */
export function enforceIpRateLimit(req: Request): void {
  let decision = ipDecisionsThisRequest.get(req);
  if (!decision) {
    decision = hit(`ip:${clientIp(req)}`, IP_RULE);
    ipDecisionsThisRequest.set(req, decision);
  }
  if (!decision.allowed) {
    throw Errors.tooManyRequests(
      "Too many requests from this connection. Please wait a moment and try again.",
      decision.retryAfterSeconds
    );
  }
}

/**
 * Counts a FAILED authentication against the caller's address, and refuses
 * further requests once there have been too many.
 *
 * Called from `authenticate()` on every path that throws. It deliberately
 * throws a 429 rather than the original 401 once the limit is passed: a caller
 * who has sent twenty bad tokens in a minute is not going to be helped by a
 * twenty-first explanation of what a valid token looks like.
 */
export function enforceAuthFailureRateLimit(req: Request): void {
  const { allowed, retryAfterSeconds } = hit(`auth_failure:${clientIp(req)}`, AUTH_FAILURE_RULE);
  if (!allowed) {
    throw Errors.tooManyRequests(
      "Too many failed sign-in attempts from this connection. Please wait a moment and try again.",
      retryAfterSeconds
    );
  }
}

/**
 * Counts a signed-in caller's request to one endpoint.
 *
 * `authenticate()` applies the `default` bucket to everybody automatically; a
 * route that needs something tighter calls this again with its own bucket
 * immediately after authenticating. Both then apply, and the tighter one bites
 * first, which is the intended behaviour -- the default is a backstop, not an
 * allowance the specific rule replaces.
 */
export function enforceUserRateLimit(userId: string, bucket: UserRateLimitBucket): void {
  const { allowed, retryAfterSeconds } = hit(`user:${bucket}:${userId}`, USER_RULES[bucket]);
  if (!allowed) {
    throw Errors.tooManyRequests(
      "You are doing that too often. Please wait a moment and try again.",
      retryAfterSeconds
    );
  }
}
