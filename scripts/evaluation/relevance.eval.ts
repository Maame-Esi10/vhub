import fs from 'fs';
import path from 'path';
import { OUTREACHES, VOLUNTEERS, isRelevant, conceptOf } from './dataset';

/*
  STEP 0: the relevance list, written BEFORE any scoring run.

  It reads nothing but the test set and its meaning tags, and never imports
  the matching engine, so it cannot be influenced by any result.
*/

const OUT = path.join(__dirname, 'output', '00-relevance.md');

test('write the relevance list', () => {
  const lines: string[] = [];
  lines.push('## 1.1 Relevance, recorded before any run');
  lines.push('');
  lines.push(
    'A volunteer is **relevant** to an outreach when, for every required skill, they hold a skill with the same meaning, and their category is the required one or related to it (`RELATED_CATEGORIES`). Meaning is decided by the tags in `scripts/evaluation/dataset.ts` (`CONCEPT_OF`), written before any scoring. Location, availability, experience and V-Score are identical for all 72 volunteers, so only skills and category differ.'
  );
  lines.push('');

  for (const o of OUTREACHES) {
    const relevant = VOLUNTEERS.filter((v) => isRelevant(o, v));
    lines.push(`### ${o.id} ${o.title}`);
    lines.push('');
    lines.push(`Required category **${o.category}**; places (k) **${o.slots_total}**; required skills: ${o.required_skills.join(', ')}.`);
    lines.push('');
    lines.push(`**${relevant.length} relevant volunteers:**`);
    lines.push('');
    lines.push('| Volunteer | Category | Skills held | Why relevant |');
    lines.push('|---|---|---|---|');
    for (const v of relevant) {
      const reworded = v.skill_tags.filter(
        (s) => !o.required_skills.map((r) => r.toLowerCase()).includes(s.toLowerCase()) &&
          o.required_skills.some((r) => conceptOf(r) === conceptOf(s))
      );
      lines.push(
        `| ${v.id} | ${v.category} | ${v.skill_tags.join(', ')} | ${
          reworded.length === 0 ? 'all required skills, identical wording' : `holds by meaning; reworded: ${reworded.join(', ')}`
        } |`
      );
    }
    lines.push('');
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'));
});
