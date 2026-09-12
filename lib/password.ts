/**
 * THE password rule, in one place, for every screen that sets one.
 *
 * WHY IT MOVED HERE (2026-09-12). `MIN_PASSWORD_LENGTH` lived in
 * hooks/useAccountSecurity.ts under a comment calling it "the password rule
 * shared by this screen and the sign-up form". It was not shared: registration
 * had its own inline `password.length < 6`, checked only on submit, with no
 * feedback of any kind while typing. So the app enforced 8 characters when you
 * CHANGED your password and 6 when you first CHOSE one, which is the wrong way
 * round — and a comment claiming otherwise is worse than no comment, because
 * it stops the next person looking.
 *
 * Pure, so it can be unit-tested without a React tree, and imported by both
 * screens rather than re-derived by either.
 *
 * THE ENFORCED RULE, deliberately short:
 *
 *   - at least 8 characters
 *   - at least one letter
 *   - at least one number
 *
 * Nothing else is enforced. Symbols, mixed case and length beyond 8 all raise
 * the strength reading and none of them block, because rules that demand a
 * symbol reliably produce "Password1!" — a password that satisfies every box
 * and is among the first a real attacker tries. Length is what actually helps,
 * so the meter rewards it and the requirements do not mandate it.
 */

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordRule {
  /** Stable key for React lists and tests. */
  id: 'length' | 'letter' | 'number';
  /** Shown beside a tick or a circle as the person types. */
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: (value) => value.length >= MIN_PASSWORD_LENGTH,
  },
  { id: 'letter', label: 'At least one letter', test: (value) => /[A-Za-z]/.test(value) },
  { id: 'number', label: 'At least one number', test: (value) => /\d/.test(value) },
];

/** Which rules a value currently satisfies. Drives the live checklist. */
export function checkPasswordRules(value: string): Record<PasswordRule['id'], boolean> {
  return {
    length: PASSWORD_RULES[0]!.test(value),
    letter: PASSWORD_RULES[1]!.test(value),
    number: PASSWORD_RULES[2]!.test(value),
  };
}

/**
 * One sentence naming what is still wrong, or null when the value passes.
 *
 * Names the FIRST unmet rule rather than listing all of them: the checklist
 * beside the field already shows every rule and its state, so an error message
 * repeating the whole set is noise at the moment someone is trying to submit.
 */
export function describePasswordProblem(value: string): string | null {
  if (!value) return 'Choose a password.';
  const failed = PASSWORD_RULES.find((rule) => !rule.test(value));
  if (!failed) return null;
  switch (failed.id) {
    case 'length':
      return `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
    case 'letter':
      return 'Your password needs at least one letter.';
    case 'number':
      return 'Your password needs at least one number.';
  }
}

export type PasswordStrength = 'weak' | 'fair' | 'strong';

/**
 * Cheap, local strength read for the meter.
 *
 * NOT a security control and not the gate — `describePasswordProblem` is the
 * gate. This exists to tell somebody who has cleared the bar that they could
 * do better, which is a different job from refusing them.
 */
export function passwordStrength(value: string): PasswordStrength {
  if (value.length < MIN_PASSWORD_LENGTH) return 'weak';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  if (value.length >= 12 && classes >= 3) return 'strong';
  if (classes >= 2) return 'fair';
  return 'weak';
}
