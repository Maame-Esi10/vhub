import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

/**
 * SMTP transport for every email VHub sends itself.
 *
 * WHY THIS EXISTS AT ALL, AND WHY IT IS NOT RESEND ANY MORE (2026-09-01).
 *
 * Resend will only send from a VERIFIED DOMAIN. Without one the sole usable
 * sender is `onboarding@resend.dev`, and Resend delivers from that address
 * only to the address the Resend account itself was registered under -- every
 * other recipient is refused with a 403. So for the whole life of this project
 * the decision, promotion and cancellation emails have been reaching exactly
 * one inbox: the owner's. Nobody noticed because both send paths log and
 * swallow their failures (deliberately -- see below), so total delivery
 * failure looked identical to everything working.
 *
 * The project has no domain and is not buying one, so the fix is a mail server
 * that will accept us without one. That is a dedicated Gmail account
 * (vhub.notifications@gmail.com) authenticated with a Google app password, the
 * same account Supabase's own auth emails now go through. One sender, one
 * credential, one place to look when mail misbehaves.
 *
 * WHAT THIS COSTS, recorded here because it is a real production ceiling:
 * a free Gmail account allows roughly 500 RECIPIENTS per rolling 24 hours
 * (some sources put SMTP specifically lower), counted per recipient rather
 * than per message, and Supabase's auth emails draw on the same allowance.
 * Nowhere near binding at this project's scale; not a production mail system.
 * See docs/REPORT_NOTES.md.
 *
 * THE FROM ADDRESS CANNOT BE CHANGED. Authenticating to smtp.gmail.com as one
 * account and sending as another makes Gmail overwrite the From header with
 * the authenticated address, unless the other address is a verified "Send mail
 * as" alias -- and verifying an alias means proving control of a domain, which
 * is the problem we are working around. Only the DISPLAY NAME is ours to set,
 * which is why `env.mailFrom` is built as `"VHub" <the gmail address>`.
 */

/**
 * Cached across invocations on a warm serverless instance so a batch of forty
 * decision emails costs one TLS handshake rather than forty.
 *
 * `pool: true` keeps the connection open between messages. `maxMessages: 50`
 * makes nodemailer open a fresh connection after fifty, which keeps us under
 * Gmail's per-session recipient ceiling without having to count anything.
 */
let cachedTransport: Transporter | null = null;

function getTransport(): Transporter {
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      // 465 is implicit TLS -- encrypted from the first byte. 587 (STARTTLS,
      // which opens in the clear and upgrades) also works with Gmail and is
      // the fallback if a TLS handshake error ever appears on 465.
      port: 465,
      secure: true,
      auth: { user: env.gmailUser, pass: env.gmailAppPassword },
      pool: true,
      maxConnections: 1,
      maxMessages: 50,
    });
  }
  return cachedTransport;
}

/**
 * Connects to Gmail and authenticates, WITHOUT sending anything.
 *
 * WHY IT EXISTS. Supabase's own auth emails go through the same Gmail account
 * as this API, but through Supabase's SMTP client, not ours -- so when signup
 * started failing with "Error sending confirmation email" there was no way to
 * tell a dead credential from a mis-typed Supabase SMTP setting. Both produce
 * the same opaque 500 from an endpoint we do not own.
 *
 * `verify()` opens the connection, completes the AUTH exchange and hangs up.
 * If it succeeds the app password is alive and the fault is in Supabase's
 * settings; if it fails with an authentication error the credential is dead
 * and Supabase's copy of it is dead too, along with every email THIS api has
 * tried to send since -- silently, because both send paths log and swallow.
 *
 * It builds its OWN transport rather than reusing the cached pool, so a frozen
 * socket on a warm instance cannot be reported as a bad password.
 */
export async function verifyMailCredentials(): Promise<void> {
  const probe = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: env.gmailUser, pass: env.gmailAppPassword },
  });
  try {
    await probe.verify();
  } finally {
    probe.close();
  }
}

/**
 * Drops the cached transport so the next send builds a fresh one.
 *
 * Needed because a pooled connection cached on a serverless instance can be
 * frozen between invocations and be dead on the next one, while still looking
 * open to us. That failure is indistinguishable from a real send failure at
 * the call site, so every send retries once through a new transport rather
 * than reporting a stale socket as a lost email.
 */
function resetTransport(): void {
  if (cachedTransport) {
    cachedTransport.close();
    cachedTransport = null;
  }
}

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text only. No links and no HTML: see the deliverability note in docs/REPORT_NOTES.md. */
  text: string;
}

/**
 * Sends one message. Throws on failure -- the callers decide what a failure
 * means, and for every current caller it means "log it and carry on", because
 * the database write is the source of truth and a decision that was recorded
 * must never be reported as failed because an email did not go out.
 */
async function sendOnce(message: MailMessage): Promise<void> {
  await getTransport().sendMail({
    from: env.mailFrom,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

/** One send, with a single retry through a rebuilt transport. */
export async function sendMail(message: MailMessage): Promise<void> {
  try {
    await sendOnce(message);
  } catch {
    resetTransport();
    await sendOnce(message);
  }
}

export interface MailBatchResult {
  sent: number;
  failed: number;
}

/**
 * Sends many messages over the pooled connection, ISOLATING EACH FAILURE.
 *
 * This is a deliberate improvement on the Resend implementation it replaces,
 * not just a port. That one posted a chunk of up to 100 messages as a single
 * `batch.send` request inside one try/catch, so one bad address -- or any
 * error at all -- abandoned every remaining message in the chunk silently. An
 * organisation accepting forty applicants could have all forty emails dropped
 * because of one malformed address, with nothing anywhere to say so.
 *
 * SMTP has no batch verb, so the loop is the only option; making each message
 * its own attempt costs nothing and means one failure is one failure.
 */
export async function sendMailBatch(
  messages: readonly MailMessage[]
): Promise<MailBatchResult> {
  let sent = 0;
  let failed = 0;

  for (const message of messages) {
    try {
      await sendMail(message);
      sent += 1;
    } catch (err) {
      failed += 1;
      // The address is not logged: these are volunteers' personal emails and
      // Vercel's function logs are not the place for them.
      console.error("[mail] message failed:", err instanceof Error ? err.message : err);
    }
  }

  return { sent, failed };
}
