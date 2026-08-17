import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { notifyUsers, type UserNotification } from "../../../server/notify";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Request contract
//
//   { outreachId, status: 'completed' | 'cancelled' }
//
// Auth: the caller must be the organisation that owns the outreach.
//
// WHY THESE TWO AND NOT ALL FOUR. Publishing a draft and closing an outreach
// stay on the client's own RLS-governed write (`useUpdateOutreachStatus`):
// they change one column on one row the organisation already owns, and nothing
// else follows from them. These two are different in kind.
//
//   - `cancelled` has to tell people. Notifying every live applicant means
//     reading other users' push tokens and writing rows they own, which no
//     organisation's JWT can do under RLS and which must not half-happen.
//   - `completed` has a precondition the database cannot express as a
//     constraint — the event must actually have finished — and it is the one
//     status an organisation would otherwise be able to set on an event that
//     has not happened yet.
//
// WHAT CANCELLING DOES NOT DO: touch the applications. See the long note in
// 20260815b_cancelled_outreach_rules.sql. `cancelled` on an APPLICATION means
// the volunteer withdrew; writing it here would stamp a withdrawal — and on
// short notice a LATE one, which costs V-Score points — onto every volunteer
// for a decision that was not theirs.
// ---------------------------------------------------------------------------

const Body = z.object({
  outreachId: z.string().uuid(),
  status: z.enum(["completed", "cancelled"]),
  /** Shown to volunteers verbatim when cancelling. Optional; trimmed and capped. */
  reason: z.string().trim().max(300).optional(),
});

export interface OutreachStatusResponse {
  outreachId: string;
  status: "completed" | "cancelled";
  /** Volunteers told about the cancellation. Always 0 for `completed`. */
  notified: number;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await authenticate(req);
    const body = Body.parse(await req.json());
    const admin = getSupabaseAdmin();

    const { data: outreach, error: loadError } = await admin
      .from("outreaches")
      .select("id, title, date, end_time, status, organisation_id")
      .eq("id", body.outreachId)
      .maybeSingle();

    if (loadError) throw Errors.internal("Could not load that outreach.");
    if (!outreach) throw Errors.notFound("That outreach could not be found.");

    // Ownership is checked here rather than left to RLS, because this handler
    // runs on the service-role key and RLS does not apply to it at all.
    if (outreach.organisation_id !== caller.userId) {
      throw Errors.forbidden("You can only manage outreaches your organisation created.");
    }

    if (outreach.status === "cancelled") {
      throw Errors.conflict("This outreach has already been cancelled.");
    }

    if (body.status === "completed") {
      if (outreach.status === "draft") {
        throw Errors.conflict("A draft has not happened yet, so it cannot be completed.");
      }
      if (!hasEnded(outreach.date as string, outreach.end_time as string | null)) {
        throw Errors.conflict("This event has not finished yet.");
      }
      if (outreach.status === "completed") {
        // Idempotent: saying it twice is not an error, it is the same answer.
        return json({ outreachId: outreach.id, status: "completed", notified: 0 });
      }

      const { error } = await admin
        .from("outreaches")
        .update({ status: "completed" })
        .eq("id", outreach.id);
      if (error) throw Errors.internal("Could not mark this outreach completed.");

      // Nothing is notified and nothing closes. Marking an event completed is
      // an archival act: attendance and reviews stay open afterwards, because
      // reviews are filed days later and are what move V-Scores. An organiser
      // who tidies up promptly must not lock themselves out of them.
      return json({ outreachId: outreach.id, status: "completed", notified: 0 });
    }

    // ---- cancelled --------------------------------------------------------
    const { error: cancelError } = await admin
      .from("outreaches")
      .update({ status: "cancelled" })
      .eq("id", outreach.id);
    if (cancelError) throw Errors.internal("Could not cancel this outreach.");

    // Everyone with a live application: accepted, pending and waitlisted
    // alike. Someone still waiting on a decision needs to know it is not
    // coming as much as someone who had a place.
    const { data: applications } = await admin
      .from("applications")
      .select("volunteer_id, status")
      .eq("outreach_id", outreach.id)
      .in("status", ["accepted", "pending", "waitlisted"]);

    const volunteerIds = [...new Set((applications ?? []).map((a) => a.volunteer_id as string))];
    let notifications: UserNotification[] = [];

    if (volunteerIds.length > 0) {
      const { data: tokenRows } = await admin
        .from("push_tokens")
        .select("user_id, expo_push_token")
        .in("user_id", volunteerIds);

      const tokensByUser = new Map<string, string[]>();
      for (const token of tokenRows ?? []) {
        const userId = token.user_id as string;
        tokensByUser.set(userId, [
          ...(tokensByUser.get(userId) ?? []),
          token.expo_push_token as string,
        ]);
      }

      const title = outreach.title as string;
      notifications = volunteerIds.map((volunteerId) => ({
        userId: volunteerId,
        type: "application_status" as const,
        title: "Event cancelled",
        // States the fact and says plainly that it is not about them. A
        // volunteer whose event vanishes will otherwise wonder whether they
        // were dropped.
        body: body.reason
          ? `${title} has been cancelled by the organisation: ${body.reason}`
          : `${title} has been cancelled by the organisation. This is not a decision about your application.`,
        outreachId: outreach.id,
        data: { outreachId: outreach.id, outreachStatus: "cancelled" },
        tokens: tokensByUser.get(volunteerId) ?? [],
      }));

      await notifyUsers(notifications);
    }

    return json({
      outreachId: outreach.id,
      status: "cancelled",
      notified: notifications.length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function json(body: OutreachStatusResponse): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Has the event finished?
 *
 * Ghana is UTC+0 year-round, so the server's UTC clock and the event's local
 * one agree — the same assumption the check-in, reminder and lifecycle passes
 * already make. With no end time, the event is treated as finished once its
 * date is behind us, which is the same rule `hasEventEnded` uses on the client.
 */
function hasEnded(date: string, endTime: string | null): boolean {
  const end = endTime ? `${date}T${endTime.slice(0, 5)}:00Z` : `${date}T23:59:59Z`;
  return new Date(end).getTime() <= Date.now();
}
