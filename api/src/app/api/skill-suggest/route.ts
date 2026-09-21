import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit, enforceUserRateLimit } from "../../../server/rateLimit";
import { suggestSkills, UNIVERSAL_SUPPORT_SKILLS } from "../../../server/geminiSkills";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Which of our existing skills fit what this person just wrote?
//
//   POST { description }  ->  { skills: string[] }
//
// The skills are always a subset of constants/skills.ts, in relevance order,
// and the caller puts them at the TOP of the ordinary picker with the full
// list still underneath. See server/geminiSkills.ts for why this ranks rather
// than filters, and why it can never return a skill that does not exist.
//
// WHY IT IS AN ENDPOINT AND NOT A CLIENT CALL: the Gemini key is a secret and
// lives only in Vercel's environment. CLAUDE.md, hard rule 4.
//
// NO SUGGESTIONS IS A SUCCESS, NOT AN ERROR. Gemini being unconfigured, slow,
// broken or out of quota all return `{ skills: [] }` with a 200, because the
// screen's response to every one of those is identical: show the picker it
// would have shown anyway. A 500 here would put an error on a form that is
// working perfectly well.
// ---------------------------------------------------------------------------

const RequestBody = z.object({
  /** Free text the user has already typed: an outreach description, or what a volunteer does. */
  description: z.string().min(1).max(4000),
});

export async function POST(req: Request): Promise<Response> {
  try {
    // First statement, ahead of reading the body, so a malformed-body flood is
    // still counted. See server/rateLimit.ts.
    enforceIpRateLimit(req);
    const caller = await authenticate(req);

    // Tighter than the 60/min default: every call costs Gemini quota, and the
    // legitimate pattern is one per outreach created and one per volunteer
    // onboarding -- never one per keystroke or per view.
    enforceUserRateLimit(caller.userId, "skill_suggest");

    const json = await req.json().catch(() => {
      throw Errors.badRequest("Body must be JSON.");
    });
    const body = RequestBody.parse(json);

    const skills = await suggestSkills(body.description);

    /*
      UNAVAILABLE FALLS BACK TO THE UNIVERSAL SKILLS, NOT TO NOTHING.

      This is a deliberate change from the rule in CLAUDE.md, which said an
      unavailable Layer 2 returns an empty array because "the screen's response
      to every one of those is identical: show the picker it would have shown
      anyway". That was written before the universal fallback existed, and the
      two rules have quietly contradicted each other ever since.

      The consequence was reported on 2026-09-21: an outreach titled for eye
      screening was told there was no close match, while eight eye and vision
      skills sat in the list. `suggestSkills` applies UNIVERSAL_SUPPORT_SKILLS
      only when Gemini ANSWERS and matches nothing; every genuine failure -- no
      API key, a timeout, a non-2xx, a malformed reply -- returns null and was
      turned into an empty array here. So on a deployment with no Gemini key
      the feature cannot ever produce a suggestion, and says "no close match",
      which is a statement about the vocabulary and is untrue.

      If the honest answer to "we could not match your topic" is the work every
      outreach needs regardless, then it is equally the honest answer to "we
      could not reach Gemini" -- more so, because in that case nothing was
      judged at all. The screen labels these as general rather than topical, so
      nothing here claims they were matched.
    */
    return Response.json({ skills: skills ?? [...UNIVERSAL_SUPPORT_SKILLS] });
  } catch (err) {
    return errorResponse(err, req);
  }
}
