import { Errors } from "./httpErrors";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { notifyUsers } from "./notify";
import { env } from "./env";

/**
 * Reminder window: outreaches starting between 12 and 36 hours from now -- a
 * 24-hour band centred on the 24-hour mark, sized to match the daily cron in
 * vercel.json ("0 8 * * *"; Vercel's Hobby plan only permits once-daily crons).
 * Consecutive daily runs tile this band exactly, so every outreach falls into
 * one run's window and none falls through the gap between runs. Lead time
 * therefore varies between 12 and 36 hours -- hence "about 24 hours" in the
 * push copy below.
 */
const REMINDER_WINDOW_START_HOURS = 12;
const REMINDER_WINDOW_END_HOURS = 36;

/** Throws unless the caller presented `Authorization: Bearer <CRON_SECRET>`. */
export function assertCronSecret(req: Request): void {
  const configured = env.cronSecret;
  if (!configured) {
    throw Errors.internal("CRON_SECRET is not configured for this deployment.");
  }
  const header = req.headers.get("authorization");
  if (header !== `Bearer ${configured}`) {
    throw Errors.forbidden("Invalid cron credentials.");
  }
}

/**
 * The 24-hour event reminder push. Scans `open` outreaches starting in the
 * reminder window above, and pushes every `accepted` applicant who hasn't been
 * reminded yet (applications.reminder_sent_at is null -- see
 * api/sql/reminder_sent_at.sql), then stamps reminder_sent_at so a re-run
 * (e.g. the cron firing again within the window) never double-sends.
 *
 * Shared by both:
 *   - GET /api/cron/event-reminders (the real Vercel Cron target -- Cron
 *     Jobs can only invoke GET routes)
 *   - POST /api/notifications { action: "send-event-reminders" } (manual
 *     curl testing of the exact same logic without waiting for the schedule)
 * Both callers must call `assertCronSecret` first.
 */
export async function sendEventReminders(): Promise<{ remindersSent: number }> {
  const admin = getSupabaseAdmin();
  const now = new Date();
  const windowStart = new Date(now.getTime() + REMINDER_WINDOW_START_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_END_HOURS * 60 * 60 * 1000);

  const { data: outreaches, error } = await admin
    .from("outreaches")
    .select("id, title, date, start_time, location_name")
    .eq("status", "open")
    .gte("date", windowStart.toISOString().slice(0, 10))
    .lte("date", windowEnd.toISOString().slice(0, 10));
  if (error) throw Errors.internal("Could not load upcoming outreaches.");

  const dueOutreaches = (outreaches ?? []).filter((o) => {
    const start = new Date(`${o.date}T${o.start_time ?? "00:00:00"}Z`);
    return start >= windowStart && start <= windowEnd;
  });

  if (dueOutreaches.length === 0) {
    return { remindersSent: 0 };
  }

  let remindersSent = 0;

  for (const outreach of dueOutreaches) {
    const { data: applications, error: applicationsError } = await admin
      .from("applications")
      .select("id, volunteer_id, reminder_sent_at")
      .eq("outreach_id", outreach.id)
      .eq("status", "accepted")
      .is("reminder_sent_at", null);
    if (applicationsError || !applications?.length) continue;

    for (const application of applications) {
      const { data: tokens } = await admin
        .from("push_tokens")
        .select("expo_push_token")
        .eq("user_id", application.volunteer_id);
      // Not gated on having a token -- notifyUsers records the in-app row
      // either way, and reminder_sent_at is stamped below regardless, so a
      // tokenless volunteer would otherwise be marked reminded with nothing
      // to show for it.
      await notifyUsers([
        {
          userId: application.volunteer_id as string,
          type: "event_reminder",
          title: "Event reminder",
          body: `${outreach.title} starts in about 24 hours${outreach.location_name ? ` at ${outreach.location_name}` : ""}.`,
          outreachId: outreach.id as string,
          data: { outreachId: outreach.id },
          tokens: (tokens ?? []).map((t) => t.expo_push_token as string),
        },
      ]);
      await admin
        .from("applications")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", application.id);
      remindersSent += 1;
    }
  }

  return { remindersSent };
}
