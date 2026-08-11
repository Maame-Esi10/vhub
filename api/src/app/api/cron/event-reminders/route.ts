import { errorResponse } from "../../../../server/httpErrors";
import { assertCronSecret, sendEventReminders } from "../../../../server/eventReminders";
import { sendCheckinReminders } from "../../../../server/checkinReminders";
import { escalateUnderSubscribedOutreaches } from "../../../../server/underSubscription";

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

    // THREE passes, one schedule, because Vercel's Hobby plan allows exactly
    // one cron per day: the 24-hour "your event is tomorrow" reminder, the
    // morning-of "remember to scan the check-in code" reminder, and the
    // under-subscription escalation at 7/3/1 days out. They target different
    // days' outreaches and dedupe independently, so none can suppress another.
    //
    // Sequential rather than concurrent: they all write notifications through
    // the same service-role client and the whole job has all day to finish, so
    // there is nothing to gain from overlapping them and a clearer failure
    // story from not.
    const upcoming = await sendEventReminders();
    const checkin = await sendCheckinReminders();
    const underSubscribed = await escalateUnderSubscribedOutreaches();

    return Response.json({ ...upcoming, checkin, underSubscribed });
  } catch (err) {
    return errorResponse(err);
  }
}
