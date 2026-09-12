import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit } from "../../../server/rateLimit";
import { assertAdmin } from "../../../server/adminAudit";
import { verifyMailCredentials } from "../../../server/mailer";

export const runtime = "nodejs";

/**
 * Is the Gmail app password still alive?
 *
 * WHY THIS ENDPOINT EXISTS (2026-09-12). Registration began failing with a
 * bare `{"code":500,"error_code":"unexpected_failure","msg":"Error sending
 * confirmation email"}` from Supabase's own signup endpoint the moment "Confirm
 * email" was switched on. That message says the SMTP send failed and nothing
 * else — it cannot distinguish a revoked credential from a wrong host, port or
 * username in Supabase's SMTP settings, and Supabase offers no test button.
 *
 * Both possibilities point at the same Gmail account, and this API authenticates
 * to it too. So asking OUR client to authenticate answers the question:
 *
 *   200 { ok: true }   the app password is alive, so the fault is in Supabase's
 *                      SMTP settings — host, port, username or a stale copy of
 *                      the password pasted only there.
 *   502 with a reason  the credential itself is dead. Supabase's copy is dead
 *                      too, AND so is every email this API has tried to send
 *                      since it died — silently, because both send paths log
 *                      and swallow so a mail outage never fails a recorded
 *                      decision.
 *
 * IT SENDS NOTHING. `verify()` opens the connection, completes the AUTH
 * exchange and hangs up, so running it costs no quota and reaches no inbox.
 *
 * ADMIN ONLY. It is a probe against a credential; whether it currently works is
 * not a fact the platform owes to anybody who can reach the URL. The failure
 * text is returned because it is the diagnostic — but it comes from nodemailer
 * describing an SMTP exchange, and never contains the password.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    // First statement, ahead of authentication, so a flood is refused before
    // this project spends a Supabase call on it. See server/rateLimit.ts.
    enforceIpRateLimit(req);

    const caller = await authenticate(req);
    assertAdmin(caller);

    try {
      await verifyMailCredentials();
    } catch (error) {
      throw Errors.badGateway(
        error instanceof Error
          ? `SMTP authentication failed: ${error.message}`
          : "SMTP authentication failed for an unknown reason."
      );
    }

    return Response.json({ ok: true, checkedAt: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error, req);
  }
}
