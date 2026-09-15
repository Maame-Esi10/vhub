import { Errors } from "./httpErrors";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { notifyUsers } from "./notify";

/**
 * "Don't forget to scan the check-in code" — the reminder that closes the
 * attendance loop.
 *
 * WHY THIS EXISTS. A volunteer who attends but never scans is indistinguishable
 * from one who did not turn up: no attendance row, so they land on the
 * organiser's exception list and someone has to make a judgement call about a
 * person who was standing right there. Every reminder that lands is one fewer
 * of those.
 *
 * WHAT IT CANNOT DO, and this is a platform limit rather than a design choice:
 * fire as the event ENDS. Vercel's Hobby plan permits exactly one cron per day
 * (see the window note in eventReminders.ts), so there is no scheduler
 * available to run at 4pm on the day of each event. This pass therefore rides
 * the existing 08:00 job and reminds people on the MORNING of their event,
 * before they set off.
 *
 * The function is nonetheless written to be correct whenever it runs — it skips
 * anyone who already has an attendance row — so pointing a better scheduler at
 * it later, or invoking it by hand late in the day, chases exactly the people
 * who still have not scanned. That is the "before you leave" behaviour, and it
 * needs no change here to become available.
 *
 * DEDUPED WITHOUT A SCHEMA CHANGE. The 24-hour reminder stamps
 * applications.reminder_sent_at; reusing that column would make the two
 * reminders cancel each other out, and adding a second column is a schema
 * change (gated — see CLAUDE.md). Instead this reads back the `notifications`
 * table, which already carries `outreach_id` and a `data` jsonb, and marks its
 * own rows with `data->>'stage' = 'checkin'`. The durable record IS the
 * dedupe key, which is one fewer thing that can drift out of step.
 */

/** Marks a notification as this pass's, inside the shared 'event_reminder' type. */
const CHECKIN_STAGE = "checkin";

export interface CheckinReminderResult {
  remindersSent: number;
  /** Outreaches examined — useful when the count is 0 and you want to know why. */
  outreachesConsidered: number;
}

/**
 * Reminds accepted volunteers to scan, for every event happening TODAY that
 * has not been closed off.
 *
 * Only `open` and `closed` outreaches are considered: `draft` never happened,
 * and `completed` means the organiser has already wrapped it up, so nagging
 * its volunteers to scan would be asking for something that no longer matters.
 */
export async function sendCheckinReminders(): Promise<CheckinReminderResult> {
  const admin = getSupabaseAdmin();

  // Ghana is UTC+0 year-round, so the server's UTC date and the event's local
  // date agree — the same assumption lib/attendance.ts's anchor check makes.
  const today = new Date().toISOString().slice(0, 10);

  // DRIVEN BY outreach_days, NOT BY outreaches.date. `date` is only the FIRST
  // day, so querying it reminded people on day one of a four-day campaign and
  // never again -- the other three days had no reminder at all. Every outreach
  // has at least one day row, so a single-day event behaves exactly as before.
  const { data: dayRows, error } = await admin
    .from("outreach_days")
    .select("id, outreach_id, outreaches!inner (id, title, location_name, status)")
    .eq("day", today)
    .in("outreaches.status", ["open", "closed"]);
  if (error) throw Errors.internal("Could not load today's outreaches.");

  const todaysDays = (dayRows ?? []) as unknown as {
    id: string;
    outreach_id: string;
    outreaches: { title: string | null; location_name: string | null } | null;
  }[];
  if (todaysDays.length === 0) {
    return { remindersSent: 0, outreachesConsidered: 0 };
  }

  let remindersSent = 0;

  for (const dayRow of todaysDays) {
    const outreachId = dayRow.outreach_id;
    const outreachDayId = dayRow.id;
    const outreach = dayRow.outreaches;
    if (!outreach) continue;

    const { data: applications, error: applicationsError } = await admin
      .from("applications")
      .select("id, volunteer_id")
      .eq("outreach_id", outreachId)
      .eq("status", "accepted");
    if (applicationsError || !applications?.length) continue;

    const acceptedIds = applications.map((a) => a.id as string);

    // Only the people who COMMITTED to today. A student who offered four
    // Saturdays of a month-long campaign must not be told to go and scan on the
    // other 22 days -- they never promised them, and being chased about a day
    // they declined would read as the app not having listened.
    //
    // An application with no commitment rows falls back to "every day", which
    // is what every application made before commitments existed meant.
    // `released_at` is selected rather than filtered in SQL, because the two
    // questions below need different answers from the same rows.
    //
    // "Did they commit to TODAY" must ignore a released day -- chasing someone
    // about a day they formally dropped is the same failure as chasing them
    // about one they never promised.
    //
    // "Do they have ANY commitment" must NOT ignore it. That test exists to
    // recognise applications made before commitments existed, which have no
    // rows at all; an application whose every remaining day has been released
    // still has rows, and must not fall through to "every day" -- which would
    // remind them about precisely the days they dropped.
    const { data: commitments } = await admin
      .from("application_days")
      .select("application_id, outreach_day_id, released_at")
      .in("application_id", acceptedIds);
    const committedToday = new Set<string>();
    const hasAnyCommitment = new Set<string>();
    for (const row of commitments ?? []) {
      hasAnyCommitment.add(row.application_id as string);
      if (row.outreach_day_id === outreachDayId && row.released_at === null) {
        committedToday.add(row.application_id as string);
      }
    }

    const volunteerIds = applications
      .filter((a) => !hasAnyCommitment.has(a.id as string) || committedToday.has(a.id as string))
      .map((a) => a.volunteer_id as string);
    if (volunteerIds.length === 0) continue;

    // Already scanned — nothing to remind them about. This is what makes the
    // function safe to run at any hour: run it late and it chases only the
    // people still missing.
    const { data: attendance } = await admin
      .from("attendance")
      .select("volunteer_id")
      .eq("outreach_id", outreachId)
      // Scoped to THIS day: a scan on day one says nothing about whether they
      // have scanned on day two.
      .eq("outreach_day_id", outreachDayId)
      .in("volunteer_id", volunteerIds);
    const checkedIn = new Set((attendance ?? []).map((row) => row.volunteer_id as string));

    // Already reminded for THIS DAY, by an earlier run today. The day id joins
    // `stage` in the dedupe key for the same reason: one reminder per outreach
    // would silence every day after the first.
    const { data: alreadySent } = await admin
      .from("notifications")
      .select("user_id, data")
      .eq("outreach_id", outreachId)
      .eq("type", "event_reminder")
      .in("user_id", volunteerIds);
    const reminded = new Set(
      (alreadySent ?? [])
        .filter((row) => {
          const data = row.data as Record<string, unknown> | null;
          if (data?.stage !== CHECKIN_STAGE) return false;
          // Rows written before this change carry no day. They can only ever
          // have belonged to a single-day outreach, so they count against the
          // one day that outreach has -- which is this one, or this branch is
          // not running for them at all.
          const dayOfRow = (data.outreachDayId as string | undefined) ?? outreachDayId;
          return dayOfRow === outreachDayId;
        })
        .map((row) => row.user_id as string)
    );

    const due = volunteerIds.filter((id) => !checkedIn.has(id) && !reminded.has(id));
    if (due.length === 0) continue;

    const { data: tokens } = await admin
      .from("push_tokens")
      .select("user_id, expo_push_token")
      .in("user_id", due);

    const tokensByUser = new Map<string, string[]>();
    for (const row of tokens ?? []) {
      const userId = row.user_id as string;
      const list = tokensByUser.get(userId) ?? [];
      list.push(row.expo_push_token as string);
      tokensByUser.set(userId, list);
    }

    // One batched call: notifyUsers inserts every row in a single statement
    // and only then fans out the pushes.
    await notifyUsers(
      due.map((volunteerId) => ({
        userId: volunteerId,
        type: "event_reminder" as const,
        title: "Remember to check in",
        body: `You're volunteering at ${outreach.title} today${
          outreach.location_name ? ` at ${outreach.location_name}` : ""
        }. Scan the organiser's check-in code before you leave. It is what records your attendance.`,
        outreachId,
        // `stage` + `outreachDayId` are the dedupe key read back above. Keep
        // both in step: nothing else distinguishes this from the 24-hour
        // reminder, which shares the 'event_reminder' type, and nothing else
        // distinguishes day two of a campaign from day one.
        data: { outreachId, outreachDayId, stage: CHECKIN_STAGE },
        tokens: tokensByUser.get(volunteerId) ?? [],
      }))
    );

    remindersSent += due.length;
  }

  return { remindersSent, outreachesConsidered: todaysDays.length };
}
