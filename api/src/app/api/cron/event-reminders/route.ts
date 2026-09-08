import { errorResponse } from "../../../../server/httpErrors";
import { enforceIpRateLimit } from "../../../../server/rateLimit";
import { assertCronSecret, sendEventReminders } from "../../../../server/eventReminders";
import { sendCheckinReminders } from "../../../../server/checkinReminders";
import { escalateUnderSubscribedOutreaches } from "../../../../server/underSubscription";
import { closeAndResolvePastOutreaches } from "../../../../server/outreachLifecycle";
import { sweepUnchargedLateReleases } from "../../../../server/lateReleaseSweep";
import { sweepExpiredNotifications } from "../../../../server/notificationRetention";

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
    // First, ahead of validation and of authentication, so a flood is refused
    // before this project spends anything on it. Counted once per request
    // however many times it is called -- see server/rateLimit.ts.
    enforceIpRateLimit(req);
    assertCronSecret(req);

    // SIX passes, one schedule, because Vercel's Hobby plan allows exactly
    // one cron per day: the 24-hour "your event is tomorrow" reminder, the
    // morning-of "remember to scan the check-in code" reminder, the
    // under-subscription escalation at 7/3/1 days out, the lifecycle pass that
    // closes outreaches whose date has passed and resolves their unanswered
    // applications, the late-release sweep, and the notification retention
    // sweep. Each targets a different day's outreaches and dedupes
    // independently, so none can suppress another.
    //
    // Sequential rather than concurrent: they all write through the same
    // service-role client and the job has all day to finish, so there is
    // nothing to gain from overlapping them and a clearer failure story from
    // not.
    //
    // The lifecycle pass runs LAST, after the reminders. Closing an outreach
    // before reminding its volunteers would be harmless today (the reminder
    // pass reads `open` outreaches for FUTURE dates only) but the ordering
    // makes that independence explicit rather than incidental.
    const upcoming = await sendEventReminders();
    const checkin = await sendCheckinReminders();
    const underSubscribed = await escalateUnderSubscribedOutreaches();
    const lifecycle = await closeAndResolvePastOutreaches();

    /*
      LAST, and after the lifecycle pass. It writes to V-Scores, so it runs once
      everything that could still change an application's status has finished —
      a release on an application the lifecycle pass is about to resolve should
      be judged against the status it ends the night with, not the one it
      started with.

      It exists because releasing a day is a client write while the deduction
      needs the service role, so the app's follow-up call can simply not happen.
      Deduplicated on the released day and the moment it was released, so a
      release the app already charged is a no-op here.
    */
    const lateReleases = await sweepUnchargedLateReleases();

    /*
      LAST OF ALL, and the ordering is a correctness requirement rather than a
      preference. `notifications` is not only the in-app feed — it is also the
      memory two of the passes above use to know what they have already sent
      (`checkinReminders` and `underSubscription` both dedupe by reading their
      own rows back). Deleting rows before those passes run would, on the one
      night a cutoff fell across a live marker, erase the evidence a reminder
      had gone out and let the same run send it twice.

      It also refuses to touch anything belonging to an outreach that has not
      finished, whatever its age, so the ordering is a second line of defence
      rather than the only one.
    */
    const notificationRetention = await sweepExpiredNotifications();

    return Response.json({
      ...upcoming,
      checkin,
      underSubscribed,
      lifecycle,
      lateReleases,
      notificationRetention,
    });
  } catch (err) {
    return errorResponse(err, req);
  }
}
