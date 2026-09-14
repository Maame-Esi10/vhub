import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Locks the rule that lets a code-entry screen hold a session without being
 * thrown out of it.
 *
 * THE INVARIANT. `AUTH_ENTRY_SCREENS` is the set of (auth) screens the guard
 * bounces a signed-in user AWAY from — welcome, login, register — because
 * somebody with a session has no business on them. Every other screen in
 * (auth) is allowed to hold a session.
 *
 * Two flows depend on being in that second group, and both are invisible
 * dependencies:
 *
 *   * confirm-email  — `verifyOtp({ type: 'signup' })` creates a real session
 *     the instant the code is accepted, and the profile rows are written
 *     immediately AFTER that. If this screen were an entry screen, the guard
 *     would redirect on the new session before those writes finished, landing
 *     the user in a tab group with no profile — the exact dead end the code
 *     flow was built to remove.
 *
 *   * reset-password — `verifyOtp({ type: 'recovery' })` signs the person in
 *     with the password they have forgotten; the new one is set immediately
 *     afterwards. Being redirected in between would strand them signed in on
 *     a recovery code with no password set.
 *
 * Adding either name to that set would break its flow in a way that looks like
 * a routing quirk rather than a data-loss bug, so the invariant is asserted
 * rather than left to a comment.
 */

const source = readFileSync(join(__dirname, '..', 'useAuthGuard.ts'), 'utf8');

function entryScreens(): string[] {
  const match = /const AUTH_ENTRY_SCREENS = new Set\(\[([^\]]*)\]\)/.exec(source);
  if (!match) throw new Error('AUTH_ENTRY_SCREENS not found — has it been renamed?');
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe('AUTH_ENTRY_SCREENS', () => {
  it('bounces a signed-in user off the three screens that start a session', () => {
    expect(entryScreens().sort()).toEqual(['login', 'register', 'welcome']);
  });

  it.each(['confirm-email', 'reset-password'])(
    'does NOT contain %s, which must be able to hold a session mid-flow',
    (screen) => {
      expect(entryScreens()).not.toContain(screen);
    }
  );
});

/**
 * The other half of the same story: a failure after a successful sign-in has
 * to be able to speak. Before 2026-09-14 the guard's 'error' outcome was a
 * bare status with the reason discarded, so a profile load that failed left
 * the user on the login screen with nothing said at all.
 */
describe('profile-load failures are explainable', () => {
  it("carries the cause on every 'error' outcome", () => {
    const errorReturns = source.match(/status: 'error'/g) ?? [];
    const withCause = source.match(/status: 'error', cause/g) ?? [];
    expect(errorReturns.length).toBeGreaterThan(0);
    // The type declaration accounts for the one occurrence without `cause`.
    expect(withCause.length).toBe(errorReturns.length - 1);
  });

  it('tells the user when a fresh sign-in cannot load a profile', () => {
    expect(source).toContain('setAuthError');
  });
});
