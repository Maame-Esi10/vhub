import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Guards the one rule that the floating tab bar imposes on every screen it
 * covers: leave room at the bottom, or the last element cannot be tapped.
 *
 * WHY THIS TEST EXISTS (owner-reported, 2026-09-14). Sign Out on Settings was
 * visible behind the pill and unreachable. The cause was not a missed screen
 * but a MISREAD CATEGORY: only the visible tabs had been padded, because "tab
 * screen" was taken to mean "screen with a button on the bar". A screen
 * registered with `href: null` is hidden from the bar but is still a screen OF
 * the navigator, so the bar floats over it identically. Twenty-nine screens
 * were in that second group.
 *
 * A review cannot be trusted to hold this line, because the failure looks fine
 * in the source -- every one of those screens had a sensible-looking
 * `paddingBottom: spacing.xxl`. Only the arithmetic against the bar's height
 * shows it is ~85px short. So the check is mechanical: enumerate what the
 * navigators actually register and assert each one accounts for the bar.
 */

const GROUPS = ['(volunteer)', '(organisation)', '(admin)'] as const;

/**
 * Screens deliberately not padded, each with the reason it is exempt.
 * An entry here is a claim that the screen has NO interactive element near the
 * bottom of its content -- not merely that it looked fine once.
 */
const EXEMPT: Record<string, string> = {
  '(volunteer)/map': 'placeholder stub: a centred label, no controls',
  '(volunteer)/search': 'placeholder stub: a centred label, no controls',
  '(volunteer)/scan': 'full-bleed camera; its buttons are vertically centred, never at the bottom',
};

function screensOf(group: string): string[] {
  const layout = readFileSync(join(__dirname, '..', '..', '..', 'app', group, '_layout.tsx'), 'utf8');
  return [...layout.matchAll(/name="([^"]+)"/g)].map((m) => m[1]!);
}

function sourceOf(group: string, screen: string): string {
  const base = join(__dirname, '..', '..', '..', 'app', group, screen);
  for (const candidate of [`${base}.tsx`, join(base, 'index.tsx')]) {
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
  }
  throw new Error(`no source file for ${group}/${screen}`);
}

/** Follows a one-line delegating route (Account & Security) to the real screen. */
function resolve(group: string, screen: string): string {
  const src = sourceOf(group, screen);
  const delegated = src.match(/from '@\/(components\/[^']+)'/);
  if (delegated && src.length < 1200) {
    const target = join(__dirname, '..', '..', '..', `${delegated[1]}.tsx`);
    if (existsSync(target)) return readFileSync(target, 'utf8');
  }
  return src;
}

describe('every screen inside a tab navigator clears the floating bar', () => {
  for (const group of GROUPS) {
    for (const screen of screensOf(group)) {
      const key = `${group}/${screen}`;
      const reason = EXEMPT[key];

      (reason ? it.skip : it)(`${key} accounts for the tab bar`, () => {
        const src = resolve(group, screen);
        const clears =
          src.includes('useTabBarContentPadding') || src.includes('tabBarClearance');
        expect(clears).toBe(true);
      });
    }
  }

  it('every exemption names a real screen', () => {
    const all = GROUPS.flatMap((g) => screensOf(g).map((s) => `${g}/${s}`));
    for (const key of Object.keys(EXEMPT)) expect(all).toContain(key);
  });

  it('no exemption is left without a stated reason', () => {
    for (const [key, reason] of Object.entries(EXEMPT)) {
      expect(reason.length).toBeGreaterThan(20);
      expect(key).toBeTruthy();
    }
  });
});
