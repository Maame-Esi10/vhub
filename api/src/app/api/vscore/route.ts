import { z } from "zod";
import {
  applyVScorePenalty,
  computeEventOutcome,
  getVScoreBand,
  recomputeVScoreAfterReview,
  V_SCORE_PENALTIES,
  type VScorePenaltyType,
} from "@/lib/vscore";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Request contract -- CLAUDE.md: "recomputes a volunteer's V-Score after an
// event review or cancellation." Two distinct write paths, one endpoint:
//
//   action "review": the reviewing organisation files/updates its post-event
//   review of a volunteer (attended, reliability_score, clinical_score), and
//   this endpoint blends it into the volunteer's v_score via
//   recomputeVScoreAfterReview (0.7*old + 0.3*eventOutcome) and increments
//   events_attended when attended = true. Auth: caller must be the
//   organisation that owns the outreach being reviewed (mirrors
//   event_reviews_insert_org's RLS check).
//
//   action "penalty": applies one of the three flat penalties
//   (no_show -15, late_cancellation -8, on_time_cancellation -2) directly to
//   v_score. ASSUMPTION flagged for owner sign-off (see final report): the
//   brief's stated auth ("the reviewing organisation") fits a no-show an org
//   discovers/declares after the fact, but late/on-time cancellation
//   penalties are the direct result of a VOLUNTEER cancelling their own
//   accepted application (already stamped by
//   trg_applications_stamp_cancellation in supabase/schema.sql). So this
//   action authorises EITHER party, with different guardrails:
//     - the owning organisation may apply any penalty type freely
//       (e.g. marking a genuine no-show), or
//     - the volunteer may apply ONLY late_cancellation/on_time_cancellation,
//       and ONLY for their own applicationId, and ONLY when it matches what
//       the database itself already stamped (late_cancellation boolean) --
//       never trusting the client's claim over the row's own trigger-set value.
// ---------------------------------------------------------------------------

const ReviewAction = z.object({
  action: z.literal("review"),
  outreachId: z.string().uuid(),
  volunteerId: z.string().uuid(),
  attended: z.boolean(),
  reliabilityScore: z.number().int().min(1).max(5).nullable().optional(),
  clinicalScore: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(2000).optional(),
});

const PenaltyAction = z.object({
  action: z.literal("penalty"),
  outreachId: z.string().uuid(),
  volunteerId: z.string().uuid(),
  applicationId: z.string().uuid(),
  penaltyType: z.enum(["no_show", "late_cancellation", "on_time_cancellation"]),
});

const VScoreRequestBody = z.discriminatedUnion("action", [ReviewAction, PenaltyAction]);

export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await authenticate(req);
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = VScoreRequestBody.parse(json);

    if (body.action === "review") {
      return Response.json(await handleReview(caller, body));
    }
    return Response.json(await handlePenalty(caller, body));
  } catch (err) {
    return errorResponse(err);
  }
}

async function assertOrgOwnsOutreach(callerId: string, outreachId: string) {
  const admin = getSupabaseAdmin();
  const { data: outreach, error } = await admin
    .from("outreaches")
    .select("id, organisation_id")
    .eq("id", outreachId)
    .maybeSingle();
  if (error) throw Errors.internal("Could not load the outreach.");
  if (!outreach) throw Errors.notFound("Outreach not found.");
  if (outreach.organisation_id !== callerId) {
    throw Errors.forbidden("You do not own this outreach.");
  }
}

async function getCurrentVScore(volunteerId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("volunteer_profiles")
    .select("v_score, events_attended")
    .eq("id", volunteerId)
    .maybeSingle();
  if (error || !data) throw Errors.notFound("Volunteer profile not found.");
  return data.v_score as number;
}

// ---------------------------------------------------------------------------
// action: review
// ---------------------------------------------------------------------------

async function handleReview(
  caller: { userId: string; role: string },
  body: z.infer<typeof ReviewAction>
) {
  if (caller.role !== "organisation") {
    throw Errors.forbidden("Only the organisation running this outreach can file a review.");
  }
  await assertOrgOwnsOutreach(caller.userId, body.outreachId);

  const admin = getSupabaseAdmin();

  const { error: reviewError } = await admin.from("event_reviews").upsert(
    {
      outreach_id: body.outreachId,
      volunteer_id: body.volunteerId,
      reviewed_by: caller.userId,
      attended: body.attended,
      reliability_score: body.reliabilityScore ?? null,
      clinical_score: body.clinicalScore ?? null,
      notes: body.notes ?? null,
    },
    { onConflict: "outreach_id,volunteer_id" }
  );
  if (reviewError) throw Errors.internal("Could not save the event review.");

  const { data: volunteer, error: volunteerError } = await admin
    .from("volunteer_profiles")
    .select("v_score, events_attended")
    .eq("id", body.volunteerId)
    .maybeSingle();
  if (volunteerError || !volunteer) throw Errors.notFound("Volunteer profile not found.");

  const oldScore = volunteer.v_score as number;
  const eventOutcome = computeEventOutcome({
    attended: body.attended,
    reliability_score: body.reliabilityScore ?? null,
    clinical_score: body.clinicalScore ?? null,
  });
  const newScore = recomputeVScoreAfterReview(oldScore, {
    attended: body.attended,
    reliability_score: body.reliabilityScore ?? null,
    clinical_score: body.clinicalScore ?? null,
  });

  const { error: updateError } = await admin
    .from("volunteer_profiles")
    .update({
      v_score: newScore,
      events_attended: (volunteer.events_attended as number) + (body.attended ? 1 : 0),
    })
    .eq("id", body.volunteerId);
  if (updateError) throw Errors.internal("Could not update the volunteer's V-Score.");

  return {
    volunteerId: body.volunteerId,
    oldScore,
    newScore,
    band: getVScoreBand(newScore),
    eventOutcome,
  };
}

// ---------------------------------------------------------------------------
// action: penalty
// ---------------------------------------------------------------------------

async function handlePenalty(
  caller: { userId: string; role: string },
  body: z.infer<typeof PenaltyAction>
) {
  const admin = getSupabaseAdmin();

  const { data: application, error: applicationError } = await admin
    .from("applications")
    .select("id, outreach_id, volunteer_id, status, late_cancellation")
    .eq("id", body.applicationId)
    .maybeSingle();
  if (applicationError || !application) throw Errors.notFound("Application not found.");
  if (application.outreach_id !== body.outreachId || application.volunteer_id !== body.volunteerId) {
    throw Errors.badRequest("applicationId does not match the given outreachId/volunteerId.");
  }

  const isOwningOrg = await isOrgOwner(caller, application.outreach_id as string);
  const isOwnVolunteer = caller.role === "volunteer" && caller.userId === body.volunteerId;

  if (!isOwningOrg && !isOwnVolunteer) {
    throw Errors.forbidden("You are not allowed to apply a V-Score penalty for this application.");
  }

  if (isOwnVolunteer && !isOwningOrg) {
    // A volunteer may only confirm the penalty the database itself already
    // stamped for their own cancellation -- never a no-show (that is an
    // organisation's call), and never a claim that contradicts
    // applications.late_cancellation.
    if (body.penaltyType === "no_show") {
      throw Errors.forbidden("Only the organisation can record a no-show.");
    }
    if (application.status !== "cancelled") {
      throw Errors.badRequest("This application has not been cancelled.");
    }
    const expected: VScorePenaltyType = application.late_cancellation ? "late_cancellation" : "on_time_cancellation";
    if (body.penaltyType !== expected) {
      throw Errors.badRequest("penaltyType does not match this application's recorded cancellation timing.");
    }
  }

  const oldScore = await getCurrentVScore(body.volunteerId);
  const newScore = applyVScorePenalty(oldScore, body.penaltyType);

  const { error: updateError } = await admin
    .from("volunteer_profiles")
    .update({ v_score: newScore })
    .eq("id", body.volunteerId);
  if (updateError) throw Errors.internal("Could not update the volunteer's V-Score.");

  return {
    volunteerId: body.volunteerId,
    oldScore,
    newScore,
    band: getVScoreBand(newScore),
    penalty: V_SCORE_PENALTIES[body.penaltyType],
  };
}

async function isOrgOwner(caller: { userId: string; role: string }, outreachId: string): Promise<boolean> {
  if (caller.role !== "organisation") return false;
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("outreaches").select("organisation_id").eq("id", outreachId).maybeSingle();
  return data?.organisation_id === caller.userId;
}
