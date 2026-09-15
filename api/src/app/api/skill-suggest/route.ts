import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit, enforceUserRateLimit } from "../../../server/rateLimit";
import { suggestSkills } from "../../../server/geminiSkills";

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

    // null (Layer 2 unavailable) and [] (nothing relevant) are the same answer
    // to the screen, deliberately.
    return Response.json({ skills: skills ?? [] });
  } catch (err) {
    return errorResponse(err, req);
  }
}
