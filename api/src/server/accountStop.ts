import { getSupabaseAdmin } from "./supabaseAdmin";
import { notifyUsers } from "./notify";
import { emailApplicant, promoteFromWaitlist, type WaitlistOutreach } from "./waitlist";

/**
 * Stopping an account's FUTURE activity, without rewriting its past.
 *
 * Extracted from /api/moderation unchanged on 2026-08-31, when account closure
 * needed exactly the same two operations. It is the same call `server/waitlist.ts`
 * got when moderation needed the promotion rule: two copies of this would drift,
 * and the drift would be invisible because both copies would still "work" — one
 * of them would simply stop telling somebody their Saturday was cancelled.
 *
 * THE GOVERNING PRINCIPLE, and every decision below follows from it: what stops
 * is what has not happened yet. Attendance that happened happened, reviews stay
 * written, and a V-Score keeps meaning what it meant.
 *
 * The consequences are NOT symmetrical, because the two roles hold different
 * things:
 *
 *   - An ORGANISATION holds other people's Saturdays. Stopping it cancels its
 *     live events and tells everyone affected by push AND email, because a
 *     volunteer who turns up to a cancelled clinic has lost a day to our
 *     silence.
 *   - A VOLUNTEER holds a place somebody else could have had. Stopping them
 *     withdraws their live applications and hands each ACCEPTED place to the
 *     waitlist through the same promotion their own cancellation uses, so the
 *     organisation is not left short.
 *
 * NO V-SCORE PENALTY IS EVER APPLIED HERE, and that matters now that penalties
 * are live. These withdrawals are written straight to `applications` rather
 * than through /api/application-status, so they cannot reach the cancellation
 * deduction. That is deliberate in both callers: a suspended volunteer is being
 * stopped rather than choosing to pull out, and somebody closing their account
 * is leaving the platform, not abandoning an event. A parting deduction on an
 * account nobody will ever look at again would be pure spite.
 */

interface CancelledOutreach {
  id: string;
  title: string;
  date: string;
  location_name: string | null;
  organisation_id: string;
}
export async function stopOrganisation(
  admin: ReturnType<typeof getSupabaseAdmin>,
  organisationId: string,
  reason: string
): Promise<Record<string, unknown>> {
  const { data: live } = await admin
    .from("outreaches")
    .select("id, title, date, location_name, organisation_id")
    .eq("organisation_id", organisationId)
    .in("status", ["open", "closed"]);

  const outreaches = (live ?? []) as CancelledOutreach[];
  if (outreaches.length === 0) return { outreachesCancelled: 0, volunteersNotified: 0 };

  const ids = outreaches.map((o) => o.id);
  await admin.from("outreaches").update({ status: "cancelled" }).in("id", ids);

  // Everyone holding a place, and everyone still hoping for one. A waitlisted
  // volunteer has kept the date free; not telling them would be the same
  // failure as not telling an accepted one, just cheaper for us.
  const { data: affected } = await admin
    .from("applications")
    .select("volunteer_id, outreach_id")
    .in("outreach_id", ids)
    .in("status", ["accepted", "waitlisted", "pending"]);

  const byOutreach = new Map(outreaches.map((o) => [o.id, o]));
  const rows = (affected ?? []) as { volunteer_id: string; outreach_id: string }[];

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("user_id, expo_push_token")
    .in("user_id", Array.from(new Set(rows.map((r) => r.volunteer_id))));

  const tokensByUser = new Map<string, string[]>();
  for (const row of tokens ?? []) {
    const list = tokensByUser.get(row.user_id as string) ?? [];
    list.push(row.expo_push_token as string);
    tokensByUser.set(row.user_id as string, list);
  }

  await notifyUsers(
    rows.map((row) => {
      const outreach = byOutreach.get(row.outreach_id);
      return {
        userId: row.volunteer_id,
        type: "application_status" as const,
        title: "An outreach was cancelled",
        body: `${outreach?.title ?? "An outreach"} will no longer take place. You do not need to attend.`,
        outreachId: row.outreach_id,
        data: { outreachId: row.outreach_id, status: "cancelled" },
        tokens: tokensByUser.get(row.volunteer_id) ?? [],
      };
    })
  );

  // Email as well as push, because this one costs somebody a day if it is
  // missed — the same reason the application-status decision emails exist.
  for (const row of rows) {
    const outreach = byOutreach.get(row.outreach_id);
    if (outreach) {
      await emailApplicant(admin, row.volunteer_id, outreach as WaitlistOutreach, "cancelled");
    }
  }

  return {
    outreachesCancelled: outreaches.length,
    volunteersNotified: rows.length,
    moderationReason: reason,
  };
}

/**
 * A volunteer's future stops: their live applications are withdrawn, and every
 * accepted place goes to the waitlist through the same promotion their own
 * cancellation would have used.
 *
 * Attendance rows, reviews and their V-Score are untouched. They took part in
 * what they took part in.
 */
export async function stopVolunteer(
  admin: ReturnType<typeof getSupabaseAdmin>,
  volunteerId: string
): Promise<Record<string, unknown>> {
  const { data: live } = await admin
    .from("applications")
    .select("id, outreach_id, status")
    .eq("volunteer_id", volunteerId)
    .in("status", ["accepted", "waitlisted", "pending"]);

  const applications = (live ?? []) as { id: string; outreach_id: string; status: string }[];
  if (applications.length === 0) return { applicationsWithdrawn: 0, placesBackfilled: 0 };

  let backfilled = 0;

  for (const application of applications) {
    const { error } = await admin
      .from("applications")
      .update({ status: "cancelled" })
      .eq("id", application.id);

    if (error) continue;

    // Only an ACCEPTED place frees a seat. A withdrawn pending or waitlisted
    // application was never holding one, so promoting against it would accept
    // somebody into a slot that is still legitimately full.
    if (application.status !== "accepted") continue;

    const { data: outreach } = await admin
      .from("outreaches")
      .select("id, organisation_id, title, date, location_name")
      .eq("id", application.outreach_id)
      .maybeSingle();

    if (!outreach) continue;
    const promoted = await promoteFromWaitlist(admin, outreach as WaitlistOutreach);
    if (promoted) backfilled += 1;
  }

  return { applicationsWithdrawn: applications.length, placesBackfilled: backfilled };
}