import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit } from "../../../server/rateLimit";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { assertCronSecret, sendEventReminders } from "../../../server/eventReminders";
import { sendCheckinReminders } from "../../../server/checkinReminders";
import { escalateUnderSubscribedOutreaches } from "../../../server/underSubscription";
import { closeAndResolvePastOutreaches } from "../../../server/outreachLifecycle";
import { sweepExpiredNotifications } from "../../../server/notificationRetention";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Request contract -- two user actions plus the cron ones:
//
//   "register": the signed-in user (volunteer or organisation) registers an
//   Expo push token for their own device. JWT-authed.
//
//   "send-event-reminders": the same 24-hour reminder scan as
//   GET /api/cron/event-reminders (see that route for the real Vercel Cron
//   target -- Cron Jobs can only invoke GET routes). Exposed here as a POST
//   action too purely so it can be exercised manually with the same
//   CRON_SECRET bearer token used for testing, without waiting for the
//   schedule.
//
// The other two push triggers CLAUDE.md/the brief lists ("new high-match
// outreach" and "application status change") are dispatched IN-PROCESS by
// /api/match (notify_candidates mode) and /api/application-status
// respectively, via the same shared expoPush.ts helper -- not by the mobile
// app calling this route, since "push an arbitrary user" is not something a
// normal user JWT should be able to trigger for someone else. See the final
// report's "what I assumed" section.
// ---------------------------------------------------------------------------

const RegisterAction = z.object({
  action: z.literal("register"),
  expoPushToken: z.string().min(10),
});

const SendEventRemindersAction = z.object({
  action: z.literal("send-event-reminders"),
});

/**
 * Fires the "remember to scan the check-in code" pass on demand.
 *
 * This is not only a test hook. The Hobby plan's single daily cron can only
 * reach volunteers on the MORNING of their event; invoking this late in the
 * day is what produces an actual "before you leave" nudge, and the pass skips
 * anyone who has already scanned, so a late run chases exactly the people
 * still missing. Cron-secret protected like the reminder action above — it
 * pushes to other users, which no ordinary session may do.
 */
const SendCheckinRemindersAction = z.object({
  action: z.literal("send-checkin-reminders"),
});

/**
 * Fires the under-subscription escalation (7 / 3 / 1 days out) on demand.
 *
 * Same rationale as the two above: it notifies other users, so it is
 * cron-secret protected rather than session-authenticated. Useful for
 * demonstrating the ladder without waiting for an outreach to be exactly seven
 * days away — and it is idempotent, since each stage is deduped by the
 * notification rows it wrote.
 */
const EscalateUnderSubscribedAction = z.object({
  action: z.literal("escalate-under-subscribed"),
});

/**
 * Closes outreaches whose date has passed and resolves their unanswered
 * applications. Cron-secret protected like the passes above — it writes other
 * people's applications and notifies them. Idempotent.
 */
const CloseAndResolveAction = z.object({
  action: z.literal("close-past-outreaches"),
});

/**
 * Runs the notification retention sweep on demand.
 *
 * The real window is six months, so on the live database this pass will find
 * nothing to do until well into 2027 — which would leave a destructive job
 * completely unexercised for months. `dryRun` (with an optional shorter
 * `retentionDays`) is how it gets checked now: it reports exactly what it would
 * remove and removes nothing. `retentionDays` is IGNORED unless `dryRun` is
 * true, so this action can never be used to shorten the real window.
 *
 * Cron-secret protected like the passes above: it deletes other people's rows.
 */
const SweepNotificationsAction = z.object({
  action: z.literal("sweep-notifications"),
  dryRun: z.boolean().optional(),
  retentionDays: z.number().int().min(0).max(3650).optional(),
});

const NotificationsRequestBody = z.discriminatedUnion("action", [
  RegisterAction,
  SendEventRemindersAction,
  SendCheckinRemindersAction,
  EscalateUnderSubscribedAction,
  CloseAndResolveAction,
  SweepNotificationsAction,
]);

export async function POST(req: Request): Promise<Response> {
  try {
    // First, ahead of validation and of authentication, so a flood is refused
    // before this project spends anything on it. Counted once per request
    // however many times it is called -- see server/rateLimit.ts.
    enforceIpRateLimit(req);
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = NotificationsRequestBody.parse(json);

    if (body.action === "send-event-reminders") {
      assertCronSecret(req);
      return Response.json(await sendEventReminders());
    }

    if (body.action === "send-checkin-reminders") {
      assertCronSecret(req);
      return Response.json(await sendCheckinReminders());
    }

    if (body.action === "escalate-under-subscribed") {
      assertCronSecret(req);
      return Response.json(await escalateUnderSubscribedOutreaches());
    }

    if (body.action === "close-past-outreaches") {
      assertCronSecret(req);
      return Response.json(await closeAndResolvePastOutreaches());
    }

    if (body.action === "sweep-notifications") {
      assertCronSecret(req);
      return Response.json(
        await sweepExpiredNotifications({
          dryRun: body.dryRun,
          retentionDays: body.retentionDays,
        })
      );
    }

    // "register" is the only ordinary user action left. The test-dispatch
    // action was removed on 2026-09-23, once push was confirmed working on a
    // real device: it existed to tell four identical-looking faults apart,
    // and the fault turned out to be an FCM service-account key that was
    // uploaded to EAS but never ASSIGNED to the app.
    const caller = await authenticate(req);

    return Response.json(await registerToken(caller.userId, body.expoPushToken));
  } catch (err) {
    return errorResponse(err, req);
  }
}

// ---------------------------------------------------------------------------
// action: register
// ---------------------------------------------------------------------------

async function registerToken(userId: string, expoPushToken: string) {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("push_tokens")
    .upsert({ user_id: userId, expo_push_token: expoPushToken }, { onConflict: "user_id,expo_push_token" });
  if (error) throw Errors.internal("Could not register this push token.");
  return { registered: true };
}

