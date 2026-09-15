/**
 * Centralised environment access. Every secret named here lives ONLY as a
 * Vercel env var for this api/ project (see .env.example) -- never in the
 * Expo app, never logged. Getters are lazy (read `process.env` on access,
 * not at module load) so importing this file never crashes the process;
 * a route handler only throws when it actually needs a missing value, and
 * that throw is caught by `errorResponse()` and turned into a clean 500 --
 * it never leaks the variable's value, only its name.
 */

/**
 * Trims because these values are pasted into a dashboard by hand. A trailing
 * newline is invisible there but not to a consumer: the Cloudinary secret is
 * fed straight into a SHA-1, so one stray space makes every signed upload fail
 * with a 401 whose string-to-sign looks perfectly correct.
 */
function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get supabaseUrl(): string {
    return requireEnv("SUPABASE_URL");
  },
  get supabaseServiceRoleKey(): string {
    return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  /** Null (not thrown) when unset -- Layer 2 is optional and must fail open. */
  get geminiApiKey(): string | null {
    return process.env.GEMINI_API_KEY?.trim() || null;
  },
  get geminiModel(): string {
    return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  },
  /**
   * The dedicated Gmail account every VHub email is sent through, and the
   * Google APP PASSWORD authenticating it -- a 16-character credential that
   * grants full access to that mailbox, which is exactly why the account is a
   * dedicated one holding nothing. Replaced RESEND_API_KEY / RESEND_FROM on
   * 2026-09-01; see server/mailer.ts for why Resend could not be kept.
   */
  get gmailUser(): string {
    return requireEnv("GMAIL_USER");
  },
  get gmailAppPassword(): string {
    return requireEnv("GMAIL_APP_PASSWORD");
  },
  /** Optional. The only part of the sender that is ours to choose. */
  get mailFromName(): string {
    return process.env.MAIL_FROM_NAME?.trim() || "VHub";
  },
  /**
   * Gmail overwrites the From header with the authenticated account unless the
   * address is a verified "Send mail as" alias, so the address half is not a
   * setting -- it is always GMAIL_USER, and only the display name varies.
   * Building it here rather than taking a whole address from an env var stops
   * anyone configuring a sender Gmail will silently rewrite.
   */
  get mailFrom(): string {
    return `"${this.mailFromName}" <${this.gmailUser}>`;
  },
  /**
   * Where an unexpected server failure is emailed, or null to send nothing.
   *
   * OPTIONAL ON PURPOSE, AND THE FEATURE SHIPS OFF. Whether an inbox should
   * receive production alerts is an operational decision, not a repository one,
   * and it can be changed in the Vercel dashboard without a deploy. Unset, the
   * only effect of the monitoring is a structured log line.
   *
   * Sent through the same Gmail account as everything else and therefore
   * against the same ~500/day allowance, which is why alerts are throttled to
   * one per kind of failure per fifteen minutes -- see lib/errorMonitor.ts.
   */
  get alertEmail(): string | null {
    return process.env.ALERT_EMAIL?.trim() || null;
  },
  /** Null when unset -- Expo push works without it, just at a lower rate limit. */
  get expoAccessToken(): string | null {
    return process.env.EXPO_ACCESS_TOKEN?.trim() || null;
  },
  /** Null when unset -- the cron-only route action is simply refused (500) rather than left open. */
  get cronSecret(): string | null {
    return process.env.CRON_SECRET?.trim() || null;
  },
  get cloudinaryCloudName(): string {
    return requireEnv("CLOUDINARY_CLOUD_NAME");
  },
  get cloudinaryApiKey(): string {
    return requireEnv("CLOUDINARY_API_KEY");
  },
  /**
   * Required, and never sent to the client. The mobile app receives only a
   * per-upload SIGNATURE derived from it, which is scoped to one folder and
   * one timestamp and expires -- so a leaked signature cannot be replayed
   * into arbitrary uploads the way the raw secret could.
   */
  get cloudinaryApiSecret(): string {
    return requireEnv("CLOUDINARY_API_SECRET");
  },
  get notifyMatchThreshold(): number {
    const raw = Number(process.env.NOTIFY_MATCH_THRESHOLD);
    return Number.isFinite(raw) && raw > 0 ? raw : 75;
  },
};
