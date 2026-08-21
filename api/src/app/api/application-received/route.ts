import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { notifyUsers } from "../../../server/notify";

export const runtime = "nodejs";

/**
 * Tells an organisation that somebody has applied to one of its outreaches.
 *
 * WHY THIS EXISTS. Every other notification in the app flows organisation ->
 * volunteer. Nothing flowed the other way, so an organisation learned about a
 * new applicant only by opening the vetting screen and noticing the count had
 * changed -- which is no way to run a clinic that needs six nurses by Saturday.
 *
 * WHY IT IS A SEPARATE ENDPOINT rather than a database trigger. A trigger could
 * insert the notification row reliably, but Postgres cannot call Expo, so the
 * organisation would get an in-app row and no push -- the half that actually
 * reaches them. Doing it here gets both. The cost is that a client which dies
 * between applying and calling this sends no notification; that is acceptable
 * in a way the application/day-commitment split was not, because a missed
 * notification loses nothing recoverable. The application itself is already
 * safely written by `apply_to_outreach()` before this is ever called.
 *
 * WHY A VOLUNTEER'S JWT MAY TRIGGER A PUSH TO SOMEONE ELSE. /api/notifications
 * deliberately refuses to let one user push another, and this does not weaken
 * that: the caller names an APPLICATION, not a recipient. The server checks the
 * application is the caller's own, derives the organisation from the outreach,
 * and writes the title and body itself. There is no field through which a
 * caller can choose who hears from them or what it says.
 *
 * The notification's `type` is `application_status` and NOT a new enum value,
 * because `notifications.type` is a CHECK constraint and widening it is a
 * schema change. `data.kind = 'new_application'` distinguishes it for
 * tap-routing -- the same no-schema-change technique the check-in reminders use
 * for `stage`.
 */

const ApplicationReceivedBody = z.object({
  applicationId: z.string().uuid(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = ApplicationReceivedBody.parse(json);

    const caller = await authenticate(req);
    const admin = getSupabaseAdmin();

    const { data: application, error: applicationError } = await admin
      .from("applications")
      .select("id, outreach_id, volunteer_id, type")
      .eq("id", body.applicationId)
      .maybeSingle();
    if (applicationError) throw Errors.internal("Could not load the application.");
    if (!application) throw Errors.notFound("Application not found.");

    // The caller must be the applicant. Without this, any signed-in user could
    // announce anyone else's application.
    if (application.volunteer_id !== caller.userId) {
      throw Errors.forbidden("You can only announce your own application.");
    }

    const { data: outreach, error: outreachError } = await admin
      .from("outreaches")
      .select("id, organisation_id, title")
      .eq("id", application.outreach_id)
      .maybeSingle();
    if (outreachError || !outreach) throw Errors.notFound("Outreach not found.");

    /*
      Deduped on the application id, because this is called from a mobile client
      that may retry. Re-applying after a withdrawal reactivates the SAME
      application row, so a second genuine application by the same volunteer to
      the same outreach is deliberately silent rather than a repeat alert --
      the organisation already has them in the queue.
    */
    const { data: existing } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", outreach.organisation_id)
      .eq("data->>applicationId", body.applicationId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return Response.json({ notified: false, reason: "already_sent" });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", application.volunteer_id)
      .maybeSingle();
    const applicantName = (profile?.full_name as string | null) ?? "A volunteer";

    const { data: tokens } = await admin
      .from("push_tokens")
      .select("expo_push_token")
      .eq("user_id", outreach.organisation_id);

    // Quick Join and a Full Application are different amounts of reading for
    // the organisation, so the notification says which arrived.
    const kindLabel = application.type === "quick_join" ? "quick joined" : "applied to";

    await notifyUsers([
      {
        userId: outreach.organisation_id as string,
        type: "application_status",
        title: "New applicant",
        body: `${applicantName} ${kindLabel} ${outreach.title}.`,
        outreachId: outreach.id as string,
        data: {
          kind: "new_application",
          applicationId: body.applicationId,
          outreachId: outreach.id,
        },
        tokens: (tokens ?? []).map((t) => t.expo_push_token as string),
      },
    ]);

    return Response.json({ notified: true });
  } catch (err) {
    return errorResponse(err);
  }
}
