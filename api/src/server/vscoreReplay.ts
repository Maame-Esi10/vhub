import type { SupabaseClient } from "@supabase/supabase-js";
import { replayVScore, type ReplayEntry } from "@/lib/vscore";

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
  volunteerId: string
): Promise<ReplayOutcome> {
  const [{ data: profile }, { data: reviews }, { data: disputes }, { data: penalties }] =
    await Promise.all([
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
    ]);

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
  };
}
