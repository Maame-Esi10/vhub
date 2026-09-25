import fs from 'fs';
import path from 'path';
import { createFakeDb, type FakeDb } from './fakeSupabase';
import { databaseRows, outreachUuid } from './dataset';

/*
  RESEARCH QUESTION 3: does matching survive every way Layer 2 can fail?

  The real /api/match route (score_applicants, outreach O1, 72 applicants) is
  called once with no Gemini key (the Layer 1 baseline) and then once per
  failure, with a key set and the Gemini request answered by a stand-in that
  fails in one specific way. The stand-in replaces only the network call to
  Google; the engine's own code is unchanged.
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

const OUT = path.join(__dirname, 'output', '02-failure.md');

type Behaviour = (init?: RequestInit) => Promise<Response>;

const geminiBody = (answer: string) =>
  JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }] });

const CASES: { name: string; how: string; behaviour: Behaviour }[] = [
  {
    name: 'Network error',
    how: 'the request rejects with TypeError("fetch failed"), as when there is no connection',
    behaviour: async () => {
      throw new TypeError('fetch failed');
    },
  },
  {
    name: 'Timeout over 8000 ms',
    how: 'the request never answers; only the engine\'s own 8000 ms abort ends it',
    behaviour: (init) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
  },
  {
    name: 'HTTP 429',
    how: 'Gemini answers 429 Too Many Requests (quota exhausted)',
    behaviour: async () => new Response('{"error":{"code":429}}', { status: 429 }),
  },
  {
    name: 'HTTP 500',
    how: 'Gemini answers 500 Internal Server Error',
    behaviour: async () => new Response('{"error":{"code":500}}', { status: 500 }),
  },
  {
    name: 'Malformed JSON',
    how: 'HTTP 200, but the model\'s answer is not valid JSON',
    behaviour: async () => new Response(geminiBody('{"matches": [true, false,'), { status: 200 }),
  },
  {
    name: 'Matches list of the wrong length',
    how: 'HTTP 200 and valid JSON, but one boolean fewer than the pairs asked',
    behaviour: async (init) => {
      const prompt = String(JSON.parse(String(init?.body)).contents[0].parts[0].text);
      const asked = [...prompt.matchAll(/^\d+\. required=/gm)].length;
      return new Response(geminiBody(JSON.stringify({ matches: Array(Math.max(0, asked - 1)).fill(true) })), {
        status: 200,
      });
    },
  },
];

interface Outcome {
  status: number;
  layer2Applied: boolean;
  ranking: { volunteerId: string; matchScore: number }[];
  ms: number;
}

async function score(): Promise<Outcome> {
  currentDb = createFakeDb(databaseRows()); // fresh each time: empty cache
  const started = performance.now();
  const response = await POST(
    new Request('http://eval.local/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer eval' },
      body: JSON.stringify({ mode: 'score_applicants', outreachId: outreachUuid('O1') }),
    })
  );
  const ms = Math.round(performance.now() - started);
  const body = (await response.json()) as { layer2Applied: boolean; results: { volunteerId: string; matchScore: number }[] };
  return {
    status: response.status,
    layer2Applied: body.layer2Applied,
    ranking: body.results.map((r) => ({ volunteerId: r.volunteerId, matchScore: r.matchScore })),
    ms,
  };
}

test('forced Layer 2 failures', async () => {
  const original = globalThis.fetch;
  const rows: string[] = [];
  try {
    delete process.env.GEMINI_API_KEY;
    const baseline = await score();
    const applicants = databaseRows().volunteer_profiles.length;

    process.env.GEMINI_API_KEY = 'evaluation-dummy-key';
    for (const c of CASES) {
      let geminiCalls = 0;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes('generativelanguage.googleapis.com')) return original(input, init);
        geminiCalls += 1;
        return c.behaviour(init);
      }) as typeof fetch;

      const outcome = await score();
      const complete =
        outcome.ranking.length === applicants &&
        new Set(outcome.ranking.map((r) => r.volunteerId)).size === applicants;
      const identical = JSON.stringify(outcome.ranking) === JSON.stringify(baseline.ranking);
      rows.push(
        `| ${c.name} | ${c.how} | ${geminiCalls} | HTTP ${outcome.status}, ${outcome.ranking.length} results | ${complete ? 'yes' : 'NO'} | ${identical ? 'yes' : 'NO'} | ${outcome.layer2Applied} | ${outcome.ms} |`
      );
    }

    const L: string[] = [];
    L.push(`Run on ${new Date().toISOString().slice(0, 10)} by \`scripts/evaluation/failure.eval.ts\`. The real \`/api/match\` route (\`score_applicants\`, outreach O1, ${applicants} applicants) was called first with no Gemini key, giving the Layer 1 baseline (HTTP ${baseline.status}, ${baseline.ranking.length} results, layer2Applied = ${baseline.layer2Applied}, ${baseline.ms} ms). It was then called once per failure below, with a key set and the request to Google answered by a stand-in that fails in that way. The cache was empty each time, so every run had to ask Gemini. "Identical" compares every volunteer's position and match score with the baseline.`);
    L.push('');
    L.push('| Failure | How it was produced | Gemini requests attempted | Engine returned | Ranking complete | Identical to Layer 1 | layer2Applied | Request time (ms) |');
    L.push('|---|---|---|---|---|---|---|---|');
    L.push(...rows);
    L.push('');
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, L.join('\n'));
  } finally {
    globalThis.fetch = original;
    delete process.env.GEMINI_API_KEY;
  }
});
