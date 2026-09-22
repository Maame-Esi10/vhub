import { sendMail, sendMailBatch, type MailMessage } from "./mailer";

/**
 * The transactional emails VHub sends about an application, and about the two
 * account decisions a person waits on a human for.
 *
 * WAS server/resend.ts UNTIL 2026-09-01. The wording of every message below is
 * unchanged; only the transport underneath it moved, from Resend's API to the
 * project's Gmail SMTP account. The reasoning for that move lives in
 * server/mailer.ts. This file was always split so that `subjectFor` / `bodyFor`
 * build the content and the exported functions do the sending, which is why
 * swapping the transport touched no copy at all.
 */

export type ApplicationStatusEmailKind =
  | "accepted"
  | "rejected"
  | "waitlisted"
  /**
   * The EVENT is off, not the application. Added for moderation (package F):
   * suspending an organisation cancels its live outreaches, and a volunteer
   * who turns up to a cancelled clinic has lost a Saturday to our silence.
   * This is the one status change where the volunteer did nothing at all.
   */
  | "cancelled";

export interface ApplicationStatusEmailParams {
  to: string;
  volunteerName: string;
  outreachTitle: string;
  outreachDate: string;
  locationName: string | null;
  kind: ApplicationStatusEmailKind;
}

function subjectFor(kind: ApplicationStatusEmailKind, outreachTitle: string): string {
  switch (kind) {
    case "accepted":
      return `You're confirmed for ${outreachTitle} - VHub`;
    case "rejected":
      return `Update on your application to ${outreachTitle} - VHub`;
    case "waitlisted":
      return `You're on the waitlist for ${outreachTitle} - VHub`;
    case "cancelled":
      return `${outreachTitle} has been cancelled - VHub`;
  }
}

function bodyFor(params: ApplicationStatusEmailParams): string {
  const where = params.locationName ? ` at ${params.locationName}` : "";
  const when = params.outreachDate;

  switch (params.kind) {
    case "accepted":
      return (
        `Hi ${params.volunteerName},\n\n` +
        `Good news -- your application to volunteer at "${params.outreachTitle}"${where} on ${when} has been ACCEPTED.\n\n` +
        `Please make sure you're available and arrive a little early on the day. If you can no longer make it, ` +
        `withdraw from the app as early as possible so another volunteer can take your place.\n\n` +
        `Thank you for supporting health outreach in Ghana.\n\n` +
        `-- The VHub Team`
      );
    case "rejected":
      return (
        `Hi ${params.volunteerName},\n\n` +
        `Thank you for applying to volunteer at "${params.outreachTitle}"${where} on ${when}. ` +
        `The organising team has decided not to move forward with your application this time.\n\n` +
        `This isn't a reflection of your standing on VHub -- please keep applying to outreaches that match your skills.\n\n` +
        `-- The VHub Team`
      );
    case "waitlisted":
      return (
        `Hi ${params.volunteerName},\n\n` +
        `Your application to volunteer at "${params.outreachTitle}"${where} on ${when} has been placed on the WAITLIST.\n\n` +
        `If a confirmed volunteer's slot opens up, the highest-matching waitlisted volunteer is automatically promoted ` +
        `and you will be notified immediately by email and push notification. No action is needed from you right now.\n\n` +
        `-- The VHub Team`
      );
    case "cancelled":
      return (
        `Hi ${params.volunteerName},\n\n` +
        `"${params.outreachTitle}"${where} on ${when} has been CANCELLED and will not take place. ` +
        `You do not need to attend.\n\n` +
        `Nothing about this affects your standing on VHub -- it was not your decision and it is not ` +
        `counted against you. Please do keep applying to other outreaches.\n\n` +
        `-- The VHub Team`
      );
  }
}

function toMessage(params: ApplicationStatusEmailParams): MailMessage {
  return {
    to: params.to,
    subject: subjectFor(params.kind, params.outreachTitle),
    text: bodyFor(params),
  };
}

/**
 * Sends the accepted/rejected/waitlisted/cancelled transactional email.
 * Best-effort: logs and swallows failures rather than throwing, so a mail
 * outage never blocks the status change itself from succeeding -- the
 * status update to the database is the source of truth, the email is a
 * courtesy notification on top of it.
 */
export async function sendApplicationStatusEmail(params: ApplicationStatusEmailParams): Promise<void> {
  try {
    await sendMail(toMessage(params));
  } catch (err) {
    console.error("[email] failed to send application-status email:", err instanceof Error ? err.message : err);
  }
}

/**
 * Sends many application-status emails over one pooled SMTP connection.
 *
 * Needed by the batch accept/waitlist path, where an oversubscribed event can
 * move forty applicants at once. `sendMailBatch` isolates each message, so one
 * undeliverable address costs one email rather than the whole batch -- which
 * is what the Resend implementation this replaces did, silently.
 *
 * Best-effort in exactly the same way as the single-message version: the
 * database write is the source of truth and a mail failure must never fail the
 * decision that was already recorded.
 */
export async function sendApplicationStatusEmails(
  messages: readonly ApplicationStatusEmailParams[]
): Promise<void> {
  if (messages.length === 0) return;

  try {
    const { failed } = await sendMailBatch(messages.map(toMessage));
    if (failed > 0) {
      console.error(`[email] ${failed} of ${messages.length} application-status emails failed`);
    }
  } catch (err) {
    console.error(
      "[email] failed to send batched application-status emails:",
      err instanceof Error ? err.message : err
    );
  }
}

/* =====================================================================
   ACCOUNT DECISIONS: organisation verification, and a volunteer credential
   =====================================================================

   ADDED 2026-09-22, owner-reported: "the org didn't get a mail that they've
   been approved".

   Neither decision had ever sent an email. Both wrote an in-app notification
   and a push, which is the right pair for something that happens WHILE
   somebody is using the app -- an application decision, a match, a reminder.
   It is the wrong pair for these two, and the difference is worth stating
   because it decides whether any future decision endpoint needs mail:

     - The wait is long and open-ended. An application is decided by an
       organisation that is already looking at its applicants; these are
       decided by one of us, whenever we next open the queue. The person on
       the other end has closed the app.
     - A push is not durable. It is a notification a phone may never show (no
       token, notifications refused, a reinstall), and it is gone once swiped.
     - The decision is about the ACCOUNT, not about one event. An organisation
       that cannot publish, or a volunteer locked out of clinical roles, is
       blocked until they read this. Everything else can wait for the app to
       be opened; this is the thing that makes them open it.

   Best-effort in exactly the same way as the application emails: the database
   write is the source of truth, and a mail outage must never turn a recorded
   decision into a failed request.

   THE REJECTION REASON TRAVELS; THE APPROVAL REASON DOES NOT. A reason is
   required for both outcomes, but they are written for different readers. A
   rejection's is written TO the organisation and is the only thing that says
   what to fix, so it is quoted verbatim. An approval's is a note for the next
   admin explaining why thin evidence was accepted -- "registration number
   checks out, letterhead is poor" is a fair thing to write in a file and an
   unkind thing to post to the person it is about.
*/

export interface VerificationDecisionEmailParams {
  to: string;
  /** The organisation's name, or the volunteer's, for the greeting. */
  name: string;
  approved: boolean;
  /** The admin's written reason. Sent verbatim ONLY on a rejection. */
  reason: string;
}

function organisationVerificationBody(params: VerificationDecisionEmailParams): string {
  if (params.approved) {
    return (
      `Hi ${params.name},

` +
      `Your organisation has been VERIFIED on VHub.

` +
      `You can now publish outreaches, and volunteers will see the verified mark on your profile. ` +
      `Anything you saved as a draft while you were waiting is still there and can be published now.

` +
      `-- The VHub Team`
    );
  }
  return (
    `Hi ${params.name},

` +
    `We have reviewed your organisation's details and cannot verify the account as it stands.

` +
    `Here is what the reviewer said:

` +
    `${params.reason}

` +
    `You can update your details and documents in VHub under Settings, then submit again. ` +
    `Resubmitting replaces what you sent before, so send the full set rather than only the part that changed.

` +
    `-- The VHub Team`
  );
}

function credentialDecisionBody(params: VerificationDecisionEmailParams): string {
  if (params.approved) {
    return (
      `Hi ${params.name},

` +
      `Your credential document has been reviewed and accepted. Your VHub profile is now VERIFIED.

` +
      `You can apply to clinical roles from now on. Everything you could already do is unchanged.

` +
      `-- The VHub Team`
    );
  }
  return (
    `Hi ${params.name},

` +
    `We have looked at the credential document you sent and cannot accept it as it stands.

` +
    `Here is what the reviewer said:

` +
    `${params.reason}

` +
    `Your document is still on your profile so you can see which one this was about. ` +
    `Open Identity Verification in VHub to replace it, and it goes straight back into the queue.

` +
    `Nothing else about your account has changed. You can still browse every outreach and join ` +
    `support-role ones, which is most of them.

` +
    `-- The VHub Team`
  );
}

/** The organisation-verification decision, by email. Never throws. */
export async function sendOrganisationVerificationEmail(
  params: VerificationDecisionEmailParams
): Promise<void> {
  try {
    await sendMail({
      to: params.to,
      subject: params.approved
        ? "Your organisation is verified - VHub"
        : "About your organisation verification - VHub",
      text: organisationVerificationBody(params),
    });
  } catch (err) {
    console.error(
      "[email] failed to send organisation-verification email:",
      err instanceof Error ? err.message : err
    );
  }
}

/** The volunteer credential (Gate 1) decision, by email. Never throws. */
export async function sendCredentialDecisionEmail(
  params: VerificationDecisionEmailParams
): Promise<void> {
  try {
    await sendMail({
      to: params.to,
      subject: params.approved
        ? "Your VHub profile is verified - VHub"
        : "About the document you sent - VHub",
      text: credentialDecisionBody(params),
    });
  } catch (err) {
    console.error(
      "[email] failed to send credential-decision email:",
      err instanceof Error ? err.message : err
    );
  }
}
