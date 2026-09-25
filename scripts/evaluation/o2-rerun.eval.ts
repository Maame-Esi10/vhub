import fs from 'fs';
import path from 'path';
import { createFakeDb, type FakeDb } from './fakeSupabase';
import { OUTREACHES, VOLUNTEERS, databaseRows, isRelevant, outreachUuid } from './dataset';
import { loadGeminiKey, recordGeminiCalls, type GeminiCall } from './evalEnv';

/*
  RUN B FOR OUTREACH O2 ONLY, repeated until Layer 2 is fully applied.

  In the full run (output/01-layers.md) O2's cold request had calls time out,
  so it reported layer2Applied = false and its "Layer 1 + 2" column was partly
  Layer 1. This run asks for a COLD result that completed: every attempt
  starts from an EMPTY cache (a fresh in-memory database), attempts are at
  least 30 seconds apart, and it stops at the first attempt that reports
  layer2Applied = true (at most 10 attempts). Every attempt is reported, not
  only the successful one.

  Same harness as layers.eval.ts: the real /api/match route, only the
  database, the sign-in check and the rate limiter replaced.
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

/* eslint-disable @typescript-eslint/no-require-imports */
const { POST } = require('../../api/src/app/api/match/route') as { POST: (req: Request) => Promise<Response> };
const modelInUse = (): string => (require('../../api/src/server/env') as { env: { geminiModel: string } }).env.geminiModel;
/* eslint-enable @typescript-eslint/no-require-imports */

const OUT = path.join(__dirname, 'output', '01b-o2-rerun.md');
const OUTREACH = OUTREACHES.find((o) => o.id === 'O2')!;
const GAP_MS = 30000;
const MAX_ATTEMPTS = 10;

interface Ranked {
  volunteerId: string;
  matchScore: number;
}
interface Attempt {
  n: number;
  startedAt: string;
  layer2Applied: boolean;
  ms: number;
  ranking: Ranked[];
  calls: GeminiCall[];
}

async function score(): Promise<{ layer2Applied: boolean; ranking: Ranked[]; ms: number }> {
  const started = performance.now();
  const response = await POST(
    new Request('http://eval.local/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer eval' },
      body: JSON.stringify({ mode: 'score_applicants', outreachId: outreachUuid(OUTREACH.id) }),
    })
  );
  const ms = Math.round(performance.now() - started);
  if (response.status !== 200) throw new Error(`match returned ${response.status}`);
  const body = (await response.json()) as { layer2Applied: boolean; results: Ranked[] };
  return {
    layer2Applied: body.layer2Applied,
    ranking: body.results.map((r) => ({ volunteerId: r.volunteerId, matchScore: r.matchScore })),
    ms,
  };
}

const relevant = VOLUNTEERS.filter((v) => isRelevant(OUTREACH, v)).map((v) => v.id);

function precision(ranking: Ranked[]) {
  const k = OUTREACH.slots_total;
  const hits = ranking.slice(0, k).filter((r) => relevant.includes(r.volunteerId)).length;
  const kth = ranking[k - 1]?.matchScore;
  const tied = ranking.slice(k).filter((r) => r.matchScore === kth).length;
  return `${hits}/${k} = ${(hits / k).toFixed(2)}${tied ? ` (${tied} volunteer(s) below position ${k} share the score at position ${k})` : ''}`;
}

function cell(ranking: Ranked[], id: string): string {
  const pos = ranking.findIndex((r) => r.volunteerId === id) + 1;
  const score = ranking[pos - 1]!.matchScore;
  const first = ranking.findIndex((r) => r.matchScore === score) + 1;
  const last = ranking.length - [...ranking].reverse().findIndex((r) => r.matchScore === score);
  return `${pos} (score ${score}${last > first ? `; tied for positions ${first}-${last}` : ''})`;
}

test('O2 run B until layer2Applied is true', async () => {
  const key = loadGeminiKey();
  if (!key) throw new Error('No Gemini key in scripts/evaluation/.env.local');

  // Layer 1 baseline for the side-by-side, as in section 1.3.
  delete process.env.GEMINI_API_KEY;
  currentDb = createFakeDb(databaseRows());
  const layer1 = await score();

  const { calls, restore } = recordGeminiCalls();
  const attempts: Attempt[] = [];
  try {
    process.env.GEMINI_API_KEY = key;
    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      if (n > 1) await new Promise((r) => setTimeout(r, GAP_MS));
      currentDb = createFakeDb(databaseRows()); // empty cache every attempt
      const before = calls.length;
      const startedAt = new Date().toISOString();
      const result = await score();
      attempts.push({ n, startedAt, ...result, calls: calls.slice(before) });
      if (result.layer2Applied) break;
    }
  } finally {
    restore();
    delete process.env.GEMINI_API_KEY;
  }

  const L: string[] = [];
  L.push(`## 1.3a O2 re-run: run B from an empty cache until Layer 2 was fully applied`);
  L.push('');
  L.push(`Run on ${new Date().toISOString().slice(0, 10)} by \`scripts/evaluation/o2-rerun.eval.ts\`, model \`${modelInUse()}\`. In the full run, O2's cold request reported layer2Applied = false (calls ran past the 8-second timeout), so part of its "Layer 1 + 2" ranking was Layer 1. Here every attempt started from an empty cache, attempts were at least ${GAP_MS / 1000} seconds apart, and the run stopped at the first attempt reporting layer2Applied = true.`);
  L.push('');
  L.push('| Attempt | Started (UTC) | Gemini calls | Call outcomes | layer2Applied | Request time (ms) |');
  L.push('|---|---|---|---|---|---|');
  for (const a of attempts) {
    const outcomes = a.calls.map((c) => `${c.status} (${c.ms} ms)`).join(', ');
    L.push(`| ${a.n} | ${a.startedAt.slice(11, 19)} | ${a.calls.length} | ${outcomes} | ${a.layer2Applied} | ${a.ms} |`);
  }
  L.push('');
  L.push('"error" is a call that never returned an answer: in this harness that is the engine\'s own 8-second abort.');
  L.push('');

  const done = attempts.find((a) => a.layer2Applied);
  if (!done) {
    L.push(`**No attempt reached layer2Applied = true within ${MAX_ATTEMPTS} attempts.** No Layer 1 + 2 ranking with Layer 2 fully applied is reported.`);
    L.push('');
  } else {
    const b = done.ranking;
    L.push(`### O2 ${OUTREACH.title} (k = ${OUTREACH.slots_total}), attempt ${done.n}`);
    L.push('');
    L.push(`- **Precision at ${OUTREACH.slots_total}, Layer 1 only:** ${precision(layer1.ranking)}`);
    L.push(`- **Precision at ${OUTREACH.slots_total}, Layer 1 + Layer 2:** ${precision(b)}; layer2Applied = true`);
    L.push('');
    L.push('Positions of the relevant volunteers (1 = top, out of 72):');
    L.push('');
    L.push('| Volunteer | Layer 1 only | Layer 1 + 2 |');
    L.push('|---|---|---|');
    for (const id of relevant) L.push(`| ${id} | ${cell(layer1.ranking, id)} | ${cell(b, id)} |`);
    L.push('');
    L.push('Top 12 of each ranking side by side (match score in brackets; * = relevant):');
    L.push('');
    L.push('| Position | Layer 1 only | Layer 1 + 2 |');
    L.push('|---|---|---|');
    const mark = (r: Ranked) => `${relevant.includes(r.volunteerId) ? '*' : ''}${r.volunteerId} (${r.matchScore})`;
    for (let i = 0; i < 12; i++) L.push(`| ${i + 1} | ${mark(layer1.ranking[i]!)} | ${mark(b[i]!)} |`);
    L.push('');
  }
  fs.writeFileSync(OUT, L.join('\n'));
});
