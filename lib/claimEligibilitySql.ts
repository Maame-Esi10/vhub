import { VOLUNTEER_CATEGORIES } from '@/constants/categories';
import { SKILL_ELIGIBILITY, eligibleSpecialties } from '@/constants/skillEligibility';
import type { VolunteerCategory } from '@/types/database';

/*
  THE DATABASE COPY OF THE ELIGIBILITY TABLE, GENERATED FROM THE APP'S.

  constants/skillEligibility.ts is the ONE source for which role may claim
  which skill or specialty. The database enforces the same rule (trigger
  trg_volunteer_profiles_claim_eligibility, migration 20260925c) and so needs
  its own copy in the table `volunteer_claim_eligibility`. Two hand-kept copies
  would drift, so nobody keeps this one: this function writes it, and
  lib/__tests__/claimEligibilitySql.test.ts fails the build if the SQL in the
  migration or in supabase/schema.sql differs from what it writes.

  To regenerate after changing constants/skillEligibility.ts:
      UPDATE_SKILL_SQL=1 npx jest claimEligibilitySql
  then write a new migration containing the new block (a pasted migration is
  the only thing that changes the live database).
*/

export const CLAIM_SQL_BEGIN = '-- BEGIN GENERATED: volunteer_claim_eligibility (lib/claimEligibilitySql.ts, do not edit by hand)';
export const CLAIM_SQL_END = '-- END GENERATED: volunteer_claim_eligibility';

interface ClaimRow {
  kind: 'skill' | 'specialty';
  item: string;
  category: VolunteerCategory;
}

export function claimEligibilityRows(): ClaimRow[] {
  const rows: ClaimRow[] = [];
  for (const [skill, roles] of Object.entries(SKILL_ELIGIBILITY)) {
    for (const category of roles) rows.push({ kind: 'skill', item: skill, category });
  }
  for (const { value } of VOLUNTEER_CATEGORIES) {
    for (const specialty of eligibleSpecialties(value)) {
      rows.push({ kind: 'specialty', item: specialty, category: value });
    }
  }
  // Sorted so the generated text depends only on the content, never on the
  // order entries happen to be written in the TypeScript file.
  return rows.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) || a.item.localeCompare(b.item) || a.category.localeCompare(b.category)
  );
}

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** The generated block, markers included. Replacing the whole table makes it safe to re-run. */
export function claimEligibilitySql(): string {
  const rows = claimEligibilityRows();
  const values = rows.map((row) => `  (${quote(row.kind)}, ${quote(row.item)}, ${quote(row.category)})`);
  return [
    CLAIM_SQL_BEGIN,
    'delete from volunteer_claim_eligibility;',
    'insert into volunteer_claim_eligibility (kind, item, category) values',
    values.join(',\n') + ';',
    'do $$ begin',
    `  if (select count(*) from volunteer_claim_eligibility) <> ${rows.length} then`,
    `    raise exception 'volunteer_claim_eligibility should hold ${rows.length} rows';`,
    '  end if;',
    'end $$;',
    CLAIM_SQL_END,
  ].join('\n');
}

/** Replaces the generated block inside a file's text. Throws if the markers are missing. */
export function replaceClaimBlock(text: string, block: string): string {
  const start = text.indexOf(CLAIM_SQL_BEGIN);
  const end = text.indexOf(CLAIM_SQL_END);
  if (start < 0 || end < start) throw new Error('generated-block markers not found');
  return text.slice(0, start) + block + text.slice(end + CLAIM_SQL_END.length);
}

/** Extracts the generated block from a file's text, or null if it has none. */
export function extractClaimBlock(text: string): string | null {
  const start = text.indexOf(CLAIM_SQL_BEGIN);
  const end = text.indexOf(CLAIM_SQL_END);
  if (start < 0 || end < start) return null;
  return text.slice(start, end + CLAIM_SQL_END.length);
}
