import fs from 'fs';
import path from 'path';
import {
  claimEligibilityRows,
  claimEligibilitySql,
  extractClaimBlock,
  replaceClaimBlock,
} from '../claimEligibilitySql';
import { canClaimSkill, eligibleSpecialties } from '@/constants/skillEligibility';

/*
  THE DATABASE MUST ENFORCE EXACTLY WHAT THE APP ENFORCES.

  The migration and supabase/schema.sql each carry a generated copy of
  constants/skillEligibility.ts. This fails the moment either differs from
  what lib/claimEligibilitySql.ts would write now, so a change to the app's
  table cannot ship without the database copy changing with it.

  Line endings are normalised: the files are checked out with CRLF on Windows.

  To regenerate: UPDATE_SKILL_SQL=1 npx jest claimEligibilitySql
*/

const root = path.resolve(__dirname, '..', '..');
const FILES = [
  'supabase/migrations/20260925c_claim_eligibility.sql',
  'supabase/schema.sql',
];
const normalise = (text: string) => text.replace(/\r\n/g, '\n');

describe('generated claim-eligibility SQL', () => {
  const expected = claimEligibilitySql();

  if (process.env.UPDATE_SKILL_SQL === '1') {
    for (const file of FILES) {
      const full = path.join(root, file);
      fs.writeFileSync(full, replaceClaimBlock(normalise(fs.readFileSync(full, 'utf8')), expected));
    }
  }

  it.each(FILES)('%s matches constants/skillEligibility.ts', (file) => {
    const block = extractClaimBlock(normalise(fs.readFileSync(path.join(root, file), 'utf8')));
    expect(block).not.toBeNull();
    expect(block).toBe(expected);
  });

  it('holds one row per claimable (skill or specialty, role) pair and nothing else', () => {
    for (const row of claimEligibilityRows()) {
      if (row.kind === 'skill') {
        expect(canClaimSkill(row.category, row.item)).toBe(true);
      } else {
        expect(eligibleSpecialties(row.category)).toContain(row.item);
      }
    }
  });

  it('does not let a first aider claim physical examination or Cardiology', () => {
    const rows = claimEligibilityRows();
    expect(rows.some((r) => r.category === 'first_aider' && r.item === 'Physical examination')).toBe(false);
    expect(rows.some((r) => r.category === 'first_aider' && r.item === 'Cardiology')).toBe(false);
  });
});
