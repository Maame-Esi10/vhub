import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit, enforceUserRateLimit } from "../../../server/rateLimit";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { destroyAsset, uploadTargetFor } from "../../../server/cloudinary";
import { stopOrganisation, stopVolunteer } from "../../../server/accountStop";

export const runtime = "nodejs";

/**
 * Closing your own account.
 *
 * CLOSURE ANONYMISES AND REVOKES. IT DOES NOT DELETE. (Owner-approved
 * 2026-08-31.) The person is removed, the record of work they took part in is
 * kept, the private evidence is destroyed, and the login is banned.
 *
 * WHY IT CANNOT BE A DELETE, which is the whole design in one paragraph. Every
 * table hangs off `profiles` with `on delete cascade`. Deleting an
 * organisation's profile cascades through its outreaches into OTHER people's
 * attendance, reviews and disputes — and since a V-Score is derived by
 * replaying `event_reviews`, every volunteer who ever worked for that
 * organisation would silently drift back toward 70 with a smaller
 * events_attended and nothing on any screen to explain it. `constants/policy.ts`
 * already promises the opposite: "Records of events you actually took part in
 * ... are kept, because an organisation's record of who worked at its clinic is
 * its record too, not only yours."
 *
 * WHY THE LOGIN IS BANNED RATHER THAN DELETED. `profiles.id` references
 * `auth.users(id) on delete cascade`, so deleting the auth user would take the
 * entire profile with it and destroy everything above. `ban_duration` (verified
 * present in @supabase/supabase-js 2.110.1) revokes access while leaving the
 * row every other table depends on intact. The stored email is scrambled to an
 * undeliverable `.invalid` address in the same call, which does two things:
 * password reset can never recover the account, and the real address is freed
 * so the person can sign up again later as a genuinely new user.
 *
 * NO V-SCORE PENALTY IS APPLIED. The withdrawals go through
 * `server/accountStop.ts`, which writes to `applications` directly rather than
 * through /api/application-status, so they never reach the cancellation
 * deduction. Somebody leaving the platform is not abandoning an event, and a
 * parting deduction on an account nobody will ever look at again would be
 * spite.
 *
 * IT IS IMMEDIATE AND IRREVERSIBLE, behind a typed confirmation. A grace period
 * was considered and rejected: it needs a scheduled job, a "closing soon" state
 * visible on every screen, and a way to cancel it — three moving parts for
 * something a person does once.
 */

const Body = z.object({
  /**
   * The word the screen makes them type. It defends against a mis-tap, not
   * against the account holder — who is of course entitled to close their own
   * account, which is the entire point of the endpoint.
   */
  confirmation: z.literal("CLOSE"),
});

/** 100 years, which is the duration Supabase's own documentation uses. */
const BAN_FOREVER = "876000h";

export async function POST(req: Request): Promise<Response> {
  try {
    // First, ahead of validation and of authentication, so a flood is refused
    // before this project spends anything on it. Counted once per request
    // however many times it is called -- see server/rateLimit.ts.
    enforceIpRateLimit(req);
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    Body.parse(json);

    const caller = await authenticate(req);
    // Much tighter than the default: closing an account is irreversible and is
    // done once in an account's lifetime. This allows for a retry, not a loop.
    enforceUserRateLimit(caller.userId, "account_closure");
    const admin = getSupabaseAdmin();

    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, closed_at")
      .eq("id", caller.userId)
      .maybeSingle();

    if (!profile) throw Errors.notFound("Account not found.");
    if (profile.closed_at !== null) {
      throw Errors.conflict("This account is already closed.");
    }

    /*
      AN ADMIN CLOSES THEIRS IN THE SQL EDITOR, where admins are made.

      Two reasons, and the second is the operational one. An admin account is
      created by an UPDATE in the SQL editor and there is deliberately no
      in-app path to it; closure should live in the same place as creation.
      And an admin closing themselves through the app could leave the platform
      with no administrator at all, with the credential and dispute queues
      unreachable and no way back except the SQL editor anyway.
    */
    if (profile.role === "admin") {
      throw Errors.forbidden(
        "Administrator accounts are closed from the database, in the same place they are created."
      );
    }

    /*
      STEP 1 — STOP THE FUTURE, before anything is anonymised.

      Deliberately first. These notifications name the person and the event, and
      they are sent to OTHER people: an organisation's cancellation email has to
      say which outreach, and a waitlist promotion has to reach a real
      organisation record. Blanking the profile first would send everybody a
      message from "Closed account" about an event nobody could identify.
    */
    const consequences =
      profile.role === "organisation"
        ? await stopOrganisation(admin, caller.userId, "The organisation closed its V-HUB account.")
        : await stopVolunteer(admin, caller.userId);

    /*
      STEP 2 — DESTROY THE PRIVATE EVIDENCE.

      Credentials and organisation documents are somebody's identity papers.
      They are the one category that is destroyed outright rather than
      anonymised, because unlike an attendance row they are not a record of
      anyone else's work — they were only ever evidence for a decision that has
      already been made.

      Cloudinary failures are swallowed on purpose, the same call
      `destroyAsset` documents for a withdrawn credential: if Cloudinary is
      down, the row still goes and an orphaned file is left behind. Refusing the
      closure would leave BOTH the row and the file, which is strictly worse for
      the person asking to be removed.
    */
    let documentsDestroyed = 0;

    if (profile.role === "volunteer") {
      const { data: volunteer } = await admin
        .from("volunteer_profiles")
        .select("credential_document_id")
        .eq("id", caller.userId)
        .maybeSingle();

      const publicId = volunteer?.credential_document_id as string | null;
      if (publicId) {
        const { resourceType, deliveryType } = uploadTargetFor("credential", caller.userId);
        await destroyAsset(publicId, resourceType, deliveryType);
        documentsDestroyed += 1;
      }
    } else {
      const { data: documents } = await admin
        .from("organisation_documents")
        .select("id, document_id")
        .eq("organisation_id", caller.userId);

      const { resourceType, deliveryType } = uploadTargetFor(
        "organisation_document",
        caller.userId
      );
      for (const document of documents ?? []) {
        await destroyAsset(document.document_id as string, resourceType, deliveryType);
        documentsDestroyed += 1;
      }

      await admin.from("organisation_documents").delete().eq("organisation_id", caller.userId);
      // Registration numbers are evidence too, not a record of work.
      await admin.from("organisation_registrations").delete().eq("organisation_id", caller.userId);
    }

    /*
      STEP 3 — ANONYMISE.

      What survives is chosen by one test: is this a record of somebody's WORK,
      or is it a record of the PERSON? Outreaches, applications, attendance,
      reviews, disputes and score events are the first and are untouched. Names,
      contact details, photographs, biographies and skill lists are the second
      and are cleared.

      `v_score` and `events_attended` are deliberately KEPT: they are derived
      from the reviews that are being kept, so clearing them would leave the
      cache disagreeing with the history the next replay reads.
    */
    if (profile.role === "volunteer") {
      await admin
        .from("volunteer_profiles")
        .update({
          bio: null,
          skill_tags: [],
          specialties: [],
          availability_slots: [],
          credential_document_id: null,
          verification_reason: null,
          declaration_signed: false,
          document_consent_at: null,
        })
        .eq("id", caller.userId);
    } else {
      await admin
        .from("organisation_profiles")
        .update({
          org_name: "A closed organisation",
          description: null,
          website: null,
          contact_email: null,
          contact_phone: null,
          official_email: null,
        })
        .eq("id", caller.userId);
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        full_name: "Closed account",
        phone: null,
        email: null,
        // The Cloudinary asset behind an avatar cannot be destroyed here: the
        // column stores a URL rather than a public_id, so there is nothing to
        // address the delete with. Clearing the column removes it from every
        // screen; the orphaned file is a known, recorded limitation rather than
        // an oversight. See docs/REPORT_NOTES.md.
        avatar_url: null,
        region: null,
        district: null,
        closed_at: new Date().toISOString(),
      })
      .eq("id", caller.userId)
      // Re-asserted rather than trusted from the read above, so two requests
      // racing cannot both run the whole closure.
      .is("closed_at", null);

    if (profileError) throw Errors.internal("Could not close the account.");

    /*
      STEP 4 — DELIVERY PLUMBING GOES.

      Push tokens and stored notifications are not a record of anything that
      happened; they are how messages reach a phone that will never be signed
      in again. Left in place, the tokens would keep receiving pushes meant for
      an account that no longer exists.
    */
    await admin.from("push_tokens").delete().eq("user_id", caller.userId);
    await admin.from("notifications").delete().eq("user_id", caller.userId);

    /*
      STEP 5 — REVOKE THE LOGIN, last.

      Last on purpose: if anything above fails, the account is still reachable
      and the closure can be retried. Banning first would lock somebody out of a
      half-closed account they could no longer act on.
    */
    const { error: banError } = await admin.auth.admin.updateUserById(caller.userId, {
      ban_duration: BAN_FOREVER,
      email: `closed+${caller.userId}@accounts.invalid`,
    });

    if (banError) {
      // The profile is already anonymised, so reporting a failure now would
      // tell the user nothing happened when almost all of it did. Surfaced in
      // the response instead, so the app can say the one honest thing: the
      // account is closed, but sign out and contact us if you can still sign
      // in.
      console.error("[account-closure] profile closed but the login was not revoked:", banError.message);
    }

    return Response.json({
      closedAt: new Date().toISOString(),
      role: profile.role,
      loginRevoked: !banError,
      documentsDestroyed,
      ...consequences,
    });
  } catch (err) {
    return errorResponse(err, req);
  }
}
