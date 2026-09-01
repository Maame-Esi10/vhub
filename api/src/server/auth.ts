import type { ProfileRole } from "@/types/database";
import { Errors } from "./httpErrors";
import {
  enforceAuthFailureRateLimit,
  enforceIpRateLimit,
  enforceUserRateLimit,
} from "./rateLimit";
import { getSupabaseAdmin } from "./supabaseAdmin";

export interface AuthedCaller {
  userId: string;
  role: ProfileRole;
}

/**
 * Verifies the caller's Supabase access token and loads their role.
 *
 * Every endpoint in this project calls this FIRST, before touching any
 * secret or doing any work (CLAUDE.md: "Every endpoint validates the
 * caller's Supabase JWT before doing anything").
 *
 * Verification is delegated to Supabase's own `auth.getUser(jwt)` (an Auth
 * API call, using the service-role client) rather than locally decoding the
 * JWT with a shared secret. This is deliberate: it always reflects the
 * token's live state (expiry, revocation, a signed-out session) without this
 * project needing to track Supabase's signing-key rotation, and it needs
 * only SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY -- no separate
 * SUPABASE_JWT_SECRET env var to keep in sync. The cost is one extra network
 * call per request, which is negligible next to the Gemini/Resend/Expo calls
 * these endpoints already make.
 *
 * IT IS ALSO WHERE RATE LIMITING LIVES, and that is not an accident of
 * convenience. Every route calls this as its first statement, so putting the
 * limiter here means a route added later is covered without anyone having to
 * remember to cover it -- the alternative, a line at the top of twenty-one
 * handlers, is a line that will eventually be missed in the twenty-second.
 * Three counters apply, in this order:
 *
 *   1. the per-address limit, BEFORE the Supabase Auth call, so a flood of
 *      junk tokens is refused without this project paying for a lookup;
 *   2. the per-address FAILED-authentication limit, on every path that
 *      rejects, which is the counter an attacker actually runs into;
 *   3. the caller's own default per-user limit, once they are known.
 *
 * See `rateLimit.ts` for the numbers, the reasoning behind each, and the
 * documented limitation that the counters are per serverless instance.
 */
export async function authenticate(req: Request): Promise<AuthedCaller> {
  // First, before the Supabase Auth round-trip below: an unauthenticated
  // flood must not be able to spend this project's quota just by arriving.
  enforceIpRateLimit(req);

  const header = req.headers.get("authorization");
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    enforceAuthFailureRateLimit(req);
    throw Errors.unauthenticated("Missing Authorization: Bearer <token> header.");
  }

  const admin = getSupabaseAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    enforceAuthFailureRateLimit(req);
    throw Errors.unauthenticated("Invalid or expired session token.");
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) {
    enforceAuthFailureRateLimit(req);
    throw Errors.unauthenticated("No profile found for this account.");
  }

  // The backstop every signed-in caller passes through. Endpoints that need
  // something tighter -- match, document-url, vscore, upload-signature,
  // account-closure -- add their own bucket immediately after calling this.
  enforceUserRateLimit(profile.id as string, "default");

  return { userId: profile.id as string, role: profile.role as ProfileRole };
}

/** Throws 403 unless the caller is an organisation and owns this outreach id. */
export async function assertOwnsOutreach(
  caller: AuthedCaller,
  outreachId: string
): Promise<Record<string, unknown>> {
  if (caller.role !== "organisation") {
    throw Errors.forbidden("Only the organisation running this outreach can do this.");
  }
  const admin = getSupabaseAdmin();
  const { data: outreach, error } = await admin
    .from("outreaches")
    .select("*")
    .eq("id", outreachId)
    .maybeSingle();

  if (error) throw Errors.internal("Could not load the outreach.");
  if (!outreach) throw Errors.notFound("Outreach not found.");
  if (outreach.organisation_id !== caller.userId) {
    throw Errors.forbidden("You do not own this outreach.");
  }
  return outreach;
}
