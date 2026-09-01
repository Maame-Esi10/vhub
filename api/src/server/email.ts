import { sendMail, sendMailBatch, type MailMessage } from "./mailer";

/**
 * The transactional emails V-HUB sends about an application.
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
      return `You're confirmed for ${outreachTitle} - V-HUB`;
    case "rejected":
      return `Update on your application to ${outreachTitle} - V-HUB`;
    case "waitlisted":
      return `You're on the waitlist for ${outreachTitle} - V-HUB`;
    case "cancelled":
      return `${outreachTitle} has been cancelled - V-HUB`;
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
        `-- The V-HUB Team`
      );
    case "rejected":
      return (
        `Hi ${params.volunteerName},\n\n` +
        `Thank you for applying to volunteer at "${params.outreachTitle}"${where} on ${when}. ` +
        `The organising team has decided not to move forward with your application this time.\n\n` +
        `This isn't a reflection of your standing on V-HUB -- please keep applying to outreaches that match your skills.\n\n` +
        `-- The V-HUB Team`
      );
    case "waitlisted":
      return (
        `Hi ${params.volunteerName},\n\n` +
        `Your application to volunteer at "${params.outreachTitle}"${where} on ${when} has been placed on the WAITLIST.\n\n` +
        `If a confirmed volunteer's slot opens up, the highest-matching waitlisted volunteer is automatically promoted ` +
        `and you will be notified immediately by email and push notification. No action is needed from you right now.\n\n` +
        `-- The V-HUB Team`
      );
    case "cancelled":
      return (
        `Hi ${params.volunteerName},\n\n` +
        `"${params.outreachTitle}"${where} on ${when} has been CANCELLED and will not take place. ` +
        `You do not need to attend.\n\n` +
        `Nothing about this affects your standing on V-HUB -- it was not your decision and it is not ` +
        `counted against you. Please do keep applying to other outreaches.\n\n` +
        `-- The V-HUB Team`
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
