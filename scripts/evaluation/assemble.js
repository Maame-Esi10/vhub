/* global __dirname */
/*
  Builds docs/evaluation-results.md from the files the evaluation runs write
  into scripts/evaluation/output/. Nothing in the results file is typed by
  hand except this header and the section headings: every figure comes from
  an output file, and a section whose output file does not exist yet says
  so instead of showing a number.

  node scripts/evaluation/assemble.js
*/
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'output');
const TARGET = path.join(__dirname, '..', '..', 'docs', 'evaluation-results.md');

const SECTIONS = [
  ['# 1. Layer comparison (research question 2)', ['00-relevance.md', '01-layers.md', '01b-o2-rerun.md']],
  ['# 2. Forced failure (research question 3)', ['02-failure.md']],
  ['# 3. V-Score simulation (research question 4)', ['03-vscore.md']],
  ['# 4. Functional testing', ['04-functional.md']],
  ['# 5. Performance', ['05-performance.md']],
  ['# 6. Test suite', ['06-jest.md']],
];

const header = `# VHub evaluation results

Every figure in this file was produced by a script in \`scripts/evaluation/\`
and copied in by \`scripts/evaluation/assemble.js\`; none was estimated. A
section whose run has not happened says so. To re-run everything, follow
\`scripts/evaluation/README.md\`.
`;

const parts = [header];
for (const [heading, files] of SECTIONS) {
  parts.push(heading, '');
  for (const file of files) {
    const full = path.join(OUT_DIR, file);
    parts.push(
      fs.existsSync(full)
        ? fs.readFileSync(full, 'utf8').trim()
        : `_Not yet run: \`${file}\` has not been produced._`,
      ''
    );
  }
}
fs.writeFileSync(TARGET, parts.join('\n'));
console.log('wrote', path.relative(process.cwd(), TARGET));
