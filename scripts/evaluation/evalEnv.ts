import fs from 'fs';
import path from 'path';

/*
  Shared set-up for the evaluation runs.

  THE GEMINI KEY. It lives only in Vercel. To run the Layer 2 half of the
  evaluation, put it in scripts/evaluation/.env.local as
      GEMINI_API_KEY=...
  That file is gitignored (the repository ignores .env*.local). It is read
  here and never printed.
*/
export function loadGeminiKey(): string | null {
  const file = path.join(__dirname, '.env.local');
  if (!fs.existsSync(file)) return process.env.GEMINI_API_KEY?.trim() || null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/);
    if (match?.[1]) return match[1].replace(/^['"]|['"]$/g, '');
  }
  return null;
}

export interface GeminiCall {
  pairs: { a: string; b: string }[];
  status: number | 'error';
  matches: boolean[] | null;
  ms: number;
}

/**
 * Wraps global fetch so every request to the Gemini API is recorded: which
 * pairs were asked, what came back, how long it took. Other requests pass
 * straight through. The engine's own code is not changed.
 */
export function recordGeminiCalls(): { calls: GeminiCall[]; restore: () => void } {
  const calls: GeminiCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('generativelanguage.googleapis.com')) return original(input, init);

    const body = JSON.parse(String(init?.body ?? '{}')) as { contents?: { parts?: { text?: string }[] }[] };
    const prompt = body.contents?.[0]?.parts?.[0]?.text ?? '';
    const pairs = [...prompt.matchAll(/^\d+\. required="(.*)" vs volunteer="(.*)"$/gm)].map((m) => ({ a: m[1] ?? '', b: m[2] ?? '' }));
    const started = performance.now();
    const call: GeminiCall = { pairs, status: 'error', matches: null, ms: 0 };
    calls.push(call);
    try {
      const response = await original(input, init);
      call.status = response.status;
      const text = await response.clone().text();
      try {
        const payload = JSON.parse(text) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const answer = (payload.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
        const parsed = JSON.parse(answer) as { matches?: unknown };
        if (Array.isArray(parsed.matches)) call.matches = parsed.matches.map((x) => x === true);
      } catch {
        // Recorded as matches: null; the engine makes its own decision.
      }
      return response;
    } finally {
      call.ms = Math.round(performance.now() - started);
    }
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}
