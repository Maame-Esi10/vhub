/* global __dirname */
/*
  Runs the project's test suite and writes a per-file summary for the
  evaluation report (output/06-jest.md).

  It runs `npx jest --verbose --json`: --verbose is the run requested for the
  report, and --json makes Jest write its own machine-readable record of the
  same run, so every count below is copied from Jest rather than parsed from
  coloured terminal text.

  node scripts/evaluation/jest-summary.js
*/
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const jsonFile = path.join(__dirname, 'output', 'jest-results.json');
const started = Date.now();
spawnSync('npx', ['jest', '--verbose', '--json', `--outputFile=${jsonFile}`], {
  cwd: root,
  shell: true,
  stdio: 'inherit',
});
const r = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

const lines = [];
lines.push(
  `Run on ${new Date(started).toISOString().slice(0, 10)} with \`npx jest --verbose --json\` by \`scripts/evaluation/jest-summary.js\` (the full per-test record is \`scripts/evaluation/output/jest-results.json\`).`
);
lines.push('');
lines.push(
  `**Final counts: ${r.numTotalTestSuites} suites (${r.numPassedTestSuites} passed, ${r.numFailedTestSuites} failed); ${r.numTotalTests} tests (${r.numPassedTests} passed, ${r.numFailedTests} failed, ${r.numPendingTests} skipped).**`
);
lines.push('');
lines.push('| Test file | Tests | Passed | Failed | Skipped |');
lines.push('|---|---|---|---|---|');
const files = r.testResults
  .map((f) => {
    const a = f.assertionResults;
    return {
      file: path.relative(root, f.name).replace(/\\/g, '/'),
      total: a.length,
      passed: a.filter((t) => t.status === 'passed').length,
      failed: a.filter((t) => t.status === 'failed').length,
      skipped: a.filter((t) => t.status === 'pending' || t.status === 'skipped' || t.status === 'todo').length,
    };
  })
  .sort((x, y) => x.file.localeCompare(y.file));
for (const f of files) lines.push(`| \`${f.file}\` | ${f.total} | ${f.passed} | ${f.failed} | ${f.skipped} |`);
lines.push('');
const skipped = r.testResults.flatMap((f) =>
  f.assertionResults.filter((t) => t.status !== 'passed' && t.status !== 'failed').map((t) => `${path.relative(root, f.name).replace(/\\/g, '/')}: ${t.fullName}`)
);
if (skipped.length) {
  lines.push('Skipped tests:');
  lines.push('');
  for (const s of skipped) lines.push(`- ${s}`);
  lines.push('');
}
fs.writeFileSync(path.join(__dirname, 'output', '06-jest.md'), lines.join('\n'));
console.log(lines.slice(0, 3).join('\n'));
