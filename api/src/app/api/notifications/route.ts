import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { dispatchExpoPush } from "../../../server/expoPush";
import { assertCronSecret, sendEventReminders } from "../../../server/eventReminders";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Request contract -- three actions:
//
//   "register": the signed-in user (volunteer or organisation) registers an
//   Expo push token for their own device. JWT-authed.
//
//   "test-dispatch": sends a push to the CALLER's own registered token(s),
//   for manual QA (see the curl example in the final report). JWT-authed,
//   and deliberately cannot target anyone else.
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

const TestDispatchAction = z.object({
  action: z.literal("test-dispatch"),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(400),
});

const SendEventRemindersAction = z.object({
  action: z.literal("send-event-reminders"),
});

const NotificationsRequestBody = z.discriminatedUnion("action", [
  RegisterAction,
  TestDispatchAction,
  SendEventRemindersAction,
]);

export async function POST(req: Request): Promise<Response> {
  try {
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = NotificationsRequestBody.parse(json);

    if (body.action === "send-event-reminders") {
      assertCronSecret(req);
      return Response.json(await sendEventReminders());
    }

    // "register" and "test-dispatch" are ordinary user actions.
    const caller = await authenticate(req);

    if (body.action === "register") {
      return Response.json(await registerToken(caller.userId, body.expoPushToken));
    }
    return Response.json(await testDispatch(caller.userId, body.title, body.body));
  } catch (err) {
    return errorResponse(err);
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

// ---------------------------------------------------------------------------
// action: test-dispatch
// ---------------------------------------------------------------------------

async function testDispatch(userId: string, title: string, message: string) {
  const admin = getSupabaseAdmin();
  const { data: tokens, error } = await admin.from("push_tokens").select("expo_push_token").eq("user_id", userId);
  if (error) throw Errors.internal("Could not load your push tokens.");
  if (!tokens?.length) {
    throw Errors.badRequest("No push token registered for this account yet -- call action: 'register' first.");
  }

  await dispatchExpoPush(
    tokens.map((t) => ({ to: t.expo_push_token as string, title, body: message, data: { type: "test" } }))
  );
  return { dispatched: tokens.length };
}
