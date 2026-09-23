import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit } from "../../../server/rateLimit";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { assertAdmin, recordAdminAction } from "../../../server/adminAudit";
import { notifyUsers } from "../../../server/notify";
import { stopOrganisation, stopVolunteer } from "../../../server/accountStop";

export const runtime = "nodejs";

/**
 * Suspend, ban, or reinstate an account.
 *
 * THE GOVERNING PRINCIPLE, and every decision below follows from it:
 * SUSPENSION STOPS FUTURE ACTIVITY AND NEVER REWRITES THE PAST. Attendance
 * that happened happened. Reviews that were written stay written. A V-Score
 * keeps meaning what it meant. What stops is what has not happened yet.
 *
 * The consequences are not symmetrical, because the two roles hold different
 * things:
 *
 *  - An ORGANISATION holds other people's Saturdays. Suspending it cancels its
 *    open events and tells everyone who was accepted, because a volunteer who
 *    turns up to a cancelled clinic has lost a day to our silence.
 *  - A VOLUNTEER holds a place someone else could have had. Suspending them
 *    withdraws their applications and hands each accepted place to the
 *    waitlist, through the SAME promotion the volunteer's own cancellation
 *    uses — so the organisation is not left short.
 *
 * REINSTATEMENT RESTORES FUTURE ACTIVITY ONLY. It does not resurrect cancelled
 * outreaches or withdrawn applications, and that is deliberate rather than
 * lazy: the people affected were told those things were off, and quietly
 * un-telling them days later is worse than leaving them off. The account can
 * post and apply again from the moment it is reinstated.
 */

const Body = z.object({
  targetUserId: z.string().uuid(),
  action: z.enum(["suspend", "ban", "reinstate"]),
  reason: z.string().trim().min(3).max(1000),
});



export async function POST(req: Request): Promise<Response> {
  try {
    // First, ahead of validation and of authentication, so a flood is refused
    // before this project spends anything on it. Counted once per request
    // however many times it is called -- see server/rateLimit.ts.
    enforceIpRateLimit(req);
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = Body.parse(json);

    const caller = await authenticate(req);
    assertAdmin(caller);

    if (body.targetUserId === caller.userId) {
      // Not a hypothetical: the admin queues list accounts, and an admin who
      // suspended themselves could not reinstate themselves, because doing so
      // requires being an active admin.
      throw Errors.badRequest("You cannot moderate your own account.");
    }

    const admin = getSupabaseAdmin();
    const { data: target } = await admin
      .from("profiles")
      .select("id, role, full_name, moderation_state")
      .eq("id", body.targetUserId)
      .maybeSingle();

    if (!target) throw Errors.notFound("Account not found.");
    if (target.role === "admin") {
      // An admin removing another admin is a governance question, not a
      // moderation one, and it belongs in the database where admin creation
      // already lives.
      throw Errors.forbidden("Admin accounts are managed in the database, not here.");
    }

    const previousState = target.moderation_state as string;
    const nextState =
      body.action === "reinstate" ? "active" : body.action === "ban" ? "banned" : "suspended";

    if (previousState === nextState) {
      throw Errors.conflict(`This account is already ${nextState}.`);
    }
    if (previousState === "banned" && body.action === "suspend") {
      throw Errors.badRequest("This account is banned. Reinstate it first if that was wrong.");
    }

    const effects: Record<string, unknown> = { previousState, nextState };

    /*
      STOP THE FUTURE FIRST, THEN MARK THE ACCOUNT. The order is load-bearing
      and it used to be the other way round.

      `refuse_outreach_from_unverified_org` is a trigger on `outreaches`, and a
      trigger fires for the service role as well (the service key bypasses RLS,
      not triggers). Its very first test raises when the owning organisation's
      `moderation_state` is anything but `active` -- before the
      status-unchanged exit and before the draft exception. So writing
      `suspended` first made the organisation's own outreaches uncancellable a
      moment later: every cancellation was refused, the events stayed `open` in
      the feed and open to new applications, and `stopOrganisation` went on to
      push and email everyone holding a place to say the event would no longer
      take place.

      Stopping first also fails in the safer direction generally: if the state
      write below fails, an account has had its events cancelled but is still
      live and can be acted on again, which is recoverable. The reverse left a
      suspended account whose events were never stopped. It is the same
      argument account closure already makes for revoking the login last.
    */
    if (body.action !== "reinstate") {
      if (target.role === "organisation") {
        Object.assign(effects, await stopOrganisation(admin, body.targetUserId, body.reason));
      } else {
        Object.assign(effects, await stopVolunteer(admin, body.targetUserId));
      }
    }

    const { error: stateError } = await admin
      .from("profiles")
      .update({
        moderation_state: nextState,
        // Cleared on reinstatement: the reason describes the CURRENT state, and
        // leaving a stale one would show a reinstated account a note saying why
        // it is suspended. The history is in admin_actions and is untouched.
        moderation_reason: body.action === "reinstate" ? null : body.reason,
        moderated_at: new Date().toISOString(),
      })
      .eq("id", body.targetUserId);

    if (stateError) throw Errors.internal("Could not change this account's status.");

    await recordAdminAction(caller, {
      targetType: target.role === "organisation" ? "organisation" : "volunteer",
      targetId: body.targetUserId,
      action:
        body.action === "reinstate"
          ? "reinstated account"
          : body.action === "ban"
            ? "banned account"
            : "suspended account",
      reason: body.reason,
      payload: effects,
    });

    // The account is told, always. A suspension nobody explains is
    // indistinguishable from the app being broken, and someone in that position
    // will keep trying and then write to us.
    const { data: tokens } = await admin
      .from("push_tokens")
      .select("expo_push_token")
      .eq("user_id", body.targetUserId);

    await notifyUsers([
      {
        userId: body.targetUserId,
        type: "application_status",
        title:
          body.action === "reinstate"
            ? "Your account is active again"
            : body.action === "ban"
              ? "Your account has been closed"
              : "Your account has been suspended",
        body:
          body.action === "reinstate"
            ? "You can use VHub normally again. Anything cancelled while you were suspended stays cancelled."
            : body.reason,
        data: { kind: "moderation", state: nextState },
        tokens: (tokens ?? []).map((t) => t.expo_push_token as string),
      },
    ]);

    return Response.json({ moderationState: nextState, ...effects });
  } catch (err) {
    return errorResponse(err, req);
  }
}

/**
 * An organisation's future stops: its live events are cancelled and everyone
 * who was accepted is told, by push and by email.
 *
 * `completed` and already-`cancelled` events are left alone — they are the past,
 * and the past is not rewritten. `draft` is left alone too: nobody was ever
 * shown it, so there is nothing to cancel and nobody to tell.
 */

