import type { SupabaseClient } from "@supabase/supabase-js";
import { replayVScore, type ReplayEvent } from "@/lib/vscore";

/**
 * Rebuilds one volunteer's V-Score from their whole history.
 *
 * THE SCORE IS DERIVED NOW. `volunteer_profiles.v_score` is a CACHE of this
 * function's result, not the truth; the truth is `event_reviews` plus any
 * upheld `disputes`. Anything that used to move the score by arithmetic on the
 * stored value calls this instead.
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
 * ORDER IS FILING ORDER (`created_at`, then `id`), and it must stay that way —
 * see the long note in lib/vscore.ts for why event date would rewrite
 * trajectories that were never wrong.
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
}

export async function replayAndStoreVScore(
  admin: SupabaseClient,
  volunteerId: string
): Promise<ReplayOutcome> {
  const [{ data: profile }, { data: reviews }, { data: disputes }] = await Promise.all([
    admin
      .from("volunteer_profiles")
      .select("v_score, events_attended")
      .eq("id", volunteerId)
      .maybeSingle(),
    admin
      .from("event_reviews")
      .select("outreach_id, attended, reliability_score, clinical_score, created_at, id")
      // The ordering IS the algorithm, not a presentation choice. `id` breaks
      // ties so two reviews filed in the same millisecond replay the same way
      // every time — without it the score would be non-deterministic.
      .eq("volunteer_id", volunteerId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    admin
      .from("disputes")
      .select("outreach_id, type")
      .eq("volunteer_id", volunteerId)
      .eq("status", "upheld"),
  ]);

  const upheldAny = new Set<string>();
  const upheldAttendance = new Set<string>();
  for (const dispute of disputes ?? []) {
    const outreachId = dispute.outreach_id as string;
    upheldAny.add(outreachId);
    if (dispute.type === "attendance") upheldAttendance.add(outreachId);
  }

  const events: ReplayEvent[] = (reviews ?? []).map((review) => ({
    attended: review.attended as boolean | null,
    reliability_score: review.reliability_score as number | null,
    clinical_score: review.clinical_score as number | null,
    outcomeVoided: upheldAny.has(review.outreach_id as string),
    attendanceCorrected: upheldAttendance.has(review.outreach_id as string),
  }));

  const result = replayVScore(events);
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
    correctedEvents: events.filter((event) => event.outcomeVoided).length,
  };
}
