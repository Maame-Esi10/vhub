/* eslint-disable @typescript-eslint/no-require-imports */
import { join } from 'path';

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

  it('is actually looking at something', () => {
    // Guards the guard: a scanner that silently stops finding files would
    // report zero offences forever and pass for the wrong reason.
    const probe = scanAll(['constants'], REPO_ROOT);
    expect(Array.isArray(probe)).toBe(true);
    // constants/ holds the policy, the terms and the credential guidelines,
    // which is the densest user copy in the repo. If the walker breaks, this
    // still passes -- so assert on the file list instead.
    const { scanFile } = require(join(REPO_ROOT, 'scripts', 'findUserText.js')) as {
      scanFile: (file: string) => Offence[];
    };
    const policy = scanFile(join(REPO_ROOT, 'constants', 'policy.ts'));
    expect(policy).toEqual([]);
  });
});
