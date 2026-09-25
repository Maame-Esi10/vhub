import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit } from "../../../server/rateLimit";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { alertAdmins } from "../../../server/adminAlerts";

export const runtime = "nodejs";

/**
 * Emails the admins that a dispute has just been raised.
 *
 * WHY A SEPARATE CALL. A dispute is filed by a plain client insert (see
 * hooks/useDisputes.ts: nothing about filing needs a secret), so no server
 * code runs when one arrives, and email needs the server. The app calls this
 * straight after a successful insert. Filing does not depend on it: if this
 * fails the dispute is still recorded and still waits in the Disputes tab.
 *
 * WHY IT CANNOT BE USED TO SPAM THE ADMINS. It emails only about a dispute
 * that exists, was raised by the caller, is still open, and was raised in the
 * last fifteen minutes; and each dispute is announced at most once per server
 * instance. A crafted loop can therefore produce, at worst, one email per real
 * dispute the caller was entitled to raise anyway, on top of the per-IP rate
 * limit every endpoint has.
 */

const Body = z.object({ disputeId: z.string().uuid() });

const FRESH_FOR_MS = 15 * 60 * 1000;
const announced = new Set<string>();

export async function POST(req: Request): Promise<Response> {
  try {
    enforceIpRateLimit(req);
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = Body.parse(json);
    const caller = await authenticate(req);
    const admin = getSupabaseAdmin();

    const { data: dispute } = await admin
      .from("disputes")
      .select("id, volunteer_id, type, status, created_at, outreach:outreaches (title)")
      .eq("id", body.disputeId)
      .maybeSingle();

    if (!dispute || dispute.volunteer_id !== caller.userId) {
      throw Errors.notFound("Dispute not found.");
    }

    const fresh = Date.now() - new Date(dispute.created_at as string).getTime() < FRESH_FOR_MS;
    if (dispute.status !== "open" || !fresh || announced.has(dispute.id as string)) {
      return Response.json({ alerted: false });
    }
    announced.add(dispute.id as string);

    const { data: person } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", caller.userId)
      .maybeSingle();

    // PostgREST returns a to-one embed as an object, but its generated type
    // can be an array; read either shape.
    const outreachEmbed = dispute.outreach as { title: string } | { title: string }[] | null;
    const outreachTitle = Array.isArray(outreachEmbed) ? outreachEmbed[0]?.title : outreachEmbed?.title;
    const about = dispute.type === "attendance" ? "an attendance record" : "a review";

    await alertAdmins({
      kind: "dispute",
      subjectName: (person?.full_name as string | undefined) ?? "A volunteer",
      detail: outreachTitle
        ? `It is about ${about} for the outreach "${outreachTitle}".`
        : `It is about ${about}.`,
    });

    return Response.json({ alerted: true });
  } catch (err) {
    return errorResponse(err, req);
  }
}
