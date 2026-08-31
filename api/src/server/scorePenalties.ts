import type { SupabaseClient } from "@supabase/supabase-js";
import {
  lateReleasePenalty,
  LATE_RELEASE_WINDOW_DAYS,
  V_SCORE_PENALTIES,
} from "@/lib/vscore";
import { replayAndStoreVScore, type ReplayOutcome } from "./vscoreReplay";
import { Errors } from "./httpErrors";

/**
 * Writing a flat V-Score deduction, in ONE place.
 *
 * Extracted from /api/vscore unchanged when the cancellation penalty was wired
 * into /api/application-status, for the same reason `server/waitlist.ts` was
 * extracted for moderation: two copies of a rule drift, and the drift is
 * invisible because both copies still "work". Three callers now write
 * penalties — the vscore endpoint, the cancellation path, and the nightly
 * sweep — and there is exactly one implementation of what a penalty row is.
 *
 * EVERY WRITE IS FOLLOWED BY A REPLAY, never by arithmetic on the stored score.
 * That is what makes a penalty survive the next review instead of being erased
 * by it, and it is why this helper does both rather than leaving the second
 * half to the caller to remember.
 */

export interface RecordPenaltyInput {
  volunteerId: string;
  kind: "late_cancellation" | "on_time_cancellation" | "late_release";
  /** Negative. `score_events` refuses anything else by check constraint. */
  points: number;
  /** Shown to the volunteer. Never blank — the column refuses that too. */
  reason: string;
  /**
   * What makes a retry safe. A dropped connection, a double tap or a cron that
   * runs twice would otherwise charge somebody twice for one act, which is not
   * a cosmetic bug.
   */
  dedupeKey: string;
  outreachId?: string | null;
  applicationId?: string | null;
  outreachDayId?: string | null;
}

/** Writes one penalty, then rebuilds the score from history. Retry-safe. */
export async function recordPenalty(
  admin: SupabaseClient,
  input: RecordPenaltyInput
): Promise<ReplayOutcome> {
  const { error } = await admin.from("score_events").upsert(
    {
      volunteer_id: input.volunteerId,
      kind: input.kind,
      points: input.points,
      reason: input.reason,
      dedupe_key: input.dedupeKey,
      outreach_id: input.outreachId ?? null,
      application_id: input.applicationId ?? null,
      outreach_day_id: input.outreachDayId ?? null,
    },
    { onConflict: "volunteer_id,dedupe_key", ignoreDuplicates: true }
  );
  if (error) throw Errors.internal("Could not record the penalty.");

  // Idempotent: a retry converges on the same score rather than a lower one,
  // because the second upsert wrote nothing and the replay reads the same
  // history.
  return replayAndStoreVScore(admin, input.volunteerId);
}

/**
 * The deduction for withdrawing from an outreach: -8 inside the 24-hour window,
 * -2 outside it.
 *
 * ONLY AN ACCEPTED PLACE IS PENALISED, and that is the whole reason this lives
 * on the cancellation path rather than anywhere it could be applied later.
 * Withdrawing a PENDING or WAITLISTED application costs nobody anything — no
 * place was held, no organiser was left short, and it is precisely the
 * behaviour the app wants instead of somebody going quiet. Charging for it
 * would punish the honest version of doing nothing.
 *
 * That check is only possible while the previous status is still known. Once
 * `status` reads 'cancelled' the row no longer records what it was before, so
 * a penalty decided after the fact could not tell a withdrawn pending
 * application from an abandoned accepted place. This is why the cancellation
 * and its penalty are ONE server operation and why the client must no longer
 * cancel the row itself first.
 *
 * `late_cancellation` is read from the row the database stamped, never from the
 * request: `trg_applications_stamp_cancellation` decides lateness against the
 * event's start, and the column is absent from the client's grant list, so a
 * volunteer cannot backdate a withdrawal to turn -8 into -2.
 */
export async function recordCancellationPenalty(
  admin: SupabaseClient,
  input: {
    volunteerId: string;
    applicationId: string;
    outreachId: string;
    outreachTitle: string | null;
    /** As stamped by the trigger on this cancellation. */
    lateCancellation: boolean;
  }
): Promise<ReplayOutcome> {
  const kind = input.lateCancellation ? "late_cancellation" : "on_time_cancellation";

  return recordPenalty(admin, {
    volunteerId: input.volunteerId,
    kind,
    points: V_SCORE_PENALTIES[kind],
    reason: input.lateCancellation
      ? `Withdrew from ${input.outreachTitle ?? "an outreach"} within 24 hours of it starting, after being accepted.`
      : `Withdrew from ${input.outreachTitle ?? "an outreach"} after being accepted, with more than 24 hours' notice.`,
    // One cancellation per application: an application is cancelled once and
    // stays cancelled. The kind is deliberately NOT in the key — if the timing
    // were somehow reported both ways, the second must be refused rather than
    // charged on top of the first.
    dedupeKey: `cancellation:${input.applicationId}`,
    outreachId: input.outreachId,
    applicationId: input.applicationId,
  });
}

/**
 * The deduction for dropping a committed DAY inside 24 hours of it starting.
 *
 * NOTHING ABOUT THE AMOUNT COMES FROM THE CALLER. Every input is read back out
 * of the database here: whether the day is actually released, whether the
 * database flagged it late, how many days the volunteer originally promised,
 * and how many late releases they had already made. A client that could name
 * any of those could choose its own penalty, and the endpoint's older contract
 * — which took `daysReleased` and `daysCommitted` from the request — could be
 * handed a denominator of 400 and charged the floor instead of the real figure.
 *
 * WHAT THE TWO NUMBERS MEAN, because the choice is not obvious:
 *
 *   daysCommitted = EVERY `application_days` row for this application,
 *     released or not. That is the promise the volunteer originally made, and
 *     it is the denominator the approved formula was calibrated against
 *     ("1 of 4 days -> -2"). Counting only the days still live would shrink the
 *     denominator with each drop and make the third drop cost more than the
 *     first for no stated reason.
 *
 *   daysReleased = 1. Each late release is ONE act and is charged for itself.
 *     Charging the running total instead would re-charge days already paid for,
 *     and the dedupe key is per-day-per-moment precisely because each act is
 *     its own event. Dropping all four days of a four-day commitment therefore
 *     costs 4 x -2 = -8, which is exactly the withdrawal figure the formula was
 *     built to meet at its own edge.
 *
 * ONLY AN ACCEPTED APPLICATION IS PENALISED, the same rule as a cancellation
 * and for the same reason: a pending or waitlisted volunteer dropping a day
 * costs nobody a place. This is a judgement rather than something the approved
 * formula states, and it is recorded in docs/REPORT_NOTES.md as such.
 *
 * A FREE RELEASE WRITES NOTHING. `score_events` holds exactly the rows that
 * move a score; the fact of the release already lives on
 * `application_days.late_release`. A zero-point row would put an entry in the
 * volunteer's list that deducted nothing, which reads as a punishment they
 * cannot find.
 */
export async function recordLateReleasePenalty(
  admin: SupabaseClient,
  input: {
    volunteerId: string;
    applicationId: string;
    outreachId: string;
    outreachDayId: string;
    outreachTitle: string | null;
  }
): Promise<{ outcome: ReplayOutcome | null; points: number; skipped: string | null }> {
  const { data: day, error: dayError } = await admin
    .from("application_days")
    .select("id, released_at, late_release")
    .eq("application_id", input.applicationId)
    .eq("outreach_day_id", input.outreachDayId)
    .maybeSingle();
  if (dayError) throw Errors.internal("Could not load the committed day.");

  if (!day || day.released_at === null || day.late_release !== true) {
    return { outcome: null, points: 0, skipped: "not a late release" };
  }

  const releasedAt = day.released_at as string;

  /*
    THE ORIGINAL PROMISE: every row, released or not. `head: true` with an exact
    count returns the number and no rows.
  */
  const { count: daysCommitted } = await admin
    .from("application_days")
    .select("id", { count: "exact", head: true })
    .eq("application_id", input.applicationId);

  /*
    HOW MANY LATE RELEASES CAME BEFORE THIS ONE, inside the rolling window as it
    stood AT THE MOMENT OF THIS RELEASE.

    Counted against `releasedAt` rather than against now(), and strictly before
    it. That makes the figure reproducible: the nightly sweep catching a release
    from yesterday computes the same number the live call would have, instead of
    a different, equally confident, wrong one. It also removes the "count
    including this one, then subtract one" fudge the endpoint used to do.
  */
  const windowStart = new Date(
    new Date(releasedAt).getTime() - LATE_RELEASE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: priorRows } = await admin
    .from("application_days")
    .select("id, released_at, applications!inner(volunteer_id)")
    .eq("applications.volunteer_id", input.volunteerId)
    .eq("late_release", true)
    .gte("released_at", windowStart)
    .lt("released_at", releasedAt);

  const points = lateReleasePenalty({
    priorLateReleases: (priorRows ?? []).length,
    daysReleased: 1,
    daysCommitted: daysCommitted ?? 0,
  });

  if (points === 0) {
    return { outcome: null, points: 0, skipped: "within the free allowance" };
  }

  const outcome = await recordPenalty(admin, {
    volunteerId: input.volunteerId,
    kind: "late_release",
    points,
    reason: `Dropped a committed day of ${input.outreachTitle ?? "an outreach"} within 24 hours of that day starting, out of ${daysCommitted ?? 0} day(s) promised.`,
    // Keyed on the released day AND the moment it was released: a day can be
    // taken back on and dropped late again, and that second drop is a genuinely
    // new act rather than a repeat of the first.
    dedupeKey: `late_release:${day.id as string}:${releasedAt}`,
    outreachId: input.outreachId,
    applicationId: input.applicationId,
    outreachDayId: input.outreachDayId,
  });

  return { outcome, points, skipped: null };
}
