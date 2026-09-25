import fs from 'fs';
import path from 'path';
import { createFakeDb, type FakeDb } from './fakeSupabase';
import { OUTREACHES, VOLUNTEERS, databaseRows, isRelevant, goldEquivalent, outreachUuid } from './dataset';
import { loadGeminiKey, recordGeminiCalls, type GeminiCall } from './evalEnv';

/*
  RESEARCH QUESTION 2: does Layer 2 (Gemini) improve the ranking over Layer 1?

  The REAL /api/match route handler is called, mode score_applicants, once
  per outreach. Only the database (in-memory, see fakeSupabase.ts), the login
  check and the rate limiter are replaced. Layer 1, Layer 2, the skill cache
  code and the ranking are the production code, unchanged.

    Run A  Layer 1 only        GEMINI_API_KEY unset, so Layer 2 cannot run
    Run B  Layer 1 + Layer 2   real Gemini calls, cache empty at the start
    Run C  second run          same database as B, so the cache is kept
*/

let currentDb: FakeDb = createFakeDb();
jest.mock('../../api/src/server/supabaseAdmin', () => ({ getSupabaseAdmin: () => currentDb }));
jest.mock('../../api/src/server/auth', () => ({
  ...jest.requireActual('../../api/src/server/auth'),
  authenticate: async () => ({ userId: 'ORG', role: 'organisation' }),
}));
jest.mock('../../api/src/server/rateLimit', () => ({
  ...jest.requireActual('../../api/src/server/rateLimit'),
  enforceIpRateLimit: () => undefined,
  enforceUserRateLimit: () => undefined,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require('../../api/src/app/api/match/route') as { POST: (req: Request) => Promise<Response> };

const OUT_MD = path.join(__dirname, 'output', '01-layers.md');
const OUT_JSON = path.join(__dirname, 'output', 'layers.json');

interface Ranked {
  volunteerId: string;
  matchScore: number;
  skillsRaw: number;
}
interface Runs {
  A: RequestRecord[];
  B?: RequestRecord[];
  C?: RequestRecord[];
}
interface RequestRecord {
  outreachId: string;
  ranking: Ranked[];
  layer2Applied: boolean;
  ms: number;
  pairsNeeded: number;
  cacheHits: number;
  geminiCalls: GeminiCall[];
}

const norm = (s: string) => s.trim().toLowerCase();
const order = (a: string, b: string) => (a <= b ? `${a}::${b}` : `${b}::${a}`);

/*
  Which pairs this request needs judged: for each applicant, every required
  skill they do not hold word for word against every skill of theirs that is
  not required word for word, deduplicated and ordered. This mirrors the
  selection in computeLayer2Equivalences (api/src/app/api/match/route.ts) and
  is used ONLY to count cache hits for the report; it does not affect any
  score.
*/
function pairsNeeded(outreachId: string): Set<string> {
  const o = OUTREACHES.find((x) => x.id === outreachId)!;
  const required = [...new Set(o.required_skills.map(norm))];
  const keys = new Set<string>();
  for (const v of VOLUNTEERS) {
    const tags = [...new Set(v.skill_tags.map(norm))];
    const unmatchedRequired = required.filter((r) => !tags.includes(r));
    const unmatchedVolunteer = tags.filter((t) => !required.includes(t));
    for (const r of unmatchedRequired) for (const t of unmatchedVolunteer) keys.add(order(r, t));
  }
  return keys;
}

async function scoreOutreach(outreachId: string, calls: GeminiCall[]): Promise<RequestRecord> {
  const needed = pairsNeeded(outreachId);
  const cached = new Set(
    (currentDb.tables.skill_match_cache ?? []).map((row) => `${row.skill_a}::${row.skill_b}`)
  );
  const cacheHits = [...needed].filter((k) => cached.has(k)).length;
  const before = calls.length;

  const started = performance.now();
  const response = await POST(
    new Request('http://eval.local/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer eval' },
      body: JSON.stringify({ mode: 'score_applicants', outreachId: outreachUuid(outreachId) }),
    })
  );
  const ms = Math.round(performance.now() - started);
  if (response.status !== 200) throw new Error(`match returned ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as {
    layer2Applied: boolean;
    results: { volunteerId: string; matchScore: number; breakdown: { skills: { raw: number } } }[];
  };
  return {
    outreachId,
    ranking: body.results.map((r) => ({
      volunteerId: r.volunteerId,
      matchScore: r.matchScore,
      skillsRaw: r.breakdown.skills.raw,
    })),
    layer2Applied: body.layer2Applied,
    ms,
    pairsNeeded: needed.size,
    cacheHits,
    geminiCalls: calls.slice(before),
  };
}

async function runAll(calls: GeminiCall[]): Promise<RequestRecord[]> {
  const records: RequestRecord[] = [];
  for (const o of OUTREACHES) records.push(await scoreOutreach(o.id, calls));
  return records;
}

function precisionAtK(ranking: Ranked[], outreachId: string): { hits: number; k: number; tiedAtBoundary: number } {
  const o = OUTREACHES.find((x) => x.id === outreachId)!;
  const k = o.slots_total;
  const top = ranking.slice(0, k);
  const hits = top.filter((r) => isRelevant(o, VOLUNTEERS.find((v) => v.id === r.volunteerId)!)).length;
  // How many volunteers OUTSIDE the top k share the k-th score: a tie across
  // the boundary means the top k was decided by list order, not by score.
  const kth = ranking[k - 1]?.matchScore;
  const tiedAtBoundary = ranking.slice(k).filter((r) => r.matchScore === kth).length;
  return { hits, k, tiedAtBoundary };
}

test('layer comparison', async () => {
  const key = loadGeminiKey();
  const { calls, restore } = recordGeminiCalls();
  const runs: Runs = { A: [] };

  try {
    delete process.env.GEMINI_API_KEY;
    currentDb = createFakeDb(databaseRows());
    runs.A = await runAll(calls);
    if (calls.length !== 0) throw new Error('Run A reached Gemini, so it was not Layer 1 only');

    if (key) {
      process.env.GEMINI_API_KEY = key;
      currentDb = createFakeDb(databaseRows()); // cache empty
      runs.B = await runAll(calls);
      runs.C = await runAll(calls); // same database: cache kept
    }
  } finally {
    restore();
    delete process.env.GEMINI_API_KEY;
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify({ ranAt: new Date().toISOString(), model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash', runs, cache: currentDb.tables.skill_match_cache }, null, 2));
  fs.writeFileSync(OUT_MD, report(runs, key !== null, currentDb));
});

function report(runs: Runs, hadKey: boolean, db: FakeDb): string {
  const L: string[] = [];
  const ranAt = new Date().toISOString();
  L.push('## 1.2 Method');
  L.push('');
  L.push(`Run on ${ranAt.slice(0, 10)} by \`scripts/evaluation/layers.eval.ts\`. The real \`/api/match\` route handler (mode \`score_applicants\`) was called once per outreach, with all 72 volunteers as applicants to every outreach. Only the database (in memory), the login check and the rate limiter were replaced. Run A had no Gemini key, so only Layer 1 could run. Run B used real Gemini calls (model \`${process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'}\`, the production default) starting from an empty cache. Run C repeated B on the same database, so the cache from B was kept.`);
  L.push('');
  if (!hadKey) {
    L.push('**Runs B and C were not performed: no Gemini key was available.** Only Layer 1 results are shown.');
    L.push('');
  }

  L.push('## 1.3 Rankings, precision at k and positions of the relevant volunteers');
  L.push('');
  for (const o of OUTREACHES) {
    const a = runs.A.find((r) => r.outreachId === o.id)!;
    const b = runs.B?.find((r) => r.outreachId === o.id);
    const relevant = VOLUNTEERS.filter((v) => isRelevant(o, v)).map((v) => v.id);
    L.push(`### ${o.id} ${o.title} (k = ${o.slots_total})`);
    L.push('');
    const pa = precisionAtK(a.ranking, o.id);
    const pb = b ? precisionAtK(b.ranking, o.id) : null;
    L.push(`- **Precision at ${o.slots_total}, Layer 1 only:** ${pa.hits}/${pa.k} = ${(pa.hits / pa.k).toFixed(2)}${pa.tiedAtBoundary ? ` (${pa.tiedAtBoundary} volunteer(s) below position ${pa.k} share the score at position ${pa.k})` : ''}`);
    if (pb) L.push(`- **Precision at ${o.slots_total}, Layer 1 + Layer 2:** ${pb.hits}/${pb.k} = ${(pb.hits / pb.k).toFixed(2)}${pb.tiedAtBoundary ? ` (${pb.tiedAtBoundary} volunteer(s) below position ${pb.k} share the score at position ${pb.k})` : ''}; layer2Applied = ${b!.layer2Applied}`);
    L.push('');
    L.push('Positions of the relevant volunteers (1 = top, out of 72):');
    L.push('');
    L.push(b ? '| Volunteer | Layer 1 only | Layer 1 + 2 |' : '| Volunteer | Layer 1 only |');
    L.push(b ? '|---|---|---|' : '|---|---|');
    // A tied score means the order within the tie is list order, not a
    // judgement by the engine, so the whole tied range is shown.
    const cell = (ranking: Ranked[], id: string) => {
      const pos = ranking.findIndex((r) => r.volunteerId === id) + 1;
      const score = ranking[pos - 1]!.matchScore;
      const first = ranking.findIndex((r) => r.matchScore === score) + 1;
      const last = ranking.length - [...ranking].reverse().findIndex((r) => r.matchScore === score);
      return `${pos} (score ${score}${last > first ? `; tied for positions ${first}-${last}` : ''})`;
    };
    for (const id of relevant) {
      L.push(b ? `| ${id} | ${cell(a.ranking, id)} | ${cell(b.ranking, id)} |` : `| ${id} | ${cell(a.ranking, id)} |`);
    }
    L.push('');
    L.push('Top 12 of each ranking side by side (match score in brackets; * = relevant):');
    L.push('');
    L.push(b ? '| Position | Layer 1 only | Layer 1 + 2 |' : '| Position | Layer 1 only |');
    L.push(b ? '|---|---|---|' : '|---|---|');
    const mark = (r: Ranked) => `${relevant.includes(r.volunteerId) ? '*' : ''}${r.volunteerId} (${r.matchScore})`;
    for (let i = 0; i < 12; i++) {
      L.push(b ? `| ${i + 1} | ${mark(a.ranking[i]!)} | ${mark(b.ranking[i]!)} |` : `| ${i + 1} | ${mark(a.ranking[i]!)} |`);
    }
    L.push('');
  }

  if (!runs.B) return L.join('\n');

  L.push('## 1.4 Gemini calls and the cache');
  L.push('');
  L.push('| Run | Outreach | Pairs needing a judgement | Found in cache | Gemini calls | Pairs sent | layer2Applied | Request time (ms) |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const run of ['B', 'C'] as const) {
    for (const r of runs[run] ?? []) {
      const sent = r.geminiCalls.reduce((n, c) => n + c.pairs.length, 0);
      L.push(`| ${run} | ${r.outreachId} | ${r.pairsNeeded} | ${r.cacheHits} | ${r.geminiCalls.length} | ${sent} | ${r.layer2Applied} | ${r.ms} |`);
    }
  }
  const total = (run: 'B' | 'C', f: (r: RequestRecord) => number) => (runs[run] ?? []).reduce((n, r) => n + f(r), 0);
  L.push('');
  L.push(`- **Run B (cold):** ${total('B', (r) => r.geminiCalls.length)} Gemini calls; ${total('B', (r) => r.cacheHits)} of ${total('B', (r) => r.pairsNeeded)} pair look-ups answered from the cache.`);
  L.push(`- **Run C (second run):** ${total('C', (r) => r.geminiCalls.length)} Gemini calls; ${total('C', (r) => r.cacheHits)} of ${total('C', (r) => r.pairsNeeded)} pair look-ups answered from the cache.`);
  const statuses = [...(runs.B ?? []), ...(runs.C ?? [])].flatMap((r) => r.geminiCalls.map((c) => c.status));
  L.push(`- HTTP statuses returned by Gemini: ${[...new Set(statuses)].map((s) => `${s} x${statuses.filter((x) => x === s).length}`).join(', ') || 'none'}.`);
  L.push('');

  L.push('## 1.5 Skill pairs Gemini judged');
  L.push('');
  L.push('Every pair Gemini answered across runs B and C, against the meaning tags recorded before the run. "Mistake" means Gemini disagreed with the tags.');
  L.push('');
  const judged = new Map<string, { a: string; b: string; gemini: boolean }>();
  for (const r of [...(runs.B ?? []), ...(runs.C ?? [])]) {
    for (const c of r.geminiCalls) {
      if (!c.matches || c.matches.length !== c.pairs.length) continue;
      c.pairs.forEach((p, i) => judged.set(order(p.a, p.b), { a: p.a, b: p.b, gemini: c.matches![i] === true }));
    }
  }
  const rows = [...judged.values()].map((j) => ({ ...j, gold: goldEquivalent(j.a, j.b) }));
  const promptExamples = new Set([order('venipuncture', 'blood draw'), order('wound care', 'wound dressing')]);
  const table = (title: string, list: typeof rows) => {
    L.push(`**${title} (${list.length})**`);
    L.push('');
    if (list.length === 0) {
      L.push('None.');
      L.push('');
      return;
    }
    L.push('| Pair | Gemini | Tags say | |');
    L.push('|---|---|---|---|');
    for (const j of list.sort((x, y) => order(x.a, x.b).localeCompare(order(y.a, y.b)))) {
      const note = promptExamples.has(order(j.a, j.b)) ? 'worked example in the prompt' : '';
      L.push(`| ${j.a} / ${j.b} | ${j.gemini ? 'equivalent' : 'not equivalent'} | ${j.gold ? 'equivalent' : 'not equivalent'} | ${j.gemini === j.gold ? note : `**Mistake**${note ? `; ${note}` : ''}`} |`);
    }
    L.push('');
  };
  table('Judged equivalent', rows.filter((j) => j.gemini));
  table('Judged not equivalent', rows.filter((j) => !j.gemini));
  const mistakes = rows.filter((j) => j.gemini !== j.gold);
  const falsePos = mistakes.filter((j) => j.gemini).length;
  L.push(`**Agreement with the tags:** ${rows.length - mistakes.length} of ${rows.length} pairs; ${mistakes.length} mistakes (${falsePos} judged equivalent wrongly, ${mistakes.length - falsePos} judged not equivalent wrongly).`);
  L.push('');
  const allNeeded = new Set(OUTREACHES.flatMap((o) => [...pairsNeeded(o.id)]));
  const neverAsked = [...allNeeded].filter((k) => !judged.has(k));
  L.push(`**Pairs that needed a judgement but were never sent to Gemini in either run:** ${neverAsked.length} of ${allNeeded.size}. Final cache size: ${(db.tables.skill_match_cache ?? []).length} rows.`);
  L.push('');
  return L.join('\n');
}
