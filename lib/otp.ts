/**
 * The one-time codes VHub emails: signup confirmation and password recovery.
 *
 * WHY THE LENGTH IS A RANGE AND NOT SIX (owner, 2026-09-21: "why did you
 * restrict the otp input to 6 when the actual digits in the mail is more?").
 *
 * Both screens hard-coded `CODE_LENGTH = 6`, and used it three ways at once:
 * the input's `maxLength`, a `.slice(0, 6)` on every keystroke, and the test
 * that enables the submit button. So when the emailed code was longer than
 * six digits the screen did not merely look wrong, it was IMPOSSIBLE TO USE:
 * the extra digits could not be typed at all, and the code that could be typed
 * was a truncated prefix that the server would always reject. Confirming an
 * account and resetting a password were both dead ends.
 *
 * THE LENGTH IS NOT OURS TO DECIDE. It is a Supabase Auth setting, it can be
 * changed in the dashboard without anybody touching this repository, and a
 * constant here that disagrees with it silently breaks both flows. Supabase
 * permits six to ten digits, so that is the range accepted; the SERVER remains
 * the only authority on whether a given code is correct, which it always was.
 *
 * The screens therefore accept anything in the range, enable the button at the
 * minimum, and let `verifyOtp` reject a wrong code the way it rejects every
 * other wrong code. A client that guesses the length can only ever refuse a
 * valid one.
 */

/** Supabase's shortest permitted email OTP, and its default. */
export const OTP_MIN_LENGTH = 6;

/** Supabase's longest permitted email OTP. */
export const OTP_MAX_LENGTH = 10;

/**
 * Digits only, capped at the longest code Supabase can issue.
 *
 * Pasting from a mail client routinely brings whitespace with it, and on
 * Android the code is often inserted with a trailing space by the keyboard's
 * own autofill, so stripping non-digits is what makes paste work at all.
 */
export function sanitiseOtp(input: string): string {
  return input.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH);
}

/** Whether this is long enough to be worth sending. */
export function isPlausibleOtp(code: string): boolean {
  const digits = code.trim();
  return digits.length >= OTP_MIN_LENGTH && digits.length <= OTP_MAX_LENGTH;
}

/**
 * How the code is described to the person reading the screen.
 *
 * Deliberately does NOT name a number. It used to say "6-digit", which was a
 * claim the app had no way to keep: the length lives in a Supabase setting.
 * Naming a length that disagrees with the email is worse than naming none,
 * because it tells somebody holding a correct code that they have the wrong
 * one.
 */
export const OTP_DESCRIPTION = 'code';
