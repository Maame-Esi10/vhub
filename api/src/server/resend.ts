import { Resend } from "resend";
import { env } from "./env";

let cachedClient: Resend | null = null;

function getResendClient(): Resend {
  if (!cachedClient) {
    cachedClient = new Resend(env.resendApiKey);
  }
  return cachedClient;
}

export type ApplicationStatusEmailKind = "accepted" | "rejected" | "waitlisted";

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
  }
}

/**
 * Sends the accepted/rejected/waitlisted transactional email.
 * Best-effort: logs and swallows failures rather than throwing, so a Resend
 * outage never blocks the status change itself from succeeding -- the
 * status update to the database is the source of truth, the email is a
 * courtesy notification on top of it.
 */
export async function sendApplicationStatusEmail(params: ApplicationStatusEmailParams): Promise<void> {
  try {
    const client = getResendClient();
    await client.emails.send({
      from: env.resendFrom,
      to: params.to,
      subject: subjectFor(params.kind, params.outreachTitle),
      text: bodyFor(params),
    });
  } catch (err) {
    console.error("[resend] failed to send application-status email:", err instanceof Error ? err.message : err);
  }
}
