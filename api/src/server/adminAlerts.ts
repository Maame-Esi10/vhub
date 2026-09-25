import { getSupabaseAdmin } from "./supabaseAdmin";
import { sendMailBatch } from "./mailer";

/**
 * Emails every admin when something lands in a queue that only an admin can
 * clear (owner, 2026-09-25: "I don't get an email for admin when there's
 * something to approve or check").
 *
 * WHY THIS WAS MISSING. Every queue (organisation verification, credential
 * documents, disputes) was built to be PULLED: the admin opened the app and
 * looked. Nothing ever pushed, so an organisation could submit its documents
 * and wait days on a queue nobody knew had anything in it, while the
 * organisation itself was blocked from publishing the whole time.
 *
 * WHO RECEIVES IT. Every `profiles` row with role `admin` whose account is
 * not closed, read at send time. Admins are made by an SQL-editor UPDATE and
 * have no settings row, so there is nothing to configure: become an admin
 * and you get the mail, close the account and you stop.
 *
 * WHAT IT CONTAINS. What arrived and where to find it, as plain text with no
 * link (see the deliverability note in docs/REPORT_NOTES.md). Never a
 * document, never a signed URL, and no more personal detail than the name the
 * admin will see in the queue anyway.
 *
 * NEVER THROWS. The submission that triggered the alert is already recorded;
 * a mail failure must not turn a successful upload into an error for the
 * volunteer or organisation who made it. Failures are logged, and the item
 * still waits in its queue in the app.
 */

export type AdminAlertKind = "organisation_verification" | "credential_document" | "dispute";

export interface AdminAlert {
  kind: AdminAlertKind;
  /** The organisation's or volunteer's name, as it appears in the queue. */
  subjectName: string;
  /** One extra line of context, e.g. the outreach a dispute is about. */
  detail?: string;
}

const COPY: Record<AdminAlertKind, { subject: string; what: string; where: string }> = {
  organisation_verification: {
    subject: "Organisation waiting for verification - VHub",
    what: "has submitted its details and documents for verification",
    where: "Open VHub and go to the Orgs tab to review it. The organisation cannot publish outreaches until it is decided.",
  },
  credential_document: {
    subject: "Credential document waiting for review - VHub",
    what: "has uploaded a credential document for review",
    where: "Open VHub and go to the Creds tab to review it. They cannot apply to clinical roles until it is decided.",
  },
  dispute: {
    subject: "New dispute waiting for review - VHub",
    what: "has raised a dispute about an attendance or review record",
    where: "Open VHub and go to the Disputes tab to review it.",
  },
};

/** The body, separated so it can be read without sending anything. */
export function adminAlertText(alert: AdminAlert): string {
  const copy = COPY[alert.kind];
  return (
    `Hello,\n\n` +
    `${alert.subjectName} ${copy.what}.\n\n` +
    (alert.detail ? `${alert.detail}\n\n` : "") +
    `${copy.where}\n\n` +
    `-- VHub`
  );
}

export async function alertAdmins(alert: AdminAlert): Promise<void> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("profiles")
      .select("email")
      .eq("role", "admin")
      .is("closed_at", null);

    if (error) {
      console.error("[admin-alert] could not read admin list:", error.message);
      return;
    }

    const recipients = (data ?? [])
      .map((row) => (row as { email: string | null }).email?.trim())
      .filter((email): email is string => !!email);

    if (recipients.length === 0) {
      console.warn("[admin-alert] no admin has an email address; nothing sent for", alert.kind);
      return;
    }

    const subject = COPY[alert.kind].subject;
    const text = adminAlertText(alert);
    const result = await sendMailBatch(recipients.map((to) => ({ to, subject, text })));
    if (result.failed > 0) {
      console.error(`[admin-alert] ${result.failed} of ${recipients.length} alert(s) failed for`, alert.kind);
    }
  } catch (err) {
    console.error("[admin-alert] failed:", err instanceof Error ? err.message : err);
  }
}
