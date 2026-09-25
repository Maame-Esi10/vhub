import { env } from "./env";

export interface SkillPair {
  /** Already-normalised (trim + lowercase) skill string from the outreach's required_skills. */
  skillA: string;
  /** Already-normalised (trim + lowercase) skill string from a volunteer's skill_tags. */
  skillB: string;
}

export interface SkillPairResult extends SkillPair {
  isMatch: boolean;
}

/**
 * WHY THINKING IS TURNED OFF, AND WHY THE TIMEOUT MOVED (2026-09-21).
 *
 * The owner's Gemini key and project were verified working, `gemini-2.5-flash`
 * was verified available, and no GEMINI_MODEL override existed -- yet the
 * skill suggestions reported "no close match", which is only reachable when
 * this layer returns null. So the call was failing, and the model listing
 * showed why: gemini-2.5-flash has `"thinking": true`.
 *
 * That breaks this code in two independent ways, either of which is enough.
 *
 * 1. LATENCY. A thinking model reasons before it answers, and these prompts
 *    carry the whole skills vocabulary. Six seconds is a plausible budget for
 *    a non-thinking flash model and a poor one here, so the abort fired and
 *    the caller saw a silent null.
 * 2. THE RESPONSE SHAPE. With thinking, `candidates[0].content.parts` can hold
 *    more than the answer, and this read `parts[0].text` -- so even a fast,
 *    successful response could yield a thought rather than the JSON, and
 *    JSON.parse would throw into the catch that returns null.
 *
 * `thinkingBudget: 0` disables it. That is the right call on the merits, not
 * just a workaround: both jobs here are closed-vocabulary selection against an
 * explicit list, which is exactly the kind of task reasoning tokens do not
 * improve, and they cost latency and quota on a free tier shared by every user.
 *
 * The parts are now joined rather than indexed, so a model that does return
 * several still parses.
 */
// Raised from 6s. Kept under Vercel's 10s Hobby function ceiling, so this
// aborts and falls back rather than the whole request timing out.
const GEMINI_TIMEOUT_MS = 8000;

/**
 * All the text parts, joined.
 *
 * `parts[0].text` was the old read, and a model that returns a thought part
 * before its answer makes that the wrong part. Joining is correct whether
 * there is one part or several, and returns null rather than an empty string
 * when there is nothing, so the caller's existing falsy check still works.
 */
function joinTextParts(
  candidates: { content?: { parts?: { text?: string }[] } }[] | undefined
): string | null {
  const parts = candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  return text.length > 0 ? text : null;
}
/** Hard cap on pairs sent in a single Gemini call -- keeps prompts small and the ~1,500/day free-tier quota healthy. */
const MAX_PAIRS_PER_CALL = 60;

/**
 * Asks Gemini Flash whether each (required-skill, volunteer-skill) pair is a
 * semantically equivalent clinical/health skill (e.g. "venipuncture" ~=
 * "blood draw"). Layer 2, and Layer 2 ONLY -- never called from lib/matching/layer1.ts.
 *
 * CLAUDE.md, hard rule: "Matching must never halt... Layer 2 only enriches
 * the skills component and silently falls back to Layer 1 on any error or
 * quota exhaustion." This function is the enforcement point for that rule:
 * it NEVER throws. Any problem at all -- missing/invalid API key, network
 * error, timeout (aborted after GEMINI_TIMEOUT_MS), a non-2xx response
 * (including 429 quota-exhausted / rate-limited), or a response that isn't
 * the exact JSON shape asked for -- resolves to `null`, which every caller
 * must treat as "Layer 2 unavailable this time, use pure Layer 1."
 */
export async function checkSkillEquivalences(
  pairs: readonly SkillPair[]
): Promise<SkillPairResult[] | null> {
  if (pairs.length === 0) return [];

  const apiKey = env.geminiApiKey;
  if (!apiKey) return null; // Layer 2 not configured for this deployment.

  const capped = pairs.slice(0, MAX_PAIRS_PER_CALL);

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(capped) }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            // See the note at the top of this file: closed-vocabulary
            // selection gains nothing from reasoning tokens and pays for them
            // in latency and quota.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      // Includes 429 (rate limit / daily quota exhausted) and any 4xx/5xx --
      // all treated identically per the "silently fall back" rule.
      return null;
    }

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = joinTextParts(payload.candidates);
    if (!text) return null;

    const parsed = JSON.parse(text) as { matches?: unknown };
    const matches = parsed.matches;
    if (!Array.isArray(matches) || matches.length !== capped.length) {
      return null;
    }

    return capped.map((pair, i) => ({ ...pair, isMatch: matches[i] === true }));
  } catch {
    // Network failure, AbortError (timeout), JSON.parse failure -- anything.
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * The most batches one request may send. 5 x 60 = 300 pairs, sent at the
 * same time, so a request still finishes inside the 8-second Gemini timeout
 * (and Vercel's 10-second ceiling) however many batches it needs.
 */
const MAX_BATCHES_PER_REQUEST = 5;

export interface BatchedEquivalenceResult {
  /** Every pair Gemini answered, from every batch that succeeded. */
  results: SkillPairResult[];
  /**
   * True only when EVERY pair asked for was answered. False when a batch
   * failed or pairs were left over past the batch limit.
   */
  complete: boolean;
  /** How many Gemini calls were made. */
  calls: number;
}

/**
 * Asks Gemini about ANY number of pairs, in batches of 60 sent in parallel.
 *
 * WHY THIS EXISTS (evaluation finding, owner-approved fix 2026-09-25).
 * `checkSkillEquivalences` sends at most 60 pairs. Its only caller used to
 * hand it every uncached pair in one go, so a request needing 175 judgements
 * had 60 answered and 115 silently treated as "not equivalent", while the
 * response still said layer2Applied: true. The Chapter Five evaluation
 * measured it: each test outreach needed 173 to 176 pairs.
 *
 * WHY PARALLEL, NOT ONE AFTER ANOTHER. Each call may take up to the 8-second
 * timeout, and Vercel stops a free-tier function at 10 seconds; three calls in
 * a row could not finish. In parallel the request takes as long as its
 * slowest batch.
 *
 * NEVER THROWS, and a failed batch only loses its own pairs: the batches that
 * succeeded are still returned (and cached by the caller), and `complete`
 * turns false so the caller reports Layer 2 as not fully applied.
 */
export async function checkSkillEquivalencesBatched(
  pairs: readonly SkillPair[]
): Promise<BatchedEquivalenceResult> {
  if (pairs.length === 0) return { results: [], complete: true, calls: 0 };

  const batches: SkillPair[][] = [];
  for (let i = 0; i < pairs.length && batches.length < MAX_BATCHES_PER_REQUEST; i += MAX_PAIRS_PER_CALL) {
    batches.push(pairs.slice(i, i + MAX_PAIRS_PER_CALL));
  }
  const asked = batches.reduce((n, batch) => n + batch.length, 0);

  const answers = await Promise.all(batches.map((batch) => checkSkillEquivalences(batch)));
  const results = answers.flatMap((answer) => answer ?? []);

  return {
    results,
    complete: asked === pairs.length && answers.every((answer) => answer !== null),
    calls: batches.length,
  };
}

function buildPrompt(pairs: readonly SkillPair[]): string {
  const list = pairs
    .map((pair, i) => `${i}. required="${pair.skillA}" vs volunteer="${pair.skillB}"`)
    .join("\n");

  return [
    "You are checking whether pairs of health/medical skill terms describe the same practical skill",
    '(e.g. "venipuncture" and "blood draw" ARE the same skill; "wound care" and "wound dressing" ARE the same skill;',
    '"venipuncture" and "wound care" are NOT the same skill).',
    "",
    `For each of the ${pairs.length} numbered pairs below, decide true (equivalent) or false (not equivalent).`,
    "Respond with STRICT JSON ONLY, no prose, of the exact shape:",
    `{"matches": [<boolean>, ...]} with exactly ${pairs.length} booleans, in the same order as the pairs.`,
    "",
    list,
  ].join("\n");
}
