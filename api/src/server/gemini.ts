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

/** One call's answer: the pairs Gemini answered in a way that could be checked. */
export interface SkillPairAnswer {
  results: SkillPairResult[];
  /** False when any pair asked for came back missing or failed the check. */
  complete: boolean;
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
/**
 * Pairs per Gemini call. 30, down from 60 (2026-09-25): since every answer
 * copies its pair back (see verifyAnswers), a 60-pair answer is three times
 * longer and was measured at 5.1 to 13.2 s against the 8 s timeout; 30 pairs
 * measured about 3.3 s on every try.
 */
const MAX_PAIRS_PER_CALL = 30;

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
): Promise<SkillPairAnswer | null> {
  if (pairs.length === 0) return { results: [], complete: true };

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
            // See the note at the top of this file. Sent only when configured:
            // the current default model refuses the field (env.ts).
            ...(env.geminiThinkingConfig ? { thinkingConfig: env.geminiThinkingConfig } : {}),
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

    const parsed = JSON.parse(text) as { results?: unknown };
    if (!Array.isArray(parsed.results)) return null;
    return verifyAnswers(capped, parsed.results);
  } catch {
    // Network failure, AbortError (timeout), JSON.parse failure -- anything.
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * The most batches one request may send. 10 x 30 = 300 pairs, sent at the
 * same time, so a request still finishes inside the 8-second Gemini timeout
 * (and Vercel's 10-second ceiling) however many batches it needs.
 */
const MAX_BATCHES_PER_REQUEST = 10;

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
 * Asks Gemini about up to 300 pairs, in batches of 30 sent in parallel.
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
  const results = answers.flatMap((answer) => answer?.results ?? []);

  return {
    results,
    complete: asked === pairs.length && answers.every((answer) => answer !== null && answer.complete),
    calls: batches.length,
  };
}

/**
 * Keeps only the answers that provably belong to the pair they claim.
 *
 * WHY (evaluation finding, owner-approved fix 2026-09-25). The answer used to
 * be a bare list of booleans, matched to the pairs by position. The Chapter
 * Five evaluation found 24 wrong "equivalent" answers out of 802, 13 of them
 * CPR against unrelated skills that sat next to each other in the list: the
 * signature of answers drifting onto the wrong pair, which a bare list cannot
 * reveal. Each answer now carries the pair's number AND both terms copied
 * back, and is used only if all three agree with what was asked. A drifted or
 * garbled answer is dropped rather than applied to somebody else's skills;
 * that pair counts as unanswered (not cached, `complete` false), so the next
 * request asks again.
 */
function verifyAnswers(asked: readonly SkillPair[], answers: readonly unknown[]): SkillPairAnswer {
  const same = (a: unknown, b: string) => typeof a === "string" && a.trim().toLowerCase() === b;
  const byId = new Map<number, boolean>();
  const seen = new Set<number>();
  for (const answer of answers) {
    if (typeof answer !== "object" || answer === null) continue;
    const { id, required, volunteer, match } = answer as Record<string, unknown>;
    if (typeof id !== "number" || !Number.isInteger(id) || id < 0 || id >= asked.length) continue;
    // A second answer for the same id means the list cannot be trusted for it.
    if (seen.has(id)) {
      byId.delete(id);
      continue;
    }
    seen.add(id);
    const pair = asked[id]!;
    if (typeof match === "boolean" && same(required, pair.skillA) && same(volunteer, pair.skillB)) {
      byId.set(id, match);
    }
  }
  const results = asked.flatMap((pair, i) =>
    byId.has(i) ? [{ ...pair, isMatch: byId.get(i) === true }] : []
  );
  return { results, complete: results.length === asked.length };
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
    "Judge every pair on its own; the pairs are unrelated to each other.",
    "Respond with STRICT JSON ONLY, no prose, of the exact shape:",
    '{"results": [{"id": <pair number>, "required": "<required term, copied exactly>", "volunteer": "<volunteer term, copied exactly>", "match": <boolean>}, ...]}',
    `with exactly one object for each of the ${pairs.length} pairs.`,
    "",
    list,
  ].join("\n");
}
