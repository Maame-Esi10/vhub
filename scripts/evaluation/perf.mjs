/*
  PERFORMANCE MEASUREMENTS (report section 5). Nothing here estimates: every
  figure in the report comes from a run recorded in output/performance.json.

  Two kinds of measurement, labelled separately in the report because they
  measure different things:

  A. API timings, measured by THIS SCRIPT from the computer it runs on, over
     the network, against the live API. They time the matching request end to
     end (network + server), which is what the phone waits for, but they are
     NOT measured on the phone.

       node scripts/evaluation/perf.mjs rank_feed warm
       node scripts/evaluation/perf.mjs rank_feed cold
       node scripts/evaluation/perf.mjs rank_feed disabled
       node scripts/evaluation/perf.mjs score_applicants

     Each runs 10 times, 4 seconds apart (the API allows 20 matching calls a
     minute per user).
       warm      run once to fill the cache, then 10 timed runs.
       cold      clears skill_match_cache before EVERY run, so each has to ask
                 Gemini. Needs SUPABASE_SERVICE_ROLE_KEY in .env.local, and
                 DELETES THE LIVE CACHE (it refills itself; nothing else is
                 touched).
       disabled  remove GEMINI_API_KEY from the Vercel project and redeploy
                 first, then run this; put the key back afterwards.

  B. Phone timings, measured BY HAND on the Android release build (see
     README.md for the method) and recorded here:

       node scripts/evaluation/perf.mjs device feed_load 1840 1720 ...

  Then write the report section:
       node scripts/evaluation/perf.mjs report

  Settings, in scripts/evaluation/.env.local (gitignored):
    PERF_VOLUNTEER_EMAIL, PERF_VOLUNTEER_PASSWORD   a volunteer account
    PERF_ORG_EMAIL, PERF_ORG_PASSWORD               an organisation account
    PERF_OUTREACH_ID                                one of that organisation's outreaches, with applicants
    PERF_NETWORK        e.g. "home Wi-Fi, 20 Mbps" (describe the network honestly)
    PERF_DEVICE         e.g. "Samsung Galaxy A14, Android 14" (for the phone timings)
    SUPABASE_SERVICE_ROLE_KEY                       only for the cold series
  The Supabase URL, publishable key and API address are read from the
  project's .env.
*/
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const store = path.join(here, 'output', 'performance.json');

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}
const env = { ...readEnv(path.join(here, '..', '..', '.env')), ...readEnv(path.join(here, '.env.local')) };
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const API = (env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '');

const load = () => (fs.existsSync(store) ? JSON.parse(fs.readFileSync(store, 'utf8')) : { series: [] });
const save = (data) => fs.writeFileSync(store, JSON.stringify(data, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const need = (key) => {
  if (!env[key]) throw new Error(`Set ${key} in scripts/evaluation/.env.local`);
  return env[key];
};

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in failed: HTTP ${res.status}`);
  return (await res.json()).access_token;
}

async function timedMatch(token, body) {
  const started = performance.now();
  const res = await fetch(`${API}/api/match`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ms: Math.round(performance.now() - started), status: res.status, layer2Applied: json.layer2Applied ?? null, results: json.results?.length ?? null };
}

async function clearCache() {
  const key = need('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/skill_match_cache?skill_a=not.is.null`, {
    method: 'DELETE',
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`could not clear the cache: HTTP ${res.status}`);
}

async function apiSeries(name, condition) {
  const isFeed = name === 'rank_feed';
  const token = isFeed
    ? await signIn(need('PERF_VOLUNTEER_EMAIL'), need('PERF_VOLUNTEER_PASSWORD'))
    : await signIn(need('PERF_ORG_EMAIL'), need('PERF_ORG_PASSWORD'));
  const body = isFeed ? { mode: 'rank_feed' } : { mode: 'score_applicants', outreachId: need('PERF_OUTREACH_ID') };

  if (condition === 'warm' || !isFeed) {
    await timedMatch(token, body); // fills the cache; not recorded
    await sleep(4000);
  }
  const runs = [];
  for (let i = 0; i < 10; i++) {
    if (condition === 'cold') await clearCache();
    const r = await timedMatch(token, body);
    runs.push(r);
    console.log(`run ${i + 1}: ${r.ms} ms, HTTP ${r.status}, layer2Applied ${r.layer2Applied}, ${r.results} results`);
    await sleep(4000);
  }
  const data = load();
  data.series.push({
    kind: 'api', name, condition: isFeed ? condition : 'as deployed', at: new Date().toISOString(),
    network: env.PERF_NETWORK ?? 'not stated', api: API, runs,
  });
  save(data);
}

function deviceSeries(name, values) {
  const runs = values.map(Number).filter((n) => Number.isFinite(n)).map((ms) => ({ ms }));
  if (runs.length < 10) throw new Error('Record at least 10 timings.');
  const data = load();
  data.series.push({
    kind: 'device', name, at: new Date().toISOString(),
    device: env.PERF_DEVICE ?? 'not stated', network: env.PERF_NETWORK ?? 'not stated', runs,
  });
  save(data);
}

function report() {
  const data = load();
  const stat = (runs) => {
    const ms = runs.map((r) => r.ms).sort((a, b) => a - b);
    const mid = Math.floor(ms.length / 2);
    const median = ms.length % 2 ? ms[mid] : (ms[mid - 1] + ms[mid]) / 2;
    return { n: ms.length, min: ms[0], median, max: ms[ms.length - 1] };
  };
  const L = [];
  const device = data.series.filter((s) => s.kind === 'device');
  const api = data.series.filter((s) => s.kind === 'api');
  const observations = data.series.filter((s) => s.kind === 'observation');
  L.push('### 5.1 On the Android release build');
  L.push('');
  if (device.length === 0) {
    L.push('No timed measurements (ten or more runs with minimum, median and maximum) were carried out on the device.');
    for (const o of observations) {
      L.push('');
      L.push(`**Observation, not a timed measurement (${o.at.slice(0, 10)}, ${o.device}):** ${o.text}`);
    }
  } else {
    L.push('| Measurement | Device | Network | Date | Runs | Min (ms) | Median (ms) | Max (ms) |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const s of device) {
      const t = stat(s.runs);
      L.push(`| ${s.name} | ${s.device} | ${s.network} | ${s.at.slice(0, 10)} | ${t.n} | ${t.min} | ${t.median} | ${t.max} |`);
    }
  }
  L.push('');
  if (api.length > 0) {
  L.push('### 5.2 API timings, measured from a computer over the network');
  L.push('');
  L.push('These time the whole matching request (network and server) against the live API. They were measured by `scripts/evaluation/perf.mjs` from a computer, **not on the phone**.');
  L.push('');
  if (api.length === 0) {
    L.push('_Not yet measured._');
  } else {
    L.push('| Request | Layer 2 | Network | Date | Runs | Min (ms) | Median (ms) | Max (ms) | layer2Applied in the runs | HTTP |');
    L.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const s of api) {
      const t = stat(s.runs);
      const flags = [...new Set(s.runs.map((r) => String(r.layer2Applied)))].join(', ');
      const statuses = [...new Set(s.runs.map((r) => r.status))].join(', ');
      L.push(`| ${s.name} | ${s.condition} | ${s.network} | ${s.at.slice(0, 10)} | ${t.n} | ${t.min} | ${t.median} | ${t.max} | ${flags} | ${statuses} |`);
    }
  }
  L.push('');
  }
  // 5.3 Supplementary: engine timings recorded by the layer comparison run
  // (output/layers.json). Read from that file, never typed in.
  const layersFile = path.join(here, 'output', 'layers.json');
  if (fs.existsSync(layersFile)) {
    const layers = JSON.parse(fs.readFileSync(layersFile, 'utf8'));
    const cachedOnly = (layers.runs.C ?? []).filter((r) => r.geminiCalls.length === 0);
    const rows = [
      ['Layer 1 only (Gemini off)', layers.runs.A],
      ['Layer 1 + Layer 2, empty cache (cold)', layers.runs.B],
      ['Layer 1 + Layer 2, second run, all requests', layers.runs.C],
      ['Layer 1 + Layer 2, requests answered wholly from the cache (warm)', cachedOnly],
    ].filter(([, runs]) => runs && runs.length);
    L.push('### 5.2 Matching engine timings from the evaluation runs');
    L.push('');
    L.push(`Recorded by \`scripts/evaluation/layers.eval.ts\` on ${layers.ranAt.slice(0, 10)} with model \`${layers.model}\`: the real \`/api/match\` handler (\`score_applicants\`) ranking 72 applicants for one outreach, on the development computer, with real Gemini calls over its internet connection and an in-memory database. These are server-side processing times, not times measured on the phone and not through Vercel. One request per outreach, so fewer than ten per condition.`);
    L.push('');
    L.push('| Condition | Requests | Min (ms) | Median (ms) | Max (ms) | Gemini calls per request | layer2Applied |');
    L.push('|---|---|---|---|---|---|---|');
    for (const [label, runs] of rows) {
      const t = stat(runs);
      L.push(`| ${label} | ${t.n} | ${t.min} | ${t.median} | ${t.max} | ${runs.map((r) => r.geminiCalls.length).join(', ')} | ${runs.map((r) => String(r.layer2Applied)).join(', ')} |`);
    }
    L.push('');
  }
  fs.writeFileSync(path.join(here, 'output', '05-performance.md'), L.join('\n'));
  console.log('wrote output/05-performance.md');
}

const [cmd, arg, ...rest] = process.argv.slice(2);
if (cmd === 'rank_feed' && ['warm', 'cold', 'disabled'].includes(arg)) await apiSeries('rank_feed', arg);
else if (cmd === 'score_applicants') await apiSeries('score_applicants');
else if (cmd === 'device' && arg) deviceSeries(arg, rest);
else if (cmd === 'report') report();
else if (cmd === 'observe' && arg) {
  // An informal observation, recorded as one and never shown as a timing.
  const data = load();
  data.series.push({ kind: 'observation', name: arg, text: rest.join(' '), at: new Date().toISOString(), device: env.PERF_DEVICE || 'device not stated', runs: [] });
  save(data);
}
else console.log('usage: see the comment at the top of scripts/evaluation/perf.mjs');
