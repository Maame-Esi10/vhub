import { getSupabaseAdmin } from "./supabaseAdmin";
import { recordLateReleasePenalty } from "./scorePenalties";

/**
 * The nightly catch-up for late per-day releases that were never charged.
 *
 * WHY IT EXISTS. Releasing a day is a direct client write — the volunteer
 * updates `application_days.released_at` and a database trigger decides whether
 * it was late. The deduction, though, needs the service role, so the app calls
 * `/api/vscore` afterwards. That call can simply not happen: the network drops,
 * the app is closed, or a crafted client deliberately omits it. Without a
 * backstop, "penalties are live" would really mean "penalties are live for
 * volunteers whose phone cooperated", which is worse than not having them.
 *
 * The cancellation penalty needs no equivalent, and that asymmetry is worth
 * stating so nobody later "fixes" it: a cancellation is applied inside the same
 * server request that performs the cancellation, so there is no window in which
 * one exists without the other. Nothing is left to detect afterwards — the row
 * does not even record what it used to be.
 *
 * SAFE TO RUN EVERY NIGHT, AND TWICE. `recordLateReleasePenalty` deduplicates
 * on the released day plus the moment it was released, so a release the app
 * already charged is a no-op here rather than a second deduction. That property
 * is the whole reason the sweep can be this blunt.
 */

/**
 * Releases made before this instant are IGNORED, permanently.
 *
 * Penalties went live on this date. Charging somebody for a day they dropped
 * while the app was telling them nothing would happen is retroactive
 * punishment, and it would arrive as a score drop with no act attached to it.
 * The warning copy shown before a late drop has always said it would be
 * recorded; it has only recently been true that it costs anything.
 *
 * This is a floor, not a window: it never moves forward, so a release from any
 * time after the rule started applying is still caught if it was missed.
 */
const PENALTIES_LIVE_FROM = "2026-08-31T00:00:00.000Z";

/**
 * How far back a single run looks. Bounded so the nightly job stays cheap; the
 * floor above is what actually decides eligibility.
 *
 * Thirty days is generous against the failure it exists for — a call that did
 * not arrive is normally caught the same night — and a release older than that
 * with no deduction against it is stale enough that charging it would land as a
 * score drop nobody can connect to anything.
 */
const LOOKBACK_DAYS = 30;

export interface LateReleaseSweepResult {
  /** Late releases considered this run. */
  examined: number;
  /** Deductions actually written. */
  charged: number;
  /** Points deducted in total, as a negative number. */
  points: number;
  /** Releases that needed nothing: already charged, or inside the allowance. */
  skipped: number;
  /** Releases that could not be processed, with the reason. */
  failed: { applicationDayId: string; reason: string }[];
}

export async function sweepUnchargedLateReleases(): Promise<LateReleaseSweepResult> {
  const admin = getSupabaseAdmin();

  const lookbackFrom = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const from = lookbackFrom > PENALTIES_LIVE_FROM ? lookbackFrom : PENALTIES_LIVE_FROM;

  /*
    ONLY ACCEPTED APPLICATIONS, matching the rule the live path applies: a
    volunteer who was pending or waitlisted took no place from anybody by
    dropping a day. Filtered in the query rather than checked per row so the
    sweep does not walk rows it can never charge.
  */
  const { data: releases, error } = await admin
    .from("application_days")
    .select(
      "id, released_at, application_id, outreach_day_id, applications!inner(id, volunteer_id, outreach_id, status)"
    )
    .eq("late_release", true)
    .eq("applications.status", "accepted")
    .gte("released_at", from)
    .order("released_at", { ascending: true })
    .limit(500);

  const result: LateReleaseSweepResult = {
    examined: 0,
    charged: 0,
    points: 0,
    skipped: 0,
    failed: [],
  };

  if (error) {
    result.failed.push({ applicationDayId: "-", reason: error.message });
    return result;
  }

  const rows = releases ?? [];
  result.examined = rows.length;
  if (rows.length === 0) return result;

  /*
    WHICH ONES ARE ALREADY CHARGED, in ONE query rather than one per release.
    The dedupe key is exactly reproducible from the row, so this is a set
    membership test rather than a join.
  */
  const expectedKeys = rows.map(
    (row) => `late_release:${row.id as string}:${row.released_at as string}`
  );
  const { data: existing } = await admin
    .from("score_events")
    .select("dedupe_key")
    .eq("kind", "late_release")
    .in("dedupe_key", expectedKeys);

  const alreadyCharged = new Set((existing ?? []).map((row) => row.dedupe_key as string));

  for (const row of rows) {
    const key = `late_release:${row.id as string}:${row.released_at as string}`;
    if (alreadyCharged.has(key)) {
      result.skipped += 1;
      continue;
    }

    const application = row.applications as unknown as {
      id: string;
      volunteer_id: string;
      outreach_id: string;
    };

    try {
      const { data: outreach } = await admin
        .from("outreaches")
        .select("title")
        .eq("id", application.outreach_id)
        .maybeSingle();

      const outcome = await recordLateReleasePenalty(admin, {
        volunteerId: application.volunteer_id,
        applicationId: application.id,
        outreachId: application.outreach_id,
        outreachDayId: row.outreach_day_id as string,
        outreachTitle: (outreach?.title as string | null) ?? null,
      });

      if (outcome.outcome) {
        result.charged += 1;
        result.points += outcome.points;
      } else {
        result.skipped += 1;
      }
    } catch (err) {
      // One bad row must not stop the sweep: the next release belongs to a
      // different volunteer and has nothing to do with this failure.
      result.failed.push({
        applicationDayId: row.id as string,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
