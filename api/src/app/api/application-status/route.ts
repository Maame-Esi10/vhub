import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { sendApplicationStatusEmail, type ApplicationStatusEmailKind } from "../../../server/resend";
import { notifyUsers } from "../../../server/notify";

export const runtime = "nodejs";

/** Postgres check-constraint violation -- here, `slots_filled <= slots_total`. */
const CHECK_VIOLATION = "23514";

// ---------------------------------------------------------------------------
// Request contract
//
//   { applicationId, status: 'accepted' | 'rejected' | 'waitlisted' | 'cancelled' }
//
// Auth:
//   - accepted / rejected / waitlisted: caller must be the organisation that
//     owns the application's outreach (a hiring decision).
//   - cancelled: caller must be EITHER that organisation OR the applying
//     volunteer themselves (a volunteer withdrawing their own spot).
//
// ASSUMPTION flagged for owner sign-off (see final report): the mobile app's
// existing `useCancelApplication` hook (hooks/useApplications.ts) already
// writes `status = 'cancelled'` directly via Supabase + RLS, which is what
// stamps `cancelled_at`/`late_cancellation` (trg_applications_stamp_cancellation)
// and re-derives `slots_filled` (trg_applications_sync_slots_filled). THIS
// endpoint does not replace that write -- CLAUDE.md's waitlist-promotion
// requirement ("on cancellation of an accepted spot... promote the
// highest-match-score waitlisted applicant and notify them") needs a
// service-role actor to promote someone else's application and email them,
// which a volunteer's own JWT can never do under RLS. So the recommended
// client flow is: call the existing hook first (or skip it and let this
// endpoint's own idempotent 'cancelled' write do it), THEN call this
// endpoint with status: 'cancelled' so the promotion + notification step
// actually runs. This endpoint's write is idempotent (setting an
// already-cancelled row to 'cancelled' again is a no-op), so calling it
// unconditionally after any cancellation path is safe.
// ---------------------------------------------------------------------------

const StatusChangeBody = z.object({
  applicationId: z.string().uuid(),
  status: z.enum(["accepted", "rejected", "waitlisted", "cancelled"]),
});

interface ApplicationRow {
  id: string;
  outreach_id: string;
  volunteer_id: string;
  status: string;
  match_score: number | null;
}

interface OutreachRow {
  id: string;
  organisation_id: string;
  title: string;
  date: string;
  location_name: string | null;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await authenticate(req);
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = StatusChangeBody.parse(json);

    const admin = getSupabaseAdmin();

    const { data: application, error: applicationError } = await admin
      .from("applications")
      .select("id, outreach_id, volunteer_id, status, match_score")
      .eq("id", body.applicationId)
      .maybeSingle();
    if (applicationError) throw Errors.internal("Could not load the application.");
    if (!application) throw Errors.notFound("Application not found.");

    const { data: outreach, error: outreachError } = await admin
      .from("outreaches")
      .select("id, organisation_id, title, date, location_name")
      .eq("id", application.outreach_id)
      .maybeSingle();
    if (outreachError || !outreach) throw Errors.notFound("Outreach not found.");

    const isOwningOrg = caller.role === "organisation" && caller.userId === outreach.organisation_id;
    const isOwnVolunteer = caller.role === "volunteer" && caller.userId === application.volunteer_id;

    if (body.status === "cancelled") {
      if (!isOwningOrg && !isOwnVolunteer) {
        throw Errors.forbidden("You are not allowed to cancel this application.");
      }
    } else if (!isOwningOrg) {
      throw Errors.forbidden("Only the organisation running this outreach can set this status.");
    }

    const previousStatus = application.status;
    if (previousStatus === body.status) {
      // Idempotent no-op -- e.g. the volunteer's own direct cancel already
      // ran and this call is just here to trigger the promotion check.
      return Response.json(await maybePromoteWaitlist(admin, outreach as OutreachRow, application as ApplicationRow, previousStatus, body.status));
    }

    const { data: updated, error: updateError } = await admin
      .from("applications")
      .update({ status: body.status })
      .eq("id", body.applicationId)
      .select("id, outreach_id, volunteer_id, status, match_score")
      .single();

    if (updateError) {
      if ((updateError as { code?: string }).code === CHECK_VIOLATION) {
        throw Errors.conflict(
          "This outreach is already full. Close a slot or increase the total before accepting another volunteer."
        );
      }
      throw Errors.internal("Could not update this application's status.");
    }

    const result = await maybePromoteWaitlist(
      admin,
      outreach as OutreachRow,
      updated as ApplicationRow,
      previousStatus,
      body.status
    );

    // Email the applicant for an organisation-driven decision. A volunteer's
    // own cancellation doesn't need one -- they already know.
    if (isOwningOrg && (body.status === "accepted" || body.status === "rejected" || body.status === "waitlisted")) {
      await emailApplicant(admin, application.volunteer_id, outreach as OutreachRow, body.status);
    }

    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Waitlist policy (ASSUMPTION flagged for owner sign-off): promotion is
 * AUTOMATIC, not a manual org action -- the moment an accepted application
 * transitions to cancelled, the outreach's highest-match_score 'waitlisted'
 * application (ties broken by earliest application) is promoted to
 * 'accepted' and emailed + pushed immediately. This keeps a freed slot from
 * sitting empty waiting for an org admin to notice and matches the "M" in
 * V-HUB's matching engine (best-fit-first). An alternative (org manually
 * picks from the waitlist) was considered but rejected as slower and less
 * automated than the project's stated intelligence goals.
 */
async function maybePromoteWaitlist(
  admin: SupabaseClient,
  outreach: OutreachRow,
  application: ApplicationRow,
  previousStatus: string,
  newStatus: string
) {
  if (!(previousStatus === "accepted" && newStatus === "cancelled")) {
    return { application, promoted: null as ApplicationRow | null };
  }

  const { data: waitlisted, error } = await admin
    .from("applications")
    .select("id, outreach_id, volunteer_id, status, match_score")
    .eq("outreach_id", outreach.id)
    .eq("status", "waitlisted")
    .order("match_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !waitlisted) {
    return { application, promoted: null as ApplicationRow | null };
  }

  const { data: promoted, error: promoteError } = await admin
    .from("applications")
    .update({ status: "accepted" })
    .eq("id", waitlisted.id)
    .select("id, outreach_id, volunteer_id, status, match_score")
    .single();

  if (promoteError || !promoted) {
    return { application, promoted: null as ApplicationRow | null };
  }

  await emailApplicant(admin, promoted.volunteer_id, outreach, "accepted");
  await pushApplicant(admin, promoted.volunteer_id, outreach, "accepted");

  return { application, promoted: promoted as ApplicationRow };
}

async function emailApplicant(
  admin: SupabaseClient,
  volunteerId: string,
  outreach: OutreachRow,
  kind: ApplicationStatusEmailKind
): Promise<void> {
  const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", volunteerId).maybeSingle();
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

async function pushApplicant(
  admin: SupabaseClient,
  volunteerId: string,
  outreach: OutreachRow,
  kind: ApplicationStatusEmailKind
): Promise<void> {
  const { data: tokens } = await admin.from("push_tokens").select("expo_push_token").eq("user_id", volunteerId);
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
