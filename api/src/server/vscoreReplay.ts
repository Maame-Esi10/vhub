import type { SupabaseClient } from "@supabase/supabase-js";
import { replayVScore, type ReplayEntry } from "@/lib/vscore";
import { isPresent } from "@/lib/attendance";

/**
 * Rebuilds one volunteer's V-Score from their whole history.
 *
 * THE SCORE IS DERIVED. `volunteer_profiles.v_score` is a CACHE of this
 * function's result, not the truth; the truth is `event_reviews` and
 * `score_events`, plus any upheld `disputes`. Anything that used to move the
 * score by arithmetic on the stored value calls this instead.
 *
 * WHY EVERY CALLER REPLAYS RATHER THAN ADJUSTING. Two reasons, and the second
 * is the one that would bite silently:
 *
 *   1. A correction has to be able to reach backwards. An upheld dispute about
 *      an event from March cannot be expressed as an adjustment to today's
 *      number, because the blend that produced today's number is
 *      order-dependent — the March event has been compounded through every
 *      event since.
 *   2. `event_reviews` is upserted on (outreach_id, volunteer_id). An
 *      organisation editing a review it had already filed used to blend a
 *      SECOND time into a score the first version had already moved, and
 *      increment events_attended again. Replaying makes an edit produce the
 *      score the edited history implies, with nobody having to notice.
 *
 * ORDER IS FILING ORDER (`created_at`, then a fixed source rank, then `id`),
 * and it must stay that way — see the long note in lib/vscore.ts for why event
 * date would rewrite trajectories that were never wrong.
 *
 * IT WRITES `events_attended` TOO, because that counter has exactly the same
 * problem: it was incremented per review, so an edited review counted twice
 * and an upheld attendance dispute could not restore a wrongly-recorded
 * absence.
 *
 * IT ALSO READS THE DAYS (owner-approved 2026-08-30). Each review's outcome is
 * scaled by the share of committed days the volunteer was present for, so 1 day
 * of 4 no longer scores identically to 4 of 4. Those two figures are derived
 * here on every replay rather than stored on the review, because they are
 * evidence that can still change after a review is filed -- an organiser
 * resolving day 3 a week later must move the score, and it will, on the next
 * replay.
 */

export interface ReplayOutcome {
  previousScore: number;
  score: number;
  previousEventsAttended: number;
  eventsAttended: number;
  /** How many events were voided by an upheld dispute. Zero for nearly everyone. */
  correctedEvents: number;
  /** How many penalties are counting against this volunteer right now. */
  activePenalties: number;
  /**
   * The day figures for the outreach the caller nominated, or null when it
   * nominated none or holds no live commitment there.
   *
   * It is returned rather than recomputed by the caller because the replay has
   * already read them, and because an endpoint that reported an UNSCALED
   * outcome while storing a scaled score would be telling the organisation
   * something the score does not agree with.
   */
  dayCommitment: DayCommitment | null;
}

/**
 * A review sorts BEFORE a penalty carrying the same timestamp. The choice is
 * arbitrary; that it is fixed is not. Without a deterministic tie-break, two
 * entries written in the same instant would replay in whatever order the rows
 * happened to arrive in and the score would not be reproducible.
 *
 * It mirrors `source_rank` in vscore_replay() (20260904) exactly. If one moves,
 * the other has to move with it.
 */
const SOURCE_RANK = { review: 0, penalty: 1 } as const;

interface SortableEntry {
  at: string;
  rank: number;
  id: string;
  entry: ReplayEntry;
}

export async function replayAndStoreVScore(
  admin: SupabaseClient,
  volunteerId: string,
  /** Report this outreach's day figures back, so a caller can explain itself. */
  reportDaysFor?: string
): Promise<ReplayOutcome> {
  const [
    { data: profile },
    { data: reviews },
    { data: disputes },
    { data: penalties },
    { data: applications },
    { data: attendanceRows },
  ] = await Promise.all([
    admin
      .from("volunteer_profiles")
      .select("v_score, events_attended")
      .eq("id", volunteerId)
      .maybeSingle(),
    admin
      .from("event_reviews")
      .select("outreach_id, attended, reliability_score, clinical_score, created_at, id")
      .eq("volunteer_id", volunteerId),
    admin
      .from("disputes")
      .select("outreach_id, type")
      .eq("volunteer_id", volunteerId)
      .eq("status", "upheld"),
    admin
      .from("score_events")
      .select("id, points, voided_at, created_at")
      .eq("volunteer_id", volunteerId),
    admin.from("applications").select("id, outreach_id").eq("volunteer_id", volunteerId),
    admin
      .from("attendance")
      .select("outreach_id, outreach_day_id, organiser_status")
      .eq("volunteer_id", volunteerId),
  ]);

  const days = await loadDayCommitment(admin, applications ?? [], attendanceRows ?? []);

  const upheldAny = new Set<string>();
  const upheldAttendance = new Set<string>();
  for (const dispute of disputes ?? []) {
    const outreachId = dispute.outreach_id as string;
    upheldAny.add(outreachId);
    if (dispute.type === "attendance") upheldAttendance.add(outreachId);
  }

  /*
    ONE MERGED STREAM, not two passes. The score is order-dependent, so two
    separate passes could not express "the cancellation came before the
    review" — and that ordering is exactly what decides how much of the
    deduction later events blend away.

    Sorted here rather than in the query because it spans two tables; the
    database does the same merge in vscore_replay(), and the two orderings must
    agree or a score computed by the API would differ from the same score
    computed by the migration.
  */
  const sortable: SortableEntry[] = [];

  for (const review of reviews ?? []) {
    const outreachId = review.outreach_id as string;
    sortable.push({
      at: review.created_at as string,
      rank: SOURCE_RANK.review,
      id: review.id as string,
      entry: {
        attended: review.attended as boolean | null,
        reliability_score: review.reliability_score as number | null,
        clinical_score: review.clinical_score as number | null,
        outcomeVoided: upheldAny.has(outreachId),
        attendanceCorrected: upheldAttendance.has(outreachId),
        // Both null for an outreach we hold no live commitment for, which means
        // "do not scale" rather than "attended nothing". See EventOutcomeInput.
        daysAttended: days.get(outreachId)?.attended ?? null,
        daysCommitted: days.get(outreachId)?.committed ?? null,
      },
    });
  }

  for (const penalty of penalties ?? []) {
    sortable.push({
      at: penalty.created_at as string,
      rank: SOURCE_RANK.penalty,
      id: penalty.id as string,
      entry: {
        penalty: true,
        points: Number(penalty.points),
        voided: penalty.voided_at !== null,
      },
    });
  }

  sortable.sort(
    (a, b) => a.at.localeCompare(b.at) || a.rank - b.rank || a.id.localeCompare(b.id)
  );

  const result = replayVScore(sortable.map((row) => row.entry));
  // Rounded at the point of storage, so the stored value and the value every
  // screen shows are the same number rather than two roundings of one.
  const score = Math.round(result.score * 100) / 100;

  await admin
    .from("volunteer_profiles")
    .update({
      v_score: score,
      events_attended: result.eventsAttended,
      v_score_recomputed_at: new Date().toISOString(),
    })
    .eq("id", volunteerId);

  return {
    previousScore: (profile?.v_score as number) ?? 70,
    score,
    previousEventsAttended: (profile?.events_attended as number) ?? 0,
    eventsAttended: result.eventsAttended,
    correctedEvents: (reviews ?? []).filter((review) =>
      upheldAny.has(review.outreach_id as string)
    ).length,
    activePenalties: (penalties ?? []).filter((penalty) => penalty.voided_at === null).length,
    dayCommitment: reportDaysFor ? days.get(reportDaysFor) ?? null : null,
  };
}

/** What the day scaling needs to know about one outreach. */
interface DayCommitment {
  /** Days still committed to -- released days have LEFT the count. */
  committed: number;
  /** How many of those the organiser did not explicitly mark absent. */
  attended: number;
}

/**
 * Builds the per-outreach day figures each event outcome is multiplied by.
 *
 * TWO RULES DO THE WORK, and both are settled policy rather than new decisions:
 *
 *   1. `released_at is null` -- "everything that COUNTS days filters released
 *      days" (CLAUDE.md). A day dropped in advance departs the commitment: it
 *      is not a failure and not an absence, so it must leave the DENOMINATOR
 *      too. Leaving it in would turn every honest early release into a silent
 *      score penalty, which is the exact trap per-day release was built to
 *      remove.
 *   2. `isPresent` DEFAULTS PRESENT -- a day with no attendance row, or a row
 *      the organiser never resolved, counts as attended. Silence is not a
 *      judgement, so an organiser who never opens the attendance screen cannot
 *      cost a volunteer anything, and a flat phone is not an absence. The ratio
 *      falls only where a human actually marked somebody absent.
 *
 * Together those mean the ratio is 1.0, and the scaling therefore a no-op, for
 * every volunteer on the platform today -- which is why the recompute shipping
 * with this change can be checked against an empty dry-run report.
 *
 * An outreach with no live commitment rows gets NO entry, and the caller then
 * passes nulls, meaning "do not scale".
 */
async function loadDayCommitment(
  admin: SupabaseClient,
  applications: readonly { id: string; outreach_id: string }[],
  attendanceRows: readonly {
    outreach_id: string;
    outreach_day_id: string | null;
    organiser_status: "present" | "absent" | null;
  }[]
): Promise<Map<string, DayCommitment>> {
  const byOutreach = new Map<string, DayCommitment>();
  if (applications.length === 0) return byOutreach;

  const outreachByApplication = new Map<string, string>();
  for (const application of applications) {
    outreachByApplication.set(application.id, application.outreach_id);
  }

  const { data: committedDays } = await admin
    .from("application_days")
    .select("application_id, outreach_day_id")
    .in(
      "application_id",
      applications.map((application) => application.id)
    )
    .is("released_at", null);

  // Keyed on outreach AND day, not on the day alone: one volunteer holds days
  // across many outreaches, and a bare day id would collide between them.
  const resolved = new Map<string, { organiser_status: "present" | "absent" | null }>();
  for (const row of attendanceRows) {
    if (!row.outreach_day_id) continue;
    resolved.set(`${row.outreach_id}:${row.outreach_day_id}`, {
      organiser_status: row.organiser_status,
    });
  }

  for (const day of committedDays ?? []) {
    const outreachId = outreachByApplication.get(day.application_id as string);
    if (!outreachId) continue;

    const entry = byOutreach.get(outreachId) ?? { committed: 0, attended: 0 };
    entry.committed += 1;
    if (isPresent(resolved.get(`${outreachId}:${day.outreach_day_id as string}`))) {
      entry.attended += 1;
    }
    byOutreach.set(outreachId, entry);
  }

  return byOutreach;
}
