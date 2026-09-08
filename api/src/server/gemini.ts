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

const GEMINI_TIMEOUT_MS = 6000;
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
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
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
