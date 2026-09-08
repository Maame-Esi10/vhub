/**
 * The pure rule behind the nightly notification retention sweep.
 *
 * `notifications` is append-only by design — there is no delete policy, and a
 * user cannot remove their own rows — so it grows forever. Every accepted
 * application, every reminder, every high-match scan adds rows, and the
 * fan-out ones (`new_match`) write one per matching volunteer per outreach.
 * Nothing has ever removed any of them.
 *
 * The state and the queries live in `api/src/server/notificationRetention.ts`;
 * this module holds the arithmetic and the safety filter, the same split
 * `lib/rateLimit.ts`, `lib/roster.ts` and `lib/underSubscription.ts` already
 * follow.
 *
 * THE TRAP THIS MODULE EXISTS TO AVOID. A row in this table is two different
 * things at once: a message somebody may want to read, and, for two of the
 * cron passes, the ONLY memory that a notification has already been sent.
 * `checkinReminders` and `underSubscription` both dedupe by reading their own
 * rows back (`data->>'stage'`, plus the outreach day). Delete one of those
 * while it is still doing that job and the pass sends the notification again —
 * a bug that would surface as duplicate pushes to real volunteers, weeks after
 * the deletion that caused it, with nothing to connect the two.
 *
 * So deletion is refused for any row attached to an outreach that has not
 * finished, whatever its age. The age test alone would very probably be safe
 * (a stage marker is written at most 7 days before the day it covers, and the
 * window below is 180), but "very probably" is the wrong standard for a job
 * that runs unattended every night against a campaign of unknown length.
 */

/**
 * How long a notification is kept.
 *
 * Six months. The screen groups by day and is read by scrolling from the top;
 * nobody scrolls back half a year, and anything genuinely important — an
 * accepted application, a verification decision, a deduction — is recorded in
 * its own table and shown on its own screen. This window is therefore about
 * the size of the table, not about hiding anything: no fact reachable only
 * through a notification is lost, because there is no such fact.
 */
export const NOTIFICATION_RETENTION_DAYS = 180;

/**
 * Rows examined per query, and the most that can be deleted in one run.
 *
 * The sweep is one pass of a nightly serverless function with a wall-clock
 * limit shared by five other passes, so it takes a bounded bite rather than
 * trying to drain an arbitrarily large backlog in one night. A table that is
 * behind catches up over consecutive runs; at this project's scale the first
 * run that finds anything at all will already be the last one that has to
 * work hard.
 */
export const NOTIFICATION_RETENTION_BATCH = 500;
export const NOTIFICATION_RETENTION_MAX_BATCHES = 20;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The instant before which a notification is old enough to remove.
 *
 * Takes `now` rather than reading the clock so a test can state the answer,
 * and so the sweep computes the cutoff exactly once per run instead of
 * drifting by a few milliseconds between batches.
 */
export function retentionCutoff(now: Date, days: number = NOTIFICATION_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * MS_PER_DAY);
}

/** The minimum a candidate row has to tell us before we can judge it. */
export interface RetentionCandidate {
  readonly id: string;
  /** Null for the notifications that refer to no event. */
  readonly outreachId: string | null;
}

/**
 * Which of these old rows may actually be deleted.
 *
 * A row is kept when it points at an outreach in `protectedOutreachIds` — the
 * ones still running or still ahead, whose dedupe markers are still being read
 * back. Everything else that reached this function is already past the cutoff
 * and goes.
 *
 * A row with no outreach is never protected: nothing dedupes on it, because
 * the two passes that dedupe both scope their read by `outreach_id`.
 */
export function selectDeletableNotifications(
  candidates: readonly RetentionCandidate[],
  protectedOutreachIds: ReadonlySet<string>
): string[] {
  return candidates
    .filter((row) => row.outreachId === null || !protectedOutreachIds.has(row.outreachId))
    .map((row) => row.id);
}

/** The distinct outreaches a batch refers to — what the protection query asks about. */
export function outreachIdsInBatch(candidates: readonly RetentionCandidate[]): string[] {
  const ids = new Set<string>();
  for (const row of candidates) {
    if (row.outreachId !== null) ids.add(row.outreachId);
  }
  return [...ids];
}
