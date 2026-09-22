import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit } from "../../../server/rateLimit";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { assertAdmin, recordAdminAction } from "../../../server/adminAudit";
import { assetExists, uploadTargetFor } from "../../../server/cloudinary";
import { notifyUsers } from "../../../server/notify";
import { sendOrganisationVerificationEmail } from "../../../server/email";

export const runtime = "nodejs";

/**
 * Organisation verification: the organisation submits, an admin decides.
 *
 * BOTH HALVES LIVE HERE because they write the same columns, and those columns
 * are service-role-only for the same reason `verification_status` is on the
 * volunteer side: `verification_state` decides whether an organisation can put
 * an event in front of volunteers, so a client that could write it could
 * self-verify — and then post outreaches, read applicant PII and review real
 * V-Scores. The database refuses the write; this route is the only path.
 *
 * `organisation_profiles.verified` is NOT written by either half. It is a
 * generated column derived from `verification_state`, so Postgres rejects a
 * write to it outright. Approval is one write to one column with one meaning.
 *
 * DELIBERATELY LIGHTWEIGHT, per the brief. No type-specific certificate rules
 * and no external registry check — Ghana has no public API to check a
 * registration against. An admin reads what was submitted and judges it.
 */

const RegistrationInput = z.object({
  label: z.string().trim().min(1).max(120),
  number: z.string().trim().min(1).max(120),
});

const DocumentInput = z.object({
  publicId: z.string().min(1).max(300),
  label: z.string().trim().max(120).optional(),
});

const SubmitBody = z.object({
  action: z.literal("submit"),
  officialEmail: z.string().trim().email().max(200),
  physicalAddress: z.string().trim().min(1).max(400),
  contactPerson: z.string().trim().min(1).max(160),
  website: z.string().trim().max(300).optional(),
  registrations: z.array(RegistrationInput).min(1).max(10),
  documents: z.array(DocumentInput).min(1).max(10),
  /** True when the organisation has just agreed to the consent text. */
  consent: z.boolean().optional(),
});

const DecideBody = z.object({
  action: z.literal("decide"),
  organisationId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  /**
   * Required for BOTH outcomes, not just rejection. An approval with a reason
   * is what lets a later admin see why this organisation passed when the
   * evidence looks thin — the audit trail is only as useful as what is written
   * into it.
   */
  reason: z.string().trim().min(3).max(1000),
});

const Body = z.union([SubmitBody, DecideBody]);

export async function POST(req: Request): Promise<Response> {
  try {
    // First, ahead of validation and of authentication, so a flood is refused
    // before this project spends anything on it. Counted once per request
    // however many times it is called -- see server/rateLimit.ts.
    enforceIpRateLimit(req);
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = Body.parse(json);
    const caller = await authenticate(req);
    const admin = getSupabaseAdmin();

    // ---------------------------------------------------------------
    // The organisation submits
    // ---------------------------------------------------------------
    if (body.action === "submit") {
      if (caller.role !== "organisation") {
        throw Errors.forbidden("Only an organisation can submit verification.");
      }

      const { data: current } = await admin
        .from("organisation_profiles")
        .select("verification_state, document_consent_at")
        .eq("id", caller.userId)
        .maybeSingle();

      if (!current) throw Errors.notFound("Organisation profile not found.");

      // A verified organisation resubmitting would have to be un-verified to
      // be re-decided, and that would quietly revoke a badge volunteers are
      // relying on right now, on the organisation's own say-so. Changing
      // details after approval is a conversation with VHub, not a form.
      if (current.verification_state === "verified") {
        throw Errors.badRequest(
          "Your organisation is already verified. Contact VHub if your details have changed."
        );
      }
      if (current.verification_state === "banned") {
        throw Errors.forbidden("This organisation cannot submit verification.");
      }
      if (current.verification_state === "documents_submitted") {
        throw Errors.badRequest(
          "Your submission is already waiting on review. You will be notified when it is decided."
        );
      }

      // Consent is refused, not assumed — same rule and same reasoning as the
      // volunteer credential upload.
      const alreadyConsented = !!current.document_consent_at;
      if (!alreadyConsented && body.consent !== true) {
        throw Errors.badRequest("Agree to how your documents are used before submitting them.");
      }

      // Every document must sit in THIS organisation's own folder and must
      // really exist. Without the folder check an organisation could name
      // somebody else's uploaded file — which does exist, so the existence
      // check alone would pass — and submit it as its own evidence.
      const { folder, resourceType, deliveryType } = uploadTargetFor(
        "organisation_document",
        caller.userId
      );
      for (const doc of body.documents) {
        if (!doc.publicId.startsWith(`${folder}/`)) {
          throw Errors.forbidden("One of those documents does not belong to your account.");
        }
        if (!(await assetExists(doc.publicId, resourceType, deliveryType))) {
          throw Errors.badRequest(
            "One of those documents could not be found in storage. Please upload it again."
          );
        }
      }

      const { error: profileError } = await admin
        .from("organisation_profiles")
        .update({
          official_email: body.officialEmail,
          physical_address: body.physicalAddress,
          contact_person: body.contactPerson,
          ...(body.website ? { website: body.website } : {}),
          verification_state: "documents_submitted",
          verification_submitted_at: new Date().toISOString(),
          ...(alreadyConsented ? {} : { document_consent_at: new Date().toISOString() }),
          // The previous rejection reason is cleared on resubmission: leaving
          // it would show the organisation a stale "you were declined because"
          // beside a submission nobody has looked at yet.
          verification_reason: null,
        })
        .eq("id", caller.userId);

      if (profileError) throw Errors.internal("Could not save your verification details.");

      // Replace rather than append, for both child tables. A resubmission is a
      // complete restatement of the evidence — appending would leave a
      // withdrawn registration number sitting in the reviewer's list as though
      // it were still being claimed.
      await admin.from("organisation_registrations").delete().eq("organisation_id", caller.userId);
      const { error: regError } = await admin.from("organisation_registrations").insert(
        body.registrations.map((r) => ({
          organisation_id: caller.userId,
          label: r.label,
          number: r.number,
        }))
      );
      if (regError) throw Errors.internal("Could not save your registration numbers.");

      await admin.from("organisation_documents").delete().eq("organisation_id", caller.userId);
      const { error: docError } = await admin.from("organisation_documents").insert(
        body.documents.map((d) => ({
          organisation_id: caller.userId,
          document_id: d.publicId,
          label: d.label ?? null,
        }))
      );
      if (docError) throw Errors.internal("Could not save your documents.");

      return Response.json({ verificationState: "documents_submitted" });
    }

    // ---------------------------------------------------------------
    // An admin decides
    // ---------------------------------------------------------------
    assertAdmin(caller);

    const { data: organisation } = await admin
      .from("organisation_profiles")
      .select("id, org_name, verification_state")
      .eq("id", body.organisationId)
      .maybeSingle();

    if (!organisation) throw Errors.notFound("Organisation not found.");

    const previousState = organisation.verification_state as string;
    const nextState = body.decision === "approve" ? "verified" : "rejected";

    const { error } = await admin
      .from("organisation_profiles")
      .update({
        verification_state: nextState,
        verification_reason: body.reason,
        verification_decided_at: new Date().toISOString(),
      })
      .eq("id", body.organisationId);

    if (error) throw Errors.internal("Could not record the decision.");

    // AFTER the decision is written, never before: an audit row describing a
    // change that did not happen is worse than no row. This throws on failure
    // rather than swallowing it — a decision that escaped the record is
    // something the admin must be told about.
    await recordAdminAction(caller, {
      targetType: "organisation",
      targetId: body.organisationId,
      action:
        body.decision === "approve"
          ? "approved organisation verification"
          : "rejected organisation verification",
      reason: body.reason,
      payload: { previousState, nextState, orgName: organisation.org_name },
    });

    // Best-effort, and last. A rejection that is not explained is a dead end:
    // the organisation cannot tell what to fix, so the reason travels with the
    // notification rather than sitting only in the app.
    const { data: tokens } = await admin
      .from("push_tokens")
      .select("expo_push_token")
      .eq("user_id", body.organisationId);

    await notifyUsers([
      {
        userId: body.organisationId,
        type: "application_status",
        title: body.decision === "approve" ? "Your organisation is verified" : "Verification not approved",
        body:
          body.decision === "approve"
            ? "You can now publish outreaches on VHub."
            : `${body.reason} You can update your details and submit again.`,
        data: { kind: "organisation_verification", decision: body.decision },
        tokens: (tokens ?? []).map((t) => t.expo_push_token as string),
      },
    ]);

    /*
      AND BY EMAIL. A push is not durable and an in-app notification is only
      read by somebody who opens the app, which is precisely what an
      organisation waiting on a decision has stopped doing. See the note above
      sendOrganisationVerificationEmail in server/email.ts for why these two
      decisions get mail when the rest of the notifications do not.

      Best-effort and last, like everything else in this block: the state
      change and the audit row are already written and must not be undone by a
      mail failure.
    */
    const { data: orgProfile } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", body.organisationId)
      .maybeSingle();

    if (orgProfile?.email) {
      await sendOrganisationVerificationEmail({
        to: orgProfile.email as string,
        name: (organisation.org_name as string) ?? (orgProfile.full_name as string) ?? "there",
        approved: body.decision === "approve",
        reason: body.reason,
      });
    }

    return Response.json({ verificationState: nextState });
  } catch (err) {
    return errorResponse(err, req);
  }
}
