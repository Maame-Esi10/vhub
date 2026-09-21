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

/**
 * The login dead end (owner-reported 2026-09-14: "I tried to log in. Nothing
 * happened. No error, no message.").
 *
 * THE REAL CAUSE, which was not the one first proposed. The profile rows were
 * fine; the SQL confirmed both existed. A brand-new volunteer has
 * `category === null` until the onboarding wizard's last step writes it, so
 * they are `onboardingIncomplete` by definition the moment they confirm their
 * email. That branch used to say "anywhere inside (auth) is fine" and return,
 * which is correct for welcome and for every wizard step and WRONG for login:
 * login is the screen you are standing on when you sign in, so leaving the
 * user there means a successful sign-in produces no visible result at all.
 *
 * Nothing errored, so nothing was shown. The rule that exists to move a
 * signed-in user off an entry screen sat twenty lines below and never ran,
 * because this branch returned first -- an interaction the file's own comment
 * had recorded without anyone drawing the consequence from it.
 *
 * Asserted on the source because the alternative is mounting expo-router.
 */
describe('a signed-in volunteer is never stranded on login', () => {
  const branch = /if \(onboardingIncomplete\) \{[\s\S]*?\n    \}/.exec(source)?.[0] ?? '';

  it('has an onboardingIncomplete branch', () => {
    expect(branch).not.toBe('');
  });

  it('pulls them off an entry screen rather than leaving them there', () => {
    expect(branch).toContain('AUTH_ENTRY_SCREENS');
    expect(branch).toMatch(/router\.replace\('\/\(auth\)\//);
  });

  /*
    THE DESTINATION IS THE WIZARD, NOT WELCOME (changed 2026-09-21).

    This test used to assert `router.replace('/(auth)/welcome')` literally,
    which made it a record of the destination rather than of the rule. The rule
    is that a volunteer with unfinished onboarding is never left standing on a
    screen that does nothing for them; welcome was a poor answer to that for
    the commonest case of all, somebody who has just confirmed their email and
    is being shown an introduction to an app they have already joined.

    Asserted as "somewhere in the wizard" rather than the exact path, so moving
    the wizard's entry point is not a test failure. Sending them to welcome
    again WOULD be, which is the thing worth catching.
  */
  it('sends them into the wizard rather than back to the introduction', () => {
    expect(branch).toContain("router.replace('/(auth)/onboarding')");
    expect(branch).not.toContain("router.replace('/(auth)/welcome')");
  });

  it('still excludes welcome, which would otherwise redirect to itself', () => {
    // welcome IS in AUTH_ENTRY_SCREENS, so without this the redirect loops.
    expect(branch).toMatch(/atWelcome|'welcome'/);
  });

  it('leaves the onboarding wizard alone', () => {
    // The wizard steps are inside (auth) but are NOT entry screens, so the
    // new condition must not touch them.
    expect(branch).toContain('onEntryScreen');
  });
});
