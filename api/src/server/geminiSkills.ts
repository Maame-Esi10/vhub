import { env } from "./env";
import { ALL_SKILLS } from "@/constants/skills";

const GEMINI_TIMEOUT_MS = 6000;

/** Never surface more than this many; the point is a shortlist, not a re-sort. */
const MAX_SUGGESTIONS = 8;

/** Free text longer than this is truncated before it is sent. */
const MAX_DESCRIPTION_CHARS = 1200;

/**
 * What to offer when nothing in the vocabulary matches the TOPIC.
 *
 * WHY THIS EXISTS (owner, 2026-09-15: "returning nothing is not acceptable").
 * A "Mental Health Awareness" outreach produced no suggestions and a message
 * telling the organisation to browse the list -- which is the app shrugging.
 *
 * Two separate faults sat behind that, and both are fixed. The vocabulary
 * genuinely had no mental health entries, so Gemini was right to return
 * nothing; a Mental Health & Wellbeing category now exists. And the empty
 * answer itself was useless, which is this.
 *
 * EVERY OUTREACH NEEDS THESE, whatever its topic: somebody has to register
 * people, manage the queue, explain what is happening and write it down. They
 * are a truthful answer to "we could not match your topic" rather than a
 * filler, and the screen labels them as general rather than as topical.
 */
export const UNIVERSAL_SUPPORT_SKILLS: readonly string[] = [
  'Patient registration',
  'Crowd and queue management',
  'Health education',
  'Data entry',
  'Community mobilisation',
];

/**
 * Ranks the EXISTING skills vocabulary against a piece of free text.
 *
 * WHAT THIS IS FOR, AND WHY IT IS NOT THE OTHER LAYER 2 (owner, 2026-09-15).
 *
 * `gemini.ts` answers "are these two skill strings the same thing?" for the
 * matcher. This answers a different question for a HUMAN filling in a form:
 * "given what this person just wrote, which of our skills are they
 * most likely to want?" An organisation typing "breast cancer screening" should
 * be offered clinical breast examination, patient registration and health
 * education -- none of which any keyword search can find, because "breast
 * cancer" is not a skill in the list and never will be.
 *
 * THREE HARD RULES, and they are enforced here rather than trusted to the
 * model:
 *
 * 1. IT CAN ONLY EVER RETURN SKILLS THAT ALREADY EXIST. The reply is matched
 *    back against ALL_SKILLS and anything unrecognised is dropped. A model that
 *    invents "Mammography reading" gets it silently discarded rather than
 *    offered to an organisation as though the platform supported it.
 * 2. IT RANKS, IT DOES NOT FILTER. The caller puts these at the top of the
 *    picker and leaves the full list underneath. Filtering would let one
 *    sentence permanently narrow what somebody can find.
 * 3. IT NEVER APPLIES ANYTHING. The return value is a suggestion; selection
 *    stays a deliberate tap.
 *
 * NOTHING PERSONALLY IDENTIFYING IS SENT. The prompt carries the free text the
 * user just typed and the fixed vocabulary, and nothing else -- no name, no
 * email, no id. The free text is a description of work, written for publication
 * in the organisation case. That matches what the privacy policy already says
 * about Gemini.
 *
 * Returns `null` on ANY failure, exactly like `checkSkillEquivalences`: no key,
 * network error, timeout, non-2xx, or a reply that is not the shape asked for.
 * Every caller must treat null as "no suggestions this time" and show the
 * ordinary picker, which is what it would have shown anyway.
 */
export async function suggestSkills(description: string): Promise<string[] | null> {
  const text = description.trim().slice(0, MAX_DESCRIPTION_CHARS);
  if (text.length < 10) return [];

  const apiKey = env.geminiApiKey;
  if (!apiKey) {
    /*
      LOGGED, because this is the one failure that is a CONFIGURATION mistake
      rather than weather. Everything else here -- a timeout, a 429, a garbled
      reply -- is transient and expected. A missing key means the feature has
      never worked on this deployment and never will until somebody sets it,
      and the caller deliberately cannot tell the difference, so without a log
      line there is nothing anywhere that says so.

      Not observeError(): that alerts, and an unconfigured optional feature is
      not an incident.
    */
    console.warn("[skill-suggest] GEMINI_API_KEY is not set; returning the universal fallback");
    return null;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(text) }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      /*
        LOGGED WITH ITS STATUS, because the two most likely causes are
        configuration and they are indistinguishable from outside.

        A Google AI Studio key does not expire, so a key that has sat in Vercel
        since August is almost certainly still valid. What DOES go stale is the
        model name: `GEMINI_MODEL` overrides the default, and a retired model
        answers 404 to every request forever. A key whose project never had the
        Generative Language API enabled answers 403, and an exhausted free-tier
        quota answers 429. Those are three different fixes and the caller sees
        one empty array for all of them.

        Not observeError(): a 429 is the free tier working as designed and must
        not page anybody.
      */
      console.warn(
        `[skill-suggest] Gemini returned ${response.status} for model ${env.geminiModel}; falling back`
      );
      return null;
    }

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { skills?: unknown };
    if (!Array.isArray(parsed.skills)) return null;

    const matched = matchBackToVocabulary(parsed.skills);
    /*
      AN EMPTY MATCH RETURNS NULL, NOT THE UNIVERSAL LIST.

      The fallback is now applied in ONE place, the route, so that it can also
      label what it did. Returning the universal skills from here as though
      they had been matched is what let the screen call them "Recommended for
      you" when nothing had been read at all (owner, 2026-09-21: "are the
      recommended based on what I entered or general recommendations? make a
      clear distinction").
    */
    return matched.length > 0 ? matched : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Maps whatever came back onto the real vocabulary, case-insensitively, and
 * drops anything that is not in it.
 *
 * This is the guard that makes rule 1 true. It compares on a normalised form
 * so a model returning "blood pressure measurement" still matches the entry
 * "Blood pressure measurement", while anything genuinely invented finds no
 * entry and disappears. Order is preserved, because the order IS the ranking.
 */
function matchBackToVocabulary(candidates: unknown[]): string[] {
  const byNormalised = new Map(ALL_SKILLS.map((skill) => [skill.trim().toLowerCase(), skill]));
  const seen = new Set<string>();
  const out: string[] = [];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const real = byNormalised.get(candidate.trim().toLowerCase());
    if (!real || seen.has(real)) continue;
    seen.add(real);
    out.push(real);
    if (out.length >= MAX_SUGGESTIONS) break;
  }

  return out;
}

function buildPrompt(description: string): string {
  return [
    "You are helping somebody fill in a form on a medical volunteering platform in Ghana.",
    "",
    "Below is a description of an outreach event or of what a volunteer does, followed by",
    "the platform's FIXED list of skills. Choose the skills from that list that are most",
    "relevant to the description, most relevant first.",
    "",
    "RULES:",
    `- Return at most ${MAX_SUGGESTIONS}.`,
    "- Return ONLY skills copied EXACTLY from the list. Never invent one, never reword one.",
    "- If nothing in the list is relevant, return an empty array.",
    "- Judge relevance by the practical work described, not by matching words.",
    '  "breast cancer screening" implies clinical breast examination, patient registration',
    "  and health education, even though none of those words appear in it.",
    "",
    'Respond with STRICT JSON ONLY, no prose: {"skills": ["<exact skill>", ...]}',
    "",
    "DESCRIPTION:",
    description,
    "",
    "THE FIXED SKILLS LIST:",
    ALL_SKILLS.map((skill) => `- ${skill}`).join("\n"),
  ].join("\n");
}
