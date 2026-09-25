/**
 * Turns anything that was thrown into a sentence a person can read.
 *
 * WHY THIS EXISTS. On 2026-09-12 a failed registration put this on screen:
 *
 *   {"status":500,"statusText":"","redirected":false,"url":"https://…/auth/v1/signup"}
 *
 * That is a serialised HTTP Response. It reached the user because the screen
 * rendered `error.message` directly, and because supabase-js, when a response
 * body is not the JSON it expected, sets the message to a stringified copy of
 * the response. The screen was not doing anything unusual — 97 places in the
 * app render an error message the same way. So the fix is not one screen; it
 * is a single function every one of them goes through, which is allowed to
 * decide that a "message" is not fit to show and substitute one that is.
 *
 * THE RULE: if it does not read like a sentence, it does not reach the user.
 * The original is still available to a developer through the console, and on
 * the API side through the error monitor.
 */

/**
 * Messages that are already fine, mapped to better ones anyway because the
 * originals are written for developers.
 *
 * Matched case-insensitively as substrings, first match wins, so order is
 * specificity order. Keep it short: a lookup table that tries to cover every
 * possible backend string becomes its own maintenance problem, and the
 * fallback below is a perfectly good answer for anything not listed.
 */
const KNOWN: readonly (readonly [pattern: string, human: string])[] = [
  // Supabase Auth. The first is the one that broke registration: Supabase
  // returns 500 when its SMTP send fails, and the account is NOT created, so
  // "try again" is genuinely the right advice.
  [
    'error sending confirmation email',
    'We could not send your confirmation email, so your account was not created. This is a problem on our side. Please try again in a few minutes.',
  ],
  ['invalid login credentials', 'That email and password do not match an account.'],
  ['email not confirmed', 'Confirm your email address first. Check your inbox for the code we sent.'],
  ['user already registered', 'There is already an account with that email address. Try logging in instead.'],
  ['already been registered', 'There is already an account with that email address. Try logging in instead.'],
  ['email address is invalid', 'That does not look like a valid email address.'],
  ['token has expired', 'That code has expired. Ask for a new one.'],
  ['invalid or has expired', 'That code is wrong or has expired. Ask for a new one.'],
  ['same password', 'Your new password has to be different from your current one.'],
  ['for security purposes', 'Too many attempts just now. Wait a minute and try again.'],
  ['rate limit', 'Too many attempts just now. Wait a minute and try again.'],

  // ---- Network -----------------------------------------------------------
  //
  // THE MOST COMMON ERROR ANY MOBILE APP PRODUCES, and until 2026-09-14 the
  // one shape this function could not catch. A volunteer on the onboarding
  // identity step was shown, verbatim:
  //
  //   fetch failed: java.net.UnknownHostException: Unable to resolve host
  //   "<project>.supabase.co": No address associated with hostname
  //
  // The screen was doing the right thing -- it goes through humanError like
  // everything else. The table simply had the wrong two strings in it:
  // 'network request failed' is React Native's OLD wording and 'failed to
  // fetch' is the BROWSER's. Android's real message is "fetch failed", the
  // same two words reversed, wrapped around a Java exception class. Neither
  // matched, and the message is short and brace-free so it read as a perfectly
  // good sentence on the way out.
  //
  // These now cover the families rather than two exact strings. Ghana's
  // mobile networks make every one of them a routine event, not an edge case.
  ['unable to resolve host', 'No connection. Check your internet and try again.'],
  ['no address associated', 'No connection. Check your internet and try again.'],
  ['unknownhostexception', 'No connection. Check your internet and try again.'],
  ['network request failed', 'No connection. Check your internet and try again.'],
  ['network is unreachable', 'No connection. Check your internet and try again.'],
  ['failed to fetch', 'No connection. Check your internet and try again.'],
  ['fetch failed', 'No connection. Check your internet and try again.'],
  ['enotfound', 'No connection. Check your internet and try again.'],
  ['econnrefused', 'Cannot reach VHub right now. Try again in a moment.'],
  ['connectexception', 'Cannot reach VHub right now. Try again in a moment.'],
  ['failed to connect', 'Cannot reach VHub right now. Try again in a moment.'],
  ['econnreset', 'The connection dropped. Try again.'],
  ['connection reset', 'The connection dropped. Try again.'],
  ['software caused connection abort', 'The connection dropped. Try again.'],
  ['sockettimeout', 'That took too long. Check your connection and try again.'],
  ['etimedout', 'That took too long. Check your connection and try again.'],
  ['timed out', 'That took too long. Check your connection and try again.'],
  ['timeout', 'That took too long. Check your connection and try again.'],
  ['sslhandshake', 'Could not make a secure connection. Try again.'],
  ['ssl handshake', 'Could not make a secure connection. Try again.'],
  ['certpathvalidator', 'Could not make a secure connection. Try again.'],
  ['aborted', 'That took too long and was stopped. Try again.'],

  // Postgres reaching the client. Both of these mean the same thing to a user
  // and neither should ever be shown verbatim — see CLAUDE.md on the two
  // failure modes, which read differently to us and identically to them.
  ['permission denied for', 'You do not have permission to do that.'],
  ['row-level security', 'You do not have permission to do that.'],
  ['duplicate key value', 'That already exists.'],
  ['violates foreign key', 'Something that was needed is no longer there. Refresh and try again.'],
];

/** Anything matching these is machine output, whatever else it looks like. */
function looksMachineGenerated(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0) return true;
  // A serialised object or array — the exact shape that reached the user.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return true;
  // A bare URL, or a message that is mostly one.
  if (/^https?:\/\//i.test(trimmed)) return true;
  // A stack trace that arrived as a message.
  if (/\n\s*at\s/.test(trimmed)) return true;
  // A JVM or Android exception class name. THIS IS THE BELT-AND-BRACES HALF
  // of the network fix above: the table can only match families somebody has
  // thought of, and a platform that says "java.net.UnknownHostException" today
  // will say "javax.net.ssl.SSLHandshakeException" or something nobody has seen
  // tomorrow. Any message naming a Java class is machine output whatever else
  // it looks like, so an unrecognised one falls back to the caller sentence
  // rather than being printed at a nurse.
  if (/\b(?:java|javax|android|kotlin)\.[a-z0-9_.]*[A-Z][A-Za-z0-9_]*/.test(trimmed)) return true;
  // A bare hostname in quotes -- infrastructure detail, and in this app it is
  // always the Supabase project ref, which is not a user concern.
  if (/"[a-z0-9-]+\.[a-z0-9.-]+\.[a-z]{2,}"/i.test(trimmed)) return true;
  // A bare error code: SCREAMING_SNAKE, or a Postgres SQLSTATE.
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(trimmed)) return true;
  if (/^\d{5}$/.test(trimmed)) return true;
  // Long enough that it is a dump rather than a sentence.
  if (trimmed.length > 300) return true;
  return false;
}

/**
 * Pulls the most useful string out of whatever was thrown.
 *
 * Supabase's own errors sometimes carry the readable part somewhere other than
 * `message` — `error_description` on an OAuth-shaped error, `msg` on a GoTrue
 * body, `details`/`hint` on a PostgREST one — so those are checked before
 * giving up on the object.
 */
function rawMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return '';

  const record = error as Record<string, unknown>;
  for (const key of ['message', 'error_description', 'msg', 'details', 'hint']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0 && !looksMachineGenerated(value)) {
      return value;
    }
  }
  // Nothing readable, but `message` may still match a KNOWN pattern even when
  // it is machine-shaped (a JSON body containing a recognisable phrase).
  return typeof record.message === 'string' ? record.message : '';
}

export interface HumanErrorOptions {
  /**
   * Shown when nothing better can be worked out. Write it for the specific
   * action that failed — "Could not save your profile." beats "Error."
   */
  fallback?: string;
}

/**
 * THE one function every user-visible error string goes through.
 *
 * @param error    whatever was caught or came back from a query/mutation
 * @param fallback what to say when the error has nothing human in it
 */
export function humanError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error === null || error === undefined) return fallback;

  const raw = rawMessage(error);
  const haystack = raw.toLowerCase();

  for (const [pattern, human] of KNOWN) {
    if (haystack.includes(pattern)) return human;
  }

  if (looksMachineGenerated(raw)) {
    // One last thing worth rescuing: a serialised HTTP response carries a
    // status, and a status is enough to say something true about whose fault
    // it is. 5xx is ours, and a person is owed that distinction because it
    // decides whether trying again is worth their time.
    const status = /"status"\s*:\s*(\d{3})/.exec(raw)?.[1];
    if (status && status.startsWith('5')) {
      return 'VHub had a problem at our end. Nothing was saved. Please try again in a few minutes.';
    }
    return fallback;
  }

  return raw.trim();
}

/**
 * `humanError`, but nullish in gives null out.
 *
 * The app has two shapes for showing an error and they need different answers
 * for "there is no error": a `<Text>` that is rendered only when something
 * failed always wants a sentence, while an `errorMessage` variable feeding a
 * conditional wants `null` so nothing renders at all. Folding both into one
 * function would mean every caller of the first kind having to handle a null
 * it can never receive.
 */
export function humanErrorOrNull(error: unknown, fallback?: string): string | null {
  if (error === null || error === undefined) return null;
  return humanError(error, fallback);
}

/*
  The sentences humanError uses for "the network, not the request, failed".
  Listed once here so isConnectivityError reads the same table humanError
  does rather than keeping a second copy of the patterns.
*/
const CONNECTIVITY_SENTENCES: ReadonlySet<string> = new Set([
  'No connection. Check your internet and try again.',
  'Cannot reach VHub right now. Try again in a moment.',
  'The connection dropped. Try again.',
  'That took too long. Check your connection and try again.',
  'That took too long and was stopped. Try again.',
]);

/**
 * True when an error means the phone could not reach the server at all (no
 * signal, DNS failure, dropped or timed-out connection), as opposed to the
 * server answering with a refusal. useAuthGuard uses it to tell "offline at
 * launch" from "sign-in genuinely failed".
 */
export function isConnectivityError(error: unknown): boolean {
  return CONNECTIVITY_SENTENCES.has(humanError(error, ''));
}
