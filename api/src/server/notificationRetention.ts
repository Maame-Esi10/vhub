import { getSupabaseAdmin } from "./supabaseAdmin";
import {
  NOTIFICATION_RETENTION_BATCH,
  NOTIFICATION_RETENTION_DAYS,
  NOTIFICATION_RETENTION_MAX_BATCHES,
  outreachIdsInBatch,
  retentionCutoff,
  selectDeletableNotifications,
  type RetentionCandidate,
} from "../../../lib/notificationRetention";

/**
 * The nightly retention sweep for `notifications`.
 *
 * WHY IT EXISTS. The table has no delete policy and no expiry: every accepted
 * application, every reminder, every escalation and every high-match scan adds
 * rows and nothing has ever removed one. The fan-out writers are the ones that
 * matter — `new_match` records a row per matching volunteer per outreach, and
 * the under-subscription ladder does the same up to three times per event —
 * so the row count grows with volunteers multiplied by outreaches, not with
 * either alone. On a free-tier database that is a bill and a slow screen, and
 * both arrive quietly.
 *
 * WHY IT RUNS LAST IN THE CRON. Two of the passes above it (`checkinReminders`
 * and `underSubscription`) use this table as their own memory of what they have
 * already sent. Running the sweep before them would, on the one night the
 * cutoff happened to fall across a live marker, delete the evidence that a
 * reminder had gone out and let the same pass send it again in the same run.
 * Running last means every reader has finished before anything is removed.
 *
 * WHY IT DELETES BY ID RATHER THAN BY A SINGLE `created_at` PREDICATE. One
 * `delete ... where created_at < cutoff` would be shorter and would also be
 * unbounded: it would take an arbitrarily large lock inside a function that has
 * five other passes to get through, and it could not apply the protection rule
 * below. Reading a bounded batch, deciding, then deleting exactly those ids
 * keeps every run the same size and every deletion explainable.
 */

export interface NotificationRetentionOptions {
  /**
   * Report what would go, delete nothing.
   *
   * The same discipline every migration in this project follows: a dry run
   * first, then the write. It matters more than usual here because the real
   * window is six months and this repository is younger than that — without a
   * dry run the pass could not be shown to work until 2027, and an unverified
   * destructive job that has never once done anything is exactly the kind that
   * turns out to have been wrong all along.
   */
  readonly dryRun?: boolean;
  /**
   * Override the window. ONLY HONOURED ON A DRY RUN, and that restriction is
   * the point: it makes it possible to ask "what would a 30-day window take?"
   * without creating a way to actually take it. A caller holding the cron
   * secret could otherwise wipe the whole feed with `retentionDays: 0`.
   */
  readonly retentionDays?: number;
}

export interface NotificationRetentionResult {
  /** The instant used as the cutoff, for the cron response. */
  cutoff: string;
  /** True when nothing was actually removed. */
  dryRun: boolean;
  /** Rows past the cutoff that this run looked at. */
  examined: number;
  /** Rows actually removed. */
  deleted: number;
  /** Rows past the cutoff that were kept because their outreach has not finished. */
  protectedRows: number;
  /** True when the run hit its batch ceiling and more remains for tomorrow. */
  moreRemaining: boolean;
  /** Batch failures, named. One failure must not abandon the rest. */
  failed: { batch: number; reason: string }[];
}

/**
 * The outreaches among `ids` that have not finished yet — anything with a day
 * on or after today.
 *
 * READS THE DAYS, NOT `outreaches.date`. `outreaches.date` is the FIRST day, so
 * judging on it would call a four-week campaign finished on the evening of day
 * one and free its dedupe markers three weeks early. This is the same rule the
 * rest of the app follows for "is it over?", stated in CLAUDE.md.
 *
 * Comparing against today's date (rather than now) deliberately treats an event
 * running today as unfinished for the whole of it.
 */
async function findUnfinishedOutreaches(
  admin: ReturnType<typeof getSupabaseAdmin>,
  ids: readonly string[],
  now: Date
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  const today = now.toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("outreach_days")
    .select("outreach_id")
    .in("outreach_id", ids as string[])
    .gte("day", today);

  if (error) {
    // Fail CLOSED: if we cannot tell which outreaches are still live, protect
    // all of them. Skipping a night of cleanup costs nothing; deleting a live
    // dedupe marker sends a duplicate push to a real person.
    throw new Error(`retention: could not check outreach days (${error.message})`);
  }

  return new Set((data ?? []).map((row) => row.outreach_id as string));
}

export async function sweepExpiredNotifications(
  options: NotificationRetentionOptions = {},
  now: Date = new Date()
): Promise<NotificationRetentionResult> {
  const admin = getSupabaseAdmin();
  const dryRun = options.dryRun === true;
  const days =
    dryRun && typeof options.retentionDays === "number"
      ? options.retentionDays
      : NOTIFICATION_RETENTION_DAYS;
  const cutoff = retentionCutoff(now, days);

  const result: NotificationRetentionResult = {
    cutoff: cutoff.toISOString(),
    dryRun,
    examined: 0,
    deleted: 0,
    protectedRows: 0,
    moreRemaining: false,
    failed: [],
  };

  /*
    How many rows at the head of the ordered set have already been examined and
    KEPT. Deleted rows vanish, so after each batch the oldest remaining rows are
    exactly the protected ones — skipping that many is what stops the next batch
    re-reading them forever.

    A `created_at` cursor was the obvious alternative and is wrong here:
    `notifyUsers` writes a whole fan-out in ONE batched insert, so hundreds of
    rows share a timestamp to the microsecond, and a strictly-greater cursor
    would step straight over the rest of that group.
  */
  let skip = 0;

  for (let batch = 0; batch < NOTIFICATION_RETENTION_MAX_BATCHES; batch += 1) {
    try {
      // Ordered oldest-first so successive runs make progress from the far end
      // rather than re-reading the same protected rows every night. The
      // `(user_id, created_at desc)` index does not serve this scan, which is
      // accepted: it runs once a day, off any user's request path, and adding
      // an index for it would be a gated schema change for a job nobody waits on.
      const { data, error } = await admin
        .from("notifications")
        .select("id, outreach_id")
        .lt("created_at", cutoff.toISOString())
        .order("created_at", { ascending: true })
        .range(skip, skip + NOTIFICATION_RETENTION_BATCH - 1);

      if (error) throw new Error(error.message);

      const candidates: RetentionCandidate[] = (data ?? []).map((row) => ({
        id: row.id as string,
        outreachId: (row.outreach_id as string | null) ?? null,
      }));

      if (candidates.length === 0) return result;
      result.examined += candidates.length;

      const unfinished = await findUnfinishedOutreaches(
        admin,
        outreachIdsInBatch(candidates),
        now
      );
      const deletable = selectDeletableNotifications(candidates, unfinished);
      const kept = candidates.length - deletable.length;
      result.protectedRows += kept;
      skip += kept;

      if (deletable.length > 0) {
        if (dryRun) {
          // Counted as if removed, but left in place -- so the next batch must
          // skip past them too, or the loop would re-read the same rows and
          // report the same deletions over and over.
          result.deleted += deletable.length;
          skip += deletable.length;
        } else {
          const { error: deleteError } = await admin
            .from("notifications")
            .delete()
            .in("id", deletable);
          if (deleteError) throw new Error(deleteError.message);
          result.deleted += deletable.length;
        }
      }

      // A short batch means the cutoff has been reached; anything else means
      // there may be more waiting for the next iteration.
      if (candidates.length < NOTIFICATION_RETENTION_BATCH) return result;
    } catch (err) {
      result.failed.push({ batch, reason: err instanceof Error ? err.message : String(err) });
      return result;
    }
  }

  result.moreRemaining = true;
  return result;
}
