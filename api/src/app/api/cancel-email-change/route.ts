import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Cancels a pending login-email change for the CALLER's own account.
 *
 * This exists as a server route because Supabase's client SDK has no way to
 * withdraw a pending change. `auth.updateUser({ email })` only ever STARTS
 * one, and re-submitting the address the user already has is rejected as
 * unchanged -- so from the device there is no path back once a confirmation
 * has been sent to the wrong address. Only the Admin API can clear
 * `new_email`, and that needs the service-role key, which by Hard Rule 4 can
 * exist only here.
 *
 * Writing the CURRENT email back through admin.updateUserById clears the
 * pending one. The user id comes from the verified JWT, never the request
 * body: a client-supplied id would turn this into "cancel anyone's email
 * change", and worse, the same admin call is what could set one.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await authenticate(req);
    const admin = getSupabaseAdmin();

    const { data: existing, error: readError } = await admin.auth.admin.getUserById(caller.userId);
    if (readError || !existing?.user) {
      throw Errors.internal("Could not read your account.");
    }

    // Nothing pending: report it plainly rather than making a pointless write.
    // `new_email` is only populated while a change awaits confirmation.
    const pending = (existing.user as { new_email?: string | null }).new_email;
    if (!pending) {
      return Response.json({ cancelled: false, reason: "no_pending_change" });
    }

    const currentEmail = existing.user.email;
    if (!currentEmail) {
      throw Errors.internal("Your account has no confirmed email to fall back to.");
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(caller.userId, {
      email: currentEmail,
      email_confirm: true,
    });
    if (updateError) {
      throw Errors.internal("Could not cancel the email change.");
    }

    return Response.json({ cancelled: true, email: currentEmail });
  } catch (err) {
    return errorResponse(err);
  }
}
