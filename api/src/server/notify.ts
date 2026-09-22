import { getSupabaseAdmin } from "./supabaseAdmin";
import { dispatchExpoPush, type ExpoPushMessage, type ExpoPushResult } from "./expoPush";

/**
 * The single way to notify a user.
 *
 * Every notification has TWO destinations that must not drift apart: a row in
 * `notifications` (what the in-app Notifications screen reads, and the only
 * durable record) and an Expo push (the OS banner, which is fire-and-forget).
 * Before this helper existed the four dispatch sites did only the second, so
 * a dismissed banner was unrecoverable and the screen had nothing to show.
 *
 * Recording happens BEFORE dispatch and is the part that matters: the row is
 * the source of truth, the push is a courtesy. Both are best-effort with
 * respect to the caller -- a failure here must never fail the request that
 * triggered it (an accept/reject decision, a V-Score recompute, a match scan),
 * which is the same contract dispatchExpoPush already honours.
 */

export type NotificationType = "new_match" | "application_status" | "event_reminder" | "test";

export interface UserNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Nullable: not every type refers to an outreach. */
  outreachId?: string | null;
  /** Extra payload delivered to the app for tap-routing. */
  data?: Record<string, unknown>;
  /** This user's registered device tokens. Empty is fine -- the row is still recorded. */
  tokens: readonly string[];
}

/**
 * Records the in-app row for each notification, then pushes to every device.
 *
 * RETURNS WHAT THE PUSH SERVICE SAID, which callers are free to ignore and one
 * deliberately does not: the test-dispatch action exists to prove the push path
 * works, so for that one caller a silent failure is the entire bug. Everywhere
 * else this stays best-effort -- the row above is the source of truth and a
 * push is a courtesy on top of it.
 */
export async function notifyUsers(
  notifications: readonly UserNotification[]
): Promise<ExpoPushResult> {
  if (notifications.length === 0) return { accepted: 0, failed: 0, failures: [] };

  // One batched insert rather than one per user: notifyCandidates can fan out
  // to every matching volunteer in a region.
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("notifications").insert(
      notifications.map((n) => ({
        user_id: n.userId,
        type: n.type,
        title: n.title,
        body: n.body,
        outreach_id: n.outreachId ?? null,
        data: { type: n.type, ...(n.data ?? {}) },
      }))
    );
    if (error) console.error("[notify] could not record notifications:", error.message);
  } catch (err) {
    console.error("[notify] record failed:", err instanceof Error ? err.message : err);
  }

  // A user with no registered device still got their row above; they simply
  // see it next time they open the app.
  const messages: ExpoPushMessage[] = [];
  for (const n of notifications) {
    for (const token of n.tokens) {
      messages.push({
        to: token,
        title: n.title,
        body: n.body,
        data: { type: n.type, ...(n.data ?? {}) },
      });
    }
  }

  return dispatchExpoPush(messages);
}
