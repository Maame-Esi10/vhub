import { errorResponse } from "../../../../server/httpErrors";
import { assertCronSecret, sendEventReminders } from "../../../../server/eventReminders";

export const runtime = "nodejs";

/**
 * The real Vercel Cron target for the 24-hour event reminder push (see
 * vercel.json's "crons" entry in the final report). Vercel Cron Jobs only
 * send GET requests, and automatically attach
 * `Authorization: Bearer <CRON_SECRET>` when a project env var literally
 * named CRON_SECRET is set -- `assertCronSecret` checks that header, so this
 * route can safely be public (any request without the right secret is
 * rejected with 403/500, never runs the scan).
 */
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronSecret(req);
    return Response.json(await sendEventReminders());
  } catch (err) {
    return errorResponse(err);
  }
}
