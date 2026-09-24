import type { SupabaseClient } from "@supabase/supabase-js";
import { sendApplicationStatusEmail, type ApplicationStatusEmailKind } from "./email";
import { notifyUsers } from "./notify";
import { rankApplicants } from "@/lib/roster";

/**
 * Waitlist promotion, and the two ways an applicant is told about a decision.
 *
 * EXTRACTED FROM /api/application-status IN PACKAGE F, unchanged, because
 * moderation needs the same behaviour: suspending a volunteer releases their
 * accepted places, and a released place must go to the waitlist exactly as it
 * does when the volunteer cancels it themselves. Re-implementing that in the
 * moderation route would be a second promotion rule free to drift from the
 * first — and the drift would be invisible, because both would "work".
 */

export interface WaitlistOutreach {
  id: string;
  organisation_id: string;
  title: string;
  date: string;
  location_name: string | null;
}

export interface WaitlistApplication {
  id: string;
  outreach_id: string;
  volunteer_id: string;
  status: string;
  match_score: number | null;
}

export async function emailApplicant(
  admin: SupabaseClient,
  volunteerId: string,
  outreach: WaitlistOutreach,
  kind: ApplicationStatusEmailKind
): Promise<void> {
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", volunteerId)
    .maybeSingle();
  if (!profile?.email) return;
  await sendApplicationStatusEmail({
    to: profile.email,
    volunteerName: profile.full_name ?? "there",
    outreachTitle: outreach.title,
    outreachDate: outreach.date,
    locationName: outreach.location_name,
    kind,
  });
}

export async function pushApplicant(
  admin: SupabaseClient,
  volunteerId: string,
  outreach: WaitlistOutreach,
  kind: ApplicationStatusEmailKind
): Promise<void> {
  const { data: tokens } = await admin
    .from("push_tokens")
    .select("expo_push_token")
    .eq("user_id", volunteerId);
  // NOT gated on having a token: notifyUsers records the in-app notification
  // row regardless, so a volunteer who declined the OS permission prompt (or
  // is between devices) still sees the decision on the Notifications screen.
  await notifyUsers([
    {
      userId: volunteerId,
      type: "application_status",
      title: kind === "accepted" ? "You're confirmed!" : "Application update",
      body: `${outreach.title}: your application is now ${kind}.`,
      outreachId: outreach.id,
      data: { outreachId: outreach.id, status: kind },
      tokens: (tokens ?? []).map((t) => t.expo_push_token as string),
    },
  ]);
}

/**
 * Waitlist policy: promotion is AUTOMATIC. The moment an accepted application
 * transitions to cancelled, the outreach's FIRST-RANKED `waitlisted`
 * application is promoted to `accepted` and emailed + pushed immediately.
 *
 * "First-ranked" is `rankApplicants` from lib/roster.ts: match score times the
 * V-Score reliability multiplier, ties to the earliest application. It is the
 * SAME order /api/waitlist-position shows each volunteer and the same order
 * "Accept top N" uses (fixed 2026-09-24). Promotion used to take the highest
 * RAW match_score, so a volunteer told "position 1" could be passed over for an
 * At Risk volunteer whose raw score was higher but whose ranking was lower.
 *
 * This keeps a freed slot from sitting empty
 * waiting for an organiser to notice, and matches the best-fit-first behaviour
 * the matching engine is built around.
 *
 * Returns the promoted application, or null when there was nobody to promote.
 */
export async function promoteFromWaitlist(
  admin: SupabaseClient,
  outreach: WaitlistOutreach
): Promise<WaitlistApplication | null> {
  const { data: rows, error } = await admin
    .from("applications")
    .select("id, outreach_id, volunteer_id, status, match_score, created_at, volunteer:volunteer_profiles(v_score)")
    .eq("outreach_id", outreach.id)
    .eq("status", "waitlisted");

  if (error || !rows || rows.length === 0) return null;

  const ranked = rankApplicants(
    (rows as unknown as {
      id: string;
      match_score: number | null;
      created_at: string;
      volunteer: { v_score: number | null } | null;
    }[]).map((row) => ({
      id: row.id,
      status: "waitlisted" as const,
      matchScore: row.match_score,
      vScore: row.volunteer?.v_score ?? null,
      createdAt: row.created_at,
    }))
  );
  const waitlisted = ranked[0];
  if (!waitlisted) return null;

  const { data: promoted, error: promoteError } = await admin
    .from("applications")
    .update({ status: "accepted" })
    .eq("id", waitlisted.id)
    .select("id, outreach_id, volunteer_id, status, match_score")
    .single();

  if (promoteError || !promoted) return null;

  await emailApplicant(admin, promoted.volunteer_id, outreach, "accepted");
  await pushApplicant(admin, promoted.volunteer_id, outreach, "accepted");

  return promoted as WaitlistApplication;
}
