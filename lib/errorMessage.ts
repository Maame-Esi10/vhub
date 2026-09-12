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
    'We could not send your confirmation email, so your account was not created. This is a problem on our side — please try again in a few minutes.',
  ],
  ['invalid login credentials', 'That email and password do not match an account.'],
  ['email not confirmed', 'Confirm your email address first — check your inbox for the link we sent.'],
  ['user already registered', 'There is already an account with that email address. Try logging in instead.'],
  ['already been registered', 'There is already an account with that email address. Try logging in instead.'],
  ['email address is invalid', 'That does not look like a valid email address.'],
  ['token has expired', 'That code has expired. Ask for a new one.'],
  ['invalid or has expired', 'That code is wrong or has expired. Ask for a new one.'],
  ['same password', 'Your new password has to be different from your current one.'],
  ['for security purposes', 'Too many attempts just now. Wait a minute and try again.'],
  ['rate limit', 'Too many attempts just now. Wait a minute and try again.'],

  // Network. React Native's wording, which means nothing to a volunteer.
  ['network request failed', 'Cannot reach V-HUB. Check your connection and try again.'],
  ['failed to fetch', 'Cannot reach V-HUB. Check your connection and try again.'],
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
      return 'V-HUB had a problem at our end. Nothing was saved — please try again in a few minutes.';
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
