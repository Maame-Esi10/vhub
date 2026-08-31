import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import {
  sendApplicationStatusEmails,
  type ApplicationStatusEmailKind,
  type ApplicationStatusEmailParams,
} from "../../../server/resend";
import { notifyUsers, type UserNotification } from "../../../server/notify";
import { emailApplicant, pushApplicant, promoteFromWaitlist } from "../../../server/waitlist";

import { recordCancellationPenalty } from "../../../server/scorePenalties";
import { getVScoreBand } from "@/lib/vscore";

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
// [SUPERSEDED 2026-08-31 -- kept because the reasoning below still explains
// why the endpoint is idempotent. The volunteer no longer cancels the row
// directly; see "THE CANCELLATION PENALTY" below.]
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
  /**
   * The withdrawal reason from the Figma "Withdrawal Process" screen, written
   * in the same statement as the status change.
   *
   * It used to be written by the client in its own direct update, which is no
   * longer possible: the client must not cancel the row itself (see the note
   * on the penalty below), and `applications_update_own_cancel` would refuse an
   * update that set only the reason while the status was still 'pending'.
   */
  cancellationReason: z.string().trim().max(1000).nullish(),
});

// ---------------------------------------------------------------------------
// Batch contract (oversubscription -- design decision 5, 2026-08-05)
//
//   { outreachId, decisions: [{ applicationId, status }, ...] }
//
// One request decides many applicants at once, which is what the
// organisation's "Accept top N" action needs: accepting ten volunteers and
// waitlisting thirty as thirty-one separate HTTP calls would take the best
// part of a minute, could half-fail with no way to tell where, and would run
// straight into Resend's ~2-requests-per-second free-tier limit.
//
// 'cancelled' is deliberately NOT accepted here. A cancellation is a single
// person's decision about their own place, carries its own timestamp and
// late-cancellation stamping, and triggers waitlist promotion -- none of which
// makes sense as a bulk operation.
//
// The ORDER of `decisions` matters for accepts: the server fills free slots in
// the order given and stops when the event is full, so the client sends its
// best-ranked applicants first. That ordering is computed by lib/roster.ts
// (`planBatchAccept`) and is the same order the organisation saw on screen.
// ---------------------------------------------------------------------------

const BatchStatusBody = z.object({
  outreachId: z.string().uuid(),
  decisions: z
    .array(
      z.object({
        applicationId: z.string().uuid(),
        status: z.enum(["accepted", "rejected", "waitlisted"]),
      })
    )
    .min(1)
    .max(200),
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

    // Discriminated on the presence of `decisions` rather than a mode string,
    // so the existing single-application contract is untouched.
    if (json && typeof json === "object" && "decisions" in json) {
      return Response.json(await handleBatch(caller, BatchStatusBody.parse(json)));
    }

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
      /*
        Idempotent no-op: the row already reads what the caller asked for, so
        only the promotion check is worth running.

        NO PENALTY IS APPLIED ON THIS PATH, and it is not an omission. If the
        row already says 'cancelled', what it said BEFORE is gone, and a penalty
        applied here could not tell an abandoned accepted place from a withdrawn
        pending application. Charging on a guess is worse than not charging, so
        this branch deliberately does nothing to the score.
      */
      return Response.json({
        ...(await maybePromoteWaitlist(
          admin,
          outreach as OutreachRow,
          application as ApplicationRow,
          previousStatus,
          body.status
        )),
        penalty: null,
      });
    }

    const { data: updated, error: updateError } = await admin
      .from("applications")
      .update({
        status: body.status,
        // Only ever written alongside a cancellation, and only when one was
        // given. An omitted key would silently keep a reason from a previous
        // withdrawal of the same application after a re-apply.
        ...(body.status === "cancelled"
          ? { cancellation_reason: body.cancellationReason?.trim() || null }
          : {}),
      })
      .eq("id", body.applicationId)
      // `late_cancellation` is selected back because the BEFORE trigger has
      // just decided it, and it is what chooses -8 over -2. Reading it from the
      // returned row rather than recomputing it here means the penalty and the
      // database agree by construction.
      .select("id, outreach_id, volunteer_id, status, match_score, late_cancellation")
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

    /*
      THE CANCELLATION PENALTY (wired live 2026-08-31, owner-approved).

      IT LIVES HERE AND NOWHERE ELSE, and the reason is the whole design. A
      withdrawal is only penalised when the volunteer held an ACCEPTED place:
      pulling out of something you were pending or waitlisted for costs nobody
      anything, leaves no organiser short, and is exactly what the app wants
      instead of somebody going quiet. But `applications` does not record what a
      cancelled row used to be, so that distinction exists for the length of
      this request and no longer. Any endpoint asked to apply the penalty
      afterwards would be guessing, which is why /api/vscore's `penalty` action
      was removed rather than left as a second door.

      This is also why the client no longer cancels the row itself first: doing
      so consumed the previous status before the server ever saw it, and this
      handler would fall into the idempotent no-op branch above with nothing
      left to judge.

      ONLY THE VOLUNTEER'S OWN WITHDRAWAL COUNTS. An organisation cancelling
      somebody's place is the organisation's decision, and charging the
      volunteer for it would be the app punishing a person for what was done to
      them. Moderation withdrawals do not come through here at all.

      BEST-EFFORT, on purpose, and the opposite way round from the audit trail.
      The withdrawal has already succeeded and the place has already been
      offered to the waitlist; a failure to record the deduction must not be
      reported to the volunteer as a failed withdrawal, leading them to try
      again. The nightly sweep does not cover this case (there is nothing left
      to detect), so a failure here means one uncharged cancellation, which is
      the right way for this to fail.
    */
    let penalty: { points: number; newScore: number; band: string } | null = null;
    if (
      body.status === "cancelled" &&
      previousStatus === "accepted" &&
      isOwnVolunteer &&
      !isOwningOrg
    ) {
      try {
        const outcome = await recordCancellationPenalty(admin, {
          volunteerId: application.volunteer_id as string,
          applicationId: body.applicationId,
          outreachId: application.outreach_id as string,
          outreachTitle: (outreach.title as string | null) ?? null,
          lateCancellation: (updated as { late_cancellation?: boolean }).late_cancellation === true,
        });
        penalty = {
          points: (updated as { late_cancellation?: boolean }).late_cancellation === true ? -8 : -2,
          newScore: outcome.score,
          band: getVScoreBand(outcome.score),
        };
      } catch (penaltyError) {
        console.warn(
          "[application-status] withdrawal saved, but the V-Score deduction could not be recorded:",
          penaltyError instanceof Error ? penaltyError.message : penaltyError
        );
      }
    }

    // Tell the applicant, for an organisation-driven decision. A volunteer's
    // own cancellation doesn't need one -- they already know.
    //
    // BOTH, NOT JUST THE EMAIL. This path called emailApplicant alone, so
    // deciding an applicant one at a time -- the ordinary way an organisation
    // accepts someone -- sent the email and neither pushed the volunteer nor
    // recorded the in-app notification. The two other paths that decide an
    // application (the batch "accept top N", and promoting someone off the
    // waitlist) always did both, which is why this was invisible in testing
    // until someone accepted a single applicant and watched the volunteer's
    // phone stay silent. Reported from a device on 2026-08-20.
    //
    // Sequential rather than Promise.all: notifyUsers swallows its own
    // failures, and an email that throws must not take the notification with
    // it -- the volunteer should hear about the decision by whichever channel
    // still works.
    if (isOwningOrg && (body.status === "accepted" || body.status === "rejected" || body.status === "waitlisted")) {
      await emailApplicant(admin, application.volunteer_id, outreach as OutreachRow, body.status);
      await pushApplicant(admin, application.volunteer_id, outreach as OutreachRow, body.status);
    }

    return Response.json({ ...result, penalty });
  } catch (err) {
    return errorResponse(err);
  }
}

interface BatchFailure {
  applicationId: string;
  reason: string;
}

/**
 * Decides many applicants in one request.
 *
 * Accepts are applied ONE AT A TIME and in the order given. That is deliberate:
 * `slots_filled` is re-derived by trigger and guarded by the
 * `slots_filled <= slots_total` check constraint, so a single bulk UPDATE that
 * overshot the roster would be rejected in its entirety and decide nobody. Row
 * by row, the event fills to exactly its capacity, the applicant who would have
 * overfilled it is reported back as a failure, and everyone accepted before
 * them keeps their place. Waitlists and rejections carry no such constraint and
 * go out as one statement each.
 *
 * Emails and push both fan out once at the end rather than per applicant.
 */
async function handleBatch(
  caller: Awaited<ReturnType<typeof authenticate>>,
  body: z.infer<typeof BatchStatusBody>
) {
  const admin = getSupabaseAdmin();

  const { data: outreach, error: outreachError } = await admin
    .from("outreaches")
    .select("id, organisation_id, title, date, location_name")
    .eq("id", body.outreachId)
    .maybeSingle();
  if (outreachError || !outreach) throw Errors.notFound("Outreach not found.");

  if (!(caller.role === "organisation" && caller.userId === outreach.organisation_id)) {
    throw Errors.forbidden("Only the organisation running this outreach can decide its applicants.");
  }

  const ids = body.decisions.map((d) => d.applicationId);
  const { data: rows, error: rowsError } = await admin
    .from("applications")
    .select("id, outreach_id, volunteer_id, status, match_score")
    .in("id", ids)
    .eq("outreach_id", body.outreachId);
  if (rowsError) throw Errors.internal("Could not load these applications.");

  const byId = new Map<string, ApplicationRow>((rows ?? []).map((r) => [r.id as string, r as ApplicationRow]));

  const failed: BatchFailure[] = [];
  const decided: { applicationId: string; volunteerId: string; status: ApplicationStatusEmailKind }[] = [];

  // Anything the caller named that isn't an application on THIS outreach is
  // reported rather than silently skipped -- a client that sent the wrong ids
  // needs to know its plan was not carried out in full.
  for (const id of ids) {
    if (!byId.has(id)) {
      failed.push({ applicationId: id, reason: "This application does not belong to this outreach." });
    }
  }

  const accepts = body.decisions.filter((d) => d.status === "accepted" && byId.has(d.applicationId));
  const waitlists = body.decisions.filter((d) => d.status === "waitlisted" && byId.has(d.applicationId));
  const rejects = body.decisions.filter((d) => d.status === "rejected" && byId.has(d.applicationId));

  let outreachIsFull = false;
  for (const decision of accepts) {
    const row = byId.get(decision.applicationId)!;
    if (row.status === "accepted") continue; // already on the roster; nothing to do, no second email

    if (outreachIsFull) {
      failed.push({ applicationId: decision.applicationId, reason: "This outreach is already full." });
      continue;
    }

    const { error } = await admin
      .from("applications")
      .update({ status: "accepted" })
      .eq("id", decision.applicationId);

    if (error) {
      if ((error as { code?: string }).code === CHECK_VIOLATION) {
        // The roster filled up underneath us -- stop trying, so the remaining
        // accepts fail fast with the same honest reason instead of each
        // making its own doomed round trip.
        outreachIsFull = true;
        failed.push({ applicationId: decision.applicationId, reason: "This outreach is already full." });
        continue;
      }
      failed.push({ applicationId: decision.applicationId, reason: "Could not accept this applicant." });
      continue;
    }

    decided.push({ applicationId: decision.applicationId, volunteerId: row.volunteer_id, status: "accepted" });
  }

  for (const [status, group] of [
    ["waitlisted", waitlists],
    ["rejected", rejects],
  ] as const) {
    const pendingIds = group
      .filter((d) => byId.get(d.applicationId)!.status !== status)
      .map((d) => d.applicationId);
    if (pendingIds.length === 0) continue;

    const { error } = await admin.from("applications").update({ status }).in("id", pendingIds);
    if (error) {
      for (const id of pendingIds) {
        failed.push({ applicationId: id, reason: `Could not move this applicant to ${status}.` });
      }
      continue;
    }
    for (const id of pendingIds) {
      decided.push({ applicationId: id, volunteerId: byId.get(id)!.volunteer_id, status });
    }
  }

  await notifyDecidedBatch(admin, outreach as OutreachRow, decided);

  return {
    outreachId: body.outreachId,
    accepted: decided.filter((d) => d.status === "accepted").map((d) => d.applicationId),
    waitlisted: decided.filter((d) => d.status === "waitlisted").map((d) => d.applicationId),
    rejected: decided.filter((d) => d.status === "rejected").map((d) => d.applicationId),
    failed,
  };
}

/** Emails and pushes every applicant a batch actually moved, in two fan-outs. */
async function notifyDecidedBatch(
  admin: SupabaseClient,
  outreach: OutreachRow,
  decided: readonly { volunteerId: string; status: ApplicationStatusEmailKind }[]
): Promise<void> {
  if (decided.length === 0) return;

  const volunteerIds = [...new Set(decided.map((d) => d.volunteerId))];

  const [{ data: profiles }, { data: tokenRows }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email").in("id", volunteerIds),
    admin.from("push_tokens").select("user_id, expo_push_token").in("user_id", volunteerIds),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  const tokensByUser = new Map<string, string[]>();
  for (const row of tokenRows ?? []) {
    const userId = row.user_id as string;
    tokensByUser.set(userId, [...(tokensByUser.get(userId) ?? []), row.expo_push_token as string]);
  }

  const emails: ApplicationStatusEmailParams[] = [];
  const notifications: UserNotification[] = [];

  for (const decision of decided) {
    const profile = profileById.get(decision.volunteerId);
    if (profile?.email) {
      emails.push({
        to: profile.email as string,
        volunteerName: (profile.full_name as string) ?? "there",
        outreachTitle: outreach.title,
        outreachDate: outreach.date,
        locationName: outreach.location_name,
        kind: decision.status,
      });
    }
    notifications.push({
      userId: decision.volunteerId,
      type: "application_status",
      title: decision.status === "accepted" ? "You're confirmed!" : "Application update",
      body: `${outreach.title}: your application is now ${decision.status}.`,
      outreachId: outreach.id,
      data: { outreachId: outreach.id, status: decision.status },
      tokens: tokensByUser.get(decision.volunteerId) ?? [],
    });
  }

  await Promise.all([sendApplicationStatusEmails(emails), notifyUsers(notifications)]);
}

/**
 * The accepted -> cancelled transition, and nothing else, frees a place.
 *
 * The promotion itself lives in server/waitlist.ts because package F's
 * moderation route needs exactly the same behaviour when a suspension releases
 * somebody's accepted places. Two copies of a promotion rule would be free to
 * drift, and the drift would be invisible because both would still "work".
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

  const promoted = await promoteFromWaitlist(admin, outreach);
  return { application, promoted: (promoted as ApplicationRow | null) ?? null };
}

