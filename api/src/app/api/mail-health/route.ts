import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit } from "../../../server/rateLimit";
import { assertAdmin } from "../../../server/adminAudit";
import { assertCronSecret } from "../../../server/eventReminders";
import { verifyMailCredentials } from "../../../server/mailer";

export const runtime = "nodejs";

/**
 * Is the Gmail app password still alive?
 *
 * WHY THIS ENDPOINT EXISTS (2026-09-12). Registration began failing with a bare
 * `{"code":500,"error_code":"unexpected_failure","msg":"Error sending
 * confirmation email"}` from Supabase's own signup endpoint the moment "Confirm
 * email" was switched on. That message says the SMTP send failed and nothing
 * else — it cannot distinguish a revoked credential from a wrong host, port or
 * username in Supabase's SMTP settings, and Supabase offers no test button.
 *
 * Both possibilities point at the same Gmail account, and this API authenticates
 * to it too. So asking OUR client to authenticate answers the question:
 *
 *   200 { ok: true }   the app password is alive, so the fault is in Supabase's
 *                      SMTP settings — host, port, username, or a stale copy of
 *                      the password pasted only there.
 *   502 with a reason  the credential itself is dead. Supabase's copy is dead
 *                      too, AND so is every email this API has tried to send
 *                      since it died — silently, because both send paths log and
 *                      swallow so a mail outage never fails a recorded decision.
 *
 * IT SENDS NOTHING. `verify()` opens the connection, completes the AUTH
 * exchange and hangs up, so running it costs no quota and reaches no inbox.
 *
 * TWO WAYS IN, AND THE SECOND ONE IS THE POINT.
 *
 * An admin session is how the app calls it — Settings → Check email delivery.
 * But a diagnostic that can only be run from inside the app is no use when the
 * thing being diagnosed is the reason somebody cannot get INTO the app, and it
 * cannot be run from a terminal at all, because a browser address bar carries
 * no session. So `Authorization: Bearer <CRON_SECRET>` is accepted as well,
 * exactly as the cron routes accept it: the secret is already in Vercel's
 * environment, it is already trusted to run the nightly sweeps, and it is one
 * copy-and-paste away.
 *
 * The failure text is returned because it IS the diagnostic. It comes from
 * nodemailer describing an SMTP exchange and never contains the password.
 */
async function authoriseCaller(req: Request): Promise<void> {
  const header = req.headers.get("authorization") ?? "";

  /*
    Try the cron secret FIRST, and only when it matches. `assertCronSecret`
    throws on a mismatch and counts it as a failed authentication, so calling it
    speculatively would refuse every admin-session request before the session
    was ever looked at. Comparing here is not the security decision — that is
    still `assertCronSecret`'s — it only chooses which door to knock on.
  */
  const looksLikeCron = header.startsWith("Bearer ") && !header.includes(".");
  if (looksLikeCron) {
    assertCronSecret(req);
    return;
  }

  const caller = await authenticate(req);
  assertAdmin(caller);
}

export async function GET(req: Request): Promise<Response> {
  try {
    // First statement, ahead of everything, so a flood is refused before this
    // project spends a Supabase call on it. Counted once per request however
    // many times it is called — see server/rateLimit.ts.
    enforceIpRateLimit(req);

    await authoriseCaller(req);

    try {
      await verifyMailCredentials();
    } catch (error) {
      throw Errors.badGateway(
        error instanceof Error
          ? `SMTP authentication failed: ${error.message}`
          : "SMTP authentication failed for an unknown reason."
      );
    }

    return Response.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      meaning:
        "The Gmail app password is valid. If Supabase still cannot send, the fault is in its own SMTP settings rather than the credential.",
    });
  } catch (error) {
    return errorResponse(error, req);
  }
}

/** POST does the same thing, so a curl without -X works either way. */
export const POST = GET;
