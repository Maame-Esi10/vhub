import { Errors } from "./httpErrors";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { notifyUsers, type UserNotification } from "./notify";
import { toOutreachInput } from "./outreachInput";
import { env } from "./env";
import { computeLayer1MatchScore, type Layer1VolunteerInput } from "@/lib/matching/layer1";
import { getReachableRegions } from "@/constants/ghana-locations";
import {
  UNDER_SUBSCRIPTION_STAGES,
  isUnderSubscribed,
  organisationShortfallMessage,
  volunteerShortfallMessage,
  type UnderSubscriptionStage,
} from "@/lib/underSubscription";

/**
 * The staged under-subscription escalation: 7, 3 and 1 days before an open
 * outreach that is still short of volunteers.
 *
 * The rule the copy obeys — inform, never advise — is documented and tested in
 * lib/underSubscription.ts. This file is the I/O half: which rows to look at,
 * who to tell, and how not to tell them twice.
 *
 * RIDES THE DAILY CRON. Vercel's Hobby plan permits exactly one cron per day
 * (see eventReminders.ts), so this runs from the same 08:00 job. That is also
 * why the stages test for an EXACT day count rather than a window: the job
 * runs once a day, so "exactly 7 days out" is hit exactly once per outreach.
 * If the job ever misses a day, that outreach simply skips that rung of the
 * ladder rather than firing late — a "7 days to go" notice arriving 6 days out
 * is worse than none.
 *
 * DEDUPED WITHOUT A SCHEMA CHANGE, the same way the check-in reminder is: each
 * notification is stamped `data->>'stage'` with the stage key, and the pass
 * reads those rows back before sending. Schema changes are gated (CLAUDE.md),
 * and the notifications table already carries everything needed.
 */

export interface UnderSubscriptionResult {
  /** Open, under-filled outreaches that hit a stage today. */
  outreachesEscalated: number;
  /** Organisations told about a shortfall. */
  organisationsNotified: number;
  /** Volunteers told about an event with places left. */
  volunteersNotified: number;
}

interface OutreachRow extends Record<string, unknown> {
  id: string;
  organisation_id: string;
  title: string;
  date: string;
  status: string;
  region: string | null;
  role_type: string | null;
  slots_total: number;
  slots_filled: number;
}

interface CandidateRow {
  id: string;
  category: Layer1VolunteerInput["category"];
  skill_tags: string[] | null;
  experience_level: Layer1VolunteerInput["experience_level"];
  availability_slots: string[] | null;
  verification_status: string;
  profile: {
    region: string | null;
    district: string | null;
    push_tokens: Array<{ expo_push_token: string }> | null;
  } | null;
}

/** YYYY-MM-DD, `days` from today. Ghana is UTC+0 year-round, so UTC is the local date. */
function dateInDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function escalateUnderSubscribedOutreaches(): Promise<UnderSubscriptionResult> {
  const admin = getSupabaseAdmin();

  const result: UnderSubscriptionResult = {
    outreachesEscalated: 0,
    organisationsNotified: 0,
    volunteersNotified: 0,
  };

  /*
    THE LADDER CLIMBS PER DAY, NOT PER EVENT.

    It used to select on `outreaches.date`, which is the FIRST day, and judge
    the shortfall on `slots_filled`, which counts accepted PEOPLE. Two things
    fell through that:

      * A campaign short on day five never escalated at all, because only its
        first day was ever three days away.
      * Once a volunteer could release one day of a multi-day outreach, an
        event could read "5 of 5 filled" while a day of it had four. The
        ladder read the full number and stayed silent about the short day.

    Now each DAY is its own rung: the job looks for days landing exactly
    stage.daysOut away, counts who is still committed to that day, and
    escalates the ones below the outreach's target. Nothing new is stored --
    the count is derived from commitment rows that already exist. See
    lib/dayCoverage.ts for why a per-day slot column was rejected, and note
    that the TARGET is still the event's own `slots_total`: per-day targets are
    a statement of intent and cannot be derived from anything.

    Deduped on stage + day id, so each day escalates once on its own schedule
    rather than one day silencing the rest -- the same lesson the check-in
    reminders learned.
  */
  for (const stage of UNDER_SUBSCRIPTION_STAGES) {
    const { data: dayRows, error } = await admin
      .from("outreach_days")
      .select(
        "id, day, outreach_id, outreaches!inner (id, organisation_id, title, date, status, region, district, role_type, required_skills, required_category, start_time, end_time, slots_total, slots_filled)"
      )
      .eq("day", dateInDays(stage.daysOut))
      .eq("outreaches.status", "open");
    if (error) throw Errors.internal("Could not load outreaches for the under-subscription check.");

    for (const dayRow of (dayRows ?? []) as unknown as OutreachDayRow[]) {
      const row = dayRow.outreaches;
      if (!row || row.slots_total <= 0) continue;

      const filledThisDay = await countLiveCommitments(dayRow.id);
      if (filledThisDay >= row.slots_total) continue;

      if (await alreadyEscalated(row.id, stage.key, dayRow.id)) continue;

      // Volunteers first, so the organisation's message can report how many
      // people were actually reached rather than promising a fan-out that may
      // have found nobody.
      const volunteersNotified = await notifyNearbyVolunteers(row, stage);
      await notifyOrganisation(row, stage, volunteersNotified, {
        outreachDayId: dayRow.id,
        day: dayRow.day,
        filledThisDay,
      });

      result.outreachesEscalated += 1;
      result.organisationsNotified += 1;
      result.volunteersNotified += volunteersNotified;
    }
  }

  return result;
}

interface OutreachDayRow {
  id: string;
  day: string;
  outreach_id: string;
  outreaches: OutreachRow | null;
}

/**
 * Accepted volunteers still committed to one specific day.
 *
 * `!inner` is what makes the status filter apply to the parent application
 * rather than merely nulling the embed, and `released_at is null` is what makes
 * a released day actually go short -- without it this would count promises that
 * have since been withdrawn.
 */
async function countLiveCommitments(outreachDayId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const { count } = await admin
    .from("application_days")
    .select("id, applications!inner (status)", { count: "exact", head: true })
    .eq("outreach_day_id", outreachDayId)
    .eq("applications.status", "accepted")
    .is("released_at", null);

  return count ?? 0;
}

/**
 * Has this outreach already been escalated at this stage, for this day?
 *
 * Keyed on the outreach and the stage, not on the recipient: the organisation
 * notification is the one row guaranteed to exist for every escalation (the
 * volunteer fan-out can legitimately reach nobody), so it is the reliable
 * marker that this rung has been climbed.
 */
async function alreadyEscalated(
  outreachId: string,
  stageKey: string,
  outreachDayId: string
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("notifications")
    .select("id, data")
    .eq("outreach_id", outreachId)
    .eq("type", "event_reminder");

  return (data ?? []).some((row) => {
    const payload = row.data as Record<string, unknown> | null;
    if (payload?.stage !== stageKey) return false;
    // A row written before days were part of this key carried no day at all.
    // Treating it as covering every day keeps an old escalation from being
    // repeated once for each day of the outreach.
    return payload?.outreachDayId === undefined || payload?.outreachDayId === outreachDayId;
  });
}

interface EscalatedDay {
  outreachDayId: string;
  day: string;
  filledThisDay: number;
}

async function notifyOrganisation(
  outreach: OutreachRow,
  stage: UnderSubscriptionStage,
  volunteersNotified: number,
  escalatedDay: EscalatedDay
): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("expo_push_token")
    .eq("user_id", outreach.organisation_id);

  await notifyUsers([
    {
      userId: outreach.organisation_id,
      type: "event_reminder",
      title: stage.daysOut === 1 ? "Tomorrow, still short of volunteers" : "Your outreach still has places",
      // The count is THIS DAY's, not the event's. On a one-day outreach the
      // two are identical, which is why nothing changes for the ordinary case.
      body: organisationShortfallMessage({
        outreachTitle: outreach.title,
        slotsFilled: escalatedDay.filledThisDay,
        slotsTotal: outreach.slots_total,
        daysOut: stage.daysOut,
        volunteersNotified,
        day: outreach.date === escalatedDay.day ? undefined : escalatedDay.day,
      }),
      outreachId: outreach.id,
      // `stage` + `outreachDayId` are the dedupe key read back by
      // alreadyEscalated(), so each day climbs the ladder on its own.
      data: {
        outreachId: outreach.id,
        stage: stage.key,
        outreachDayId: escalatedDay.outreachDayId,
        slotsFilled: escalatedDay.filledThisDay,
        slotsTotal: outreach.slots_total,
      },
      tokens: (tokens ?? []).map((t) => t.expo_push_token as string),
    },
  ]);
}

/**
 * Tells matching volunteers who have not applied that this event still has
 * room. Returns how many were told.
 *
 * Two deliberate departures from `notifyCandidates` in /api/match:
 *
 * 1. **Reach widens with urgency.** At three days out the pool is the
 *    outreach's own region; at one day it is that region plus every adjacent
 *    one (GHANA_REGION_ADJACENCY). Someone willing to travel a region over
 *    matters more the day before an under-staffed clinic than a tidy catchment
 *    area does.
 *
 * 2. **Unverified volunteers are included for SUPPORT-role outreaches.**
 *    notifyCandidates filters to `verified` across the board, which is right
 *    for a routine new-match ping but wrong here: the verification gate only
 *    restricts CLINICAL events, so support roles are exactly what an
 *    unverified volunteer may Quick Join. Excluding them from an
 *    under-subscribed support event would hide the shortfall from the very
 *    people eligible to fix it. Clinical outreaches stay verified-only —
 *    notifying someone who cannot apply is not outreach, it is spam.
 */
async function notifyNearbyVolunteers(
  outreach: OutreachRow,
  stage: UnderSubscriptionStage
): Promise<number> {
  if (stage.reach === "organisation_only") return 0;
  if (!outreach.region) return 0;

  const admin = getSupabaseAdmin();

  const regions =
    stage.reach === "adjacent_regions" ? getReachableRegions(outreach.region) : [outreach.region];

  const { data: existingApplications } = await admin
    .from("applications")
    .select("volunteer_id")
    .eq("outreach_id", outreach.id);
  const alreadyApplied = new Set((existingApplications ?? []).map((a) => a.volunteer_id as string));

  let query = admin
    .from("volunteer_profiles")
    .select(
      `
      id, category, skill_tags, experience_level, availability_slots, verification_status,
      profile:profiles!inner ( region, district, push_tokens ( expo_push_token ) )
    `
    )
    .in("profile.region", regions);

  if (outreach.role_type !== "support") {
    query = query.eq("verification_status", "verified");
  }

  const { data, error } = await query;
  if (error) return 0;

  const outreachInput = toOutreachInput(outreach);
  const threshold = env.notifyMatchThreshold;
  const pending: UserNotification[] = [];

  for (const candidate of (data ?? []) as unknown as CandidateRow[]) {
    if (alreadyApplied.has(candidate.id)) continue;

    // Layer 1 only. This is a broad scan across potentially several regions,
    // and the Gemini free-tier quota is reserved for the higher-value
    // per-applicant scoring path — the same trade-off notifyCandidates makes.
    const { total } = computeLayer1MatchScore(
      {
        category: candidate.category,
        skill_tags: candidate.skill_tags,
        experience_level: candidate.experience_level,
        availability_slots: candidate.availability_slots,
        region: candidate.profile?.region ?? null,
        district: candidate.profile?.district ?? null,
      },
      outreachInput
    );
    if (total < threshold) continue;

    pending.push({
      userId: candidate.id,
      type: "new_match",
      title: "Volunteers still needed",
      body: volunteerShortfallMessage({
        outreachTitle: outreach.title,
        slotsFilled: outreach.slots_filled,
        slotsTotal: outreach.slots_total,
        daysOut: stage.daysOut,
        matchScore: total,
      }),
      outreachId: outreach.id,
      data: { outreachId: outreach.id, stage: stage.key, matchScore: Math.round(total) },
      tokens: (candidate.profile?.push_tokens ?? []).map((t) => t.expo_push_token),
    });
  }

  await notifyUsers(pending);
  return pending.length;
}
