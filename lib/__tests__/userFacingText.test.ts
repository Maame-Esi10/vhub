/* eslint-disable @typescript-eslint/no-require-imports */
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync, rmSync, writeFileSync } from 'fs';

/**
 * Keeps typographic dashes out of anything a user can read.
 *
 * WHY A TEST AND NOT A RULE IN CLAUDE.md. There was no written rule before
 * 2026-09-14, and the honest lesson of the tab bar clearance is that a written
 * rule would not have been enough anyway: 63 em and en dashes had accumulated
 * across 29 files, in screen copy, empty states, toasts, the Info Hub, the
 * privacy policy, the credential guidelines and two push/email templates. Prose
 * gets written faster than any convention gets read, and a dash is invisible in
 * review because it looks like correct typography. Only something mechanical
 * holds this line.
 *
 * WHY IT PARSES RATHER THAN GREPS. The same character is perfectly fine in a
 * comment explaining a design decision and wrong eight lines later in a button
 * label. A first attempt used a hand-written comment stripper and produced two
 * false positives from JSDoc, which is how a guard earns a reputation for
 * crying wolf and gets deleted. scripts/findUserText.js walks the TypeScript
 * AST instead and looks only at string literals, template literals and JSX
 * text, so comments are excluded structurally.
 *
 * The script is shared with `node scripts/findUserText.js`, which prints the
 * same report for anyone fixing them by hand. One implementation means the
 * tool and the test can never disagree about what counts.
 */

interface Offence {
  file: string;
  line: number;
  char: string;
  name: string;
  text: string;
}

const { scanAll } = require(join(__dirname, '..', '..', 'scripts', 'findUserText.js')) as {
  scanAll: (roots?: string[], cwd?: string) => Offence[];
};

const REPO_ROOT = join(__dirname, '..', '..');

describe('user-facing text', () => {
  const offences = scanAll(undefined, REPO_ROOT);

  it('contains no em dashes or en dashes', () => {
    const report = offences
      .map((o) => `  ${o.file}:${o.line}  [${o.name}]  ${o.text}`)
      .join('\n');

    expect(
      offences.length === 0
        ? ''
        : `Found ${offences.length} typographic dash(es) in text a user can read.\n` +
            `Replace each with a comma, a full stop, a colon, or a rewrite.\n` +
            `Run: node scripts/findUserText.js\n\n${report}`
    ).toBe('');
  });

  /*
    GUARDS THE GUARD, and its first version did not.

    That version asserted `Array.isArray(probe)` (trivially true) and that
    scanning a clean file returned no offences -- which passes both when the
    file is clean AND when the scanner is broken. `walkFiles` swallows a
    readdir failure with a bare catch, so a renamed root would have made the
    whole suite pass having inspected nothing at all. Exactly the vacuous shape
    this project has already been bitten by three times.

    A guard for a detector needs a POSITIVE CONTROL: something that MUST be
    reported. The fixture is written outside the repository so it can never be
    picked up by the real scan.
  */
  it('reports a dash it is given (positive control)', () => {
    const { scanFile } = require(join(REPO_ROOT, 'scripts', 'findUserText.js')) as {
      scanFile: (file: string) => Offence[];
    };
    // The dash is built from its code point rather than typed, so this test
    // file never contains one itself and the real scan cannot trip over it.
    const emDash = String.fromCharCode(0x2014);
    const lines = [
      '// a comment with an em dash ' + emDash + ' which must be IGNORED',
      'export const label = "one ' + emDash + ' two";',
      '',
    ];
    const fixture = join(tmpdir(), 'vhub-dash-probe-' + process.pid + '.tsx');
    writeFileSync(fixture, lines.join(String.fromCharCode(10)), 'utf8');
    try {
      const found = scanFile(fixture);
      // Exactly one: the string literal. The comment must not be counted,
      // which is the whole reason this walks the AST rather than grepping.
      expect(found.length).toBe(1);
      expect(found[0]!.text).toContain('one');
    } finally {
      rmSync(fixture, { force: true });
    }
  });

  it('is actually scanning the repository, not an empty file list', () => {
    // A floor on REACH. If a root were renamed or the walker regressed, the
    // main assertion above would report zero offences and pass.
    const { scanFile, ROOTS } = require(join(REPO_ROOT, 'scripts', 'findUserText.js')) as {
      scanFile: (file: string) => Offence[];
      ROOTS: string[];
    };
    expect(ROOTS.length).toBeGreaterThanOrEqual(8);
    // constants/policy.ts is the densest user copy in the repo and must exist.
    expect(existsSync(join(REPO_ROOT, 'constants', 'policy.ts'))).toBe(true);
    expect(scanFile(join(REPO_ROOT, 'constants', 'policy.ts'))).toEqual([]);
  });
});
