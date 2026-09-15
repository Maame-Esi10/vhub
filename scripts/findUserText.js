/**
 * Finds characters that must never appear in text a user can read.
 *
 * WHY IT PARSES RATHER THAN GREPS. "Is this string user-visible?" cannot be
 * answered by a regular expression: an em dash in a JSDoc block explaining a
 * design decision is fine, and the identical character eight lines later
 * inside an empty-state message is not. A first attempt at this used a
 * hand-written comment stripper and reported two JSDoc lines as user text,
 * which is exactly the kind of false positive that gets a guard switched off.
 *
 * So it uses the TypeScript compiler's own scanner and walks the AST, looking
 * only at nodes that CAN reach a screen: string literals, template literals
 * and JSX text. Comments are not nodes, so they are excluded structurally
 * rather than by pattern.
 *
 * Shared by `node scripts/findUserText.js` (which prints a report) and
 * lib/__tests__/userFacingText.test.ts (which fails the build). One
 * implementation, so the test and the tool can never disagree about what
 * counts.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

/** Characters banned from user-visible copy, with what to use instead. */
const BANNED = [
  { char: '—', name: 'em dash', instead: 'a comma, a full stop, or a rewrite' },
  { char: '–', name: 'en dash', instead: 'the word "to", or a plain hyphen' },
];

const ROOTS = ['app', 'components', 'constants', 'lib', 'hooks', 'stores', 'types', 'api/src'];

/** Files whose strings are not user copy. */
function isExcluded(file) {
  const unix = file.split(path.sep).join('/');
  return (
    unix.includes('/__tests__/') ||
    // This file necessarily contains the characters it bans.
    unix.endsWith('scripts/findUserText.js')
  );
}

function walkFiles(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.expo') continue;
      walkFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !isExcluded(full)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every offence in one file.
 * @returns {{file:string, line:number, char:string, name:string, text:string}[]}
 */
function scanFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];

  function record(node, text) {
    for (const banned of BANNED) {
      if (!text.includes(banned.char)) continue;
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      found.push({
        file,
        line: line + 1,
        char: banned.char,
        name: banned.name,
        text: text.replace(/\s+/g, ' ').trim().slice(0, 120),
      });
    }
  }

  function visit(node) {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      record(node, node.text);
    } else if (ts.isJsxText(node)) {
      record(node, node.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function scanAll(roots = ROOTS, cwd = process.cwd()) {
  const files = [];
  for (const root of roots) walkFiles(path.join(cwd, root), files);
  return files.flatMap(scanFile).map((hit) => ({
    ...hit,
    file: path.relative(cwd, hit.file).split(path.sep).join('/'),
  }));
}

module.exports = { scanAll, scanFile, BANNED, ROOTS };

if (require.main === module) {
  const hits = scanAll();
  for (const hit of hits) {
    console.log(`${hit.file}:${hit.line}  [${hit.name}]  ${hit.text}`);
  }
  console.log(`\n${hits.length} offence(s) in user-visible text.`);
  process.exitCode = hits.length === 0 ? 0 : 1;
}
