import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit } from "../../../server/rateLimit";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";

export const runtime = "nodejs";
// Never cached: a cached 200 would reach nothing, which is the whole failure
// this route exists to prevent.
export const dynamic = "force-dynamic";

/**
 * The address an uptime monitor pings so the Supabase free tier never counts
 * this project as idle and pauses it (built 2026-09-24).
 *
 * WHY A ROUTE AND NOT THE API'S ROOT PAGE. Supabase judges activity by what
 * reaches the DATABASE. The root page is static and touches nothing, so a
 * monitor pointed at it would report "up" every five minutes while the project
 * went to sleep underneath it. This runs one real query.
 *
 * WHY NO SECRET. A monitor on a free plan sends a plain GET, and nothing here is
 * worth protecting: the query is a HEAD count on `vetted_sources`, which returns
 * a number and no rows, and the number is not even returned. The per-IP limiter
 * is the only guard it needs, and it runs first, before the database call.
 *
 * A database failure is a 502, so the monitor reports the project DOWN rather
 * than up -- which is the one thing an uptime monitor must never get backwards.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    enforceIpRateLimit(req);

    const { error } = await getSupabaseAdmin()
      .from("vetted_sources")
      .select("id", { count: "exact", head: true });
    if (error) throw Errors.badGateway("The database did not answer.");

    return Response.json({ ok: true, checkedAt: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error, req);
  }
}

/** HEAD as well: some monitors use it by default. */
export const HEAD = GET;
