import { Errors } from "./httpErrors";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { notifyUsers, type UserNotification } from "./notify";

/**
 * What happens to an outreach once its date has passed.
 *
 * BEFORE THIS, NOTHING DID. No cron pass, trigger or sweep touched
 * `outreaches.status`; only the organisation's manual Close button moved it.
 * An outreach dated last week was still `open`, and stayed open forever. Three
 * things followed from that: it kept appearing in the volunteer feed, a
 * volunteer could still apply to it (`applications_insert_own` checks
 * `o.status = 'open'` and nothing about the date), and its applicants sat
 * `pending` indefinitely.
 *
 * ORDER MATTERS, and it is the reason both halves live in one function: close
 * first, then resolve the applications. The other way round leaves a window in
 * which an outreach is closed while its applicants are still pending — small,
 * but it is exactly the state the resolution exists to eliminate.
 *
 * `closed`, NOT `completed`. `closed` means "no longer recruiting", which is
 * what has actually become true. `completed` stays a deliberate act by the
 * organisation meaning "I have wrapped this up", because that is the signal
 * that reviews are finished. Attendance and reviews key off the date and the
 * accepted roster, never off `completed`, so filing them after this pass runs
 * keeps working exactly as before.
 *
 * Both halves are idempotent, so a re-run — or a manual invocation on the same
 * day — changes nothing further.
 */

export interface OutreachLifecycleResult {
  /** Outreaches moved from `open` to `closed` because their date had passed. */
  closed: number;
  /** Applications moved to `not_selected`. */
  resolved: number;
  /** Volunteers told they were not selected. */
  notified: number;
}

export async function closeAndResolvePastOutreaches(): Promise<OutreachLifecycleResult> {
  const admin = getSupabaseAdmin();

  // Ghana is UTC+0 year-round, so the server's UTC date and the event's local
  // date agree — the same assumption the check-in and reminder passes make.
  const today = new Date().toISOString().slice(0, 10);

  // ---- 1. Close ----------------------------------------------------------
  /*
    PICK THE ROWS FIRST, THEN CLOSE THEM. This used to be one bulk UPDATE, and
    one bulk UPDATE is all-or-nothing.

    `refuse_outreach_from_unverified_org` is a trigger on `outreaches` that
    raises on any status change made for an organisation whose
    `moderation_state` is not `active`. A single such row therefore aborted the
    entire statement, this function threw, and because the nightly cron awaits
    its passes in sequence, the two that run AFTER it never ran at all -- the
    late-release penalty backstop and the notification retention sweep. Every
    night, silently, until somebody fixed one row by hand.

    Excluding those outreaches is also right on its own terms, quite apart from
    the trigger: a suspended organisation's event was STOPPED, not finished,
    and "closed" is the word this app uses for an event that has run its
    course. Leaving it alone is the honest answer.
  */
  const { data: pastOpen, error: pastOpenError } = await admin
    .from("outreaches")
    .select("id, organisation_id")
    .eq("status", "open")
    .lt("date", today);
  if (pastOpenError) throw Errors.internal("Could not list past outreaches.");

  const pastOpenRows = (pastOpen ?? []) as { id: string; organisation_id: string }[];
  let closed = 0;

  if (pastOpenRows.length > 0) {
    // Two plain queries rather than an embed: the join is only needed to drop
    // a handful of rows, and naming a foreign key in a PostgREST embed is a
    // string that fails at runtime rather than at compile time.
    const { data: activeOrgs, error: orgError } = await admin
      .from("profiles")
      .select("id")
      .in("id", [...new Set(pastOpenRows.map((row) => row.organisation_id))])
      .eq("moderation_state", "active");
    if (orgError) throw Errors.internal("Could not check organisation standing.");

    const active = new Set((activeOrgs ?? []).map((row) => row.id as string));
    const closableIds = pastOpenRows.filter((row) => active.has(row.organisation_id)).map((r) => r.id);

    if (closableIds.length > 0) {
      const { data: closedRows, error: closeError } = await admin
        .from("outreaches")
        .update({ status: "closed" })
        .in("id", closableIds)
        .select("id");
      if (closeError) throw Errors.internal("Could not close past outreaches.");
      closed = (closedRows ?? []).length;
    }
  }

  // ---- 2. Resolve --------------------------------------------------------
  // Reads the list first rather than resolving blindly, so the pass reports
  // real numbers and so a failure on one outreach cannot hide the others.
  const { data: pendingOutreaches, error: listError } = await admin.rpc(
    "outreaches_needing_resolution"
  );
  if (listError) throw Errors.internal("Could not list outreaches needing resolution.");

  let resolved = 0;
  const notifications: UserNotification[] = [];

  for (const row of (pendingOutreaches ?? []) as { outreach_id: string }[]) {
    const { data: resolvedRows, error: resolveError } = await admin.rpc(
      "resolve_unsuccessful_applications",
      { p_outreach_id: row.outreach_id }
    );
    if (resolveError) continue;

    const applications = (resolvedRows ?? []) as {
      application_id: string;
      volunteer_id: string;
    }[];
    if (applications.length === 0) continue;

    resolved += applications.length;

    const { data: outreach } = await admin
      .from("outreaches")
      .select("id, title")
      .eq("id", row.outreach_id)
      .maybeSingle();

    const volunteerIds = applications.map((a) => a.volunteer_id);
    const { data: tokenRows } = await admin
      .from("push_tokens")
      .select("user_id, expo_push_token")
      .in("user_id", volunteerIds);

    const tokensByUser = new Map<string, string[]>();
    for (const token of tokenRows ?? []) {
      const userId = token.user_id as string;
      tokensByUser.set(userId, [...(tokensByUser.get(userId) ?? []), token.expo_push_token as string]);
    }

    for (const application of applications) {
      notifications.push({
        userId: application.volunteer_id,
        type: "application_status",
        title: "Application closed",
        // Names the cause, not the person. Being crowded out of a full event
        // is not a judgement about the applicant, and the wording must not
        // let it read as one.
        body: `${outreach?.title ?? "This event"} filled up before a place could be offered to you.`,
        outreachId: row.outreach_id,
        data: { outreachId: row.outreach_id, status: "not_selected" },
        tokens: tokensByUser.get(application.volunteer_id) ?? [],
      });
    }
  }

  await notifyUsers(notifications);

  return { closed, resolved, notified: notifications.length };
}
