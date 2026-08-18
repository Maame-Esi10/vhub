import { z } from "zod";
import {
  classifyScanLocation,
  isVenueAnchorUsable,
  type LocationCheck,
} from "@/lib/attendance";
import { authenticate, assertOwnsOutreach, type AuthedCaller } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Attendance check-in (section 3, owner decisions 2026-08-05).
//
// Every write to `attendance` lands here, because `authenticated` has no
// insert/update policy on that table at all. Two things make that necessary
// rather than merely tidy:
//
//   1. A scan is only valid against outreach_checkin_codes.code, which a
//      volunteer must never be able to read. If the client wrote attendance
//      directly, marking yourself present at an event you never attended would
//      be one PATCH.
//   2. Attendance is the evidence a V-Score is later derived from, so the
//      record has to be unforgeable: a client able to write this table could
//      mark itself present at an event it never attended, or mark a rival
//      absent.
//
// WHAT THIS ENDPOINT DOES NOT DO, deliberately (owner decision, 2026-08-07):
// resolving someone absent applies NO V-Score penalty. Absence moves a score
// only when the organisation files the post-event review, through
// /api/vscore's "review" action with attended = false. One code path moves
// v_score, so a single no-show cannot be punished twice -- once here and again
// by the review -- and the score stays fully derivable from the event records,
// which the planned V-Score-as-derived-value change depends on.
//
// Do not "finish" this by calling the penalty from resolveAttendance below.
// The missing call is the decision, not an oversight.
//
// PRIVACY, and this is the whole design: mode "scan" receives the volunteer's
// coordinates, compares them to the venue anchor IN MEMORY, and writes only
// the resulting verdict. The coordinates are never persisted, never logged,
// and never returned. `attendance` has no column that could hold them.
// ---------------------------------------------------------------------------

/**
 * The organiser stamps the venue from their own device, by an explicit "I'm at
 * the venue" tap rather than as a side effect of opening a screen.
 *
 * It must be the ORGANISER's device. A volunteer's scan coordinates can never
 * become the anchor: storing them is precisely what the attendance table's
 * shape forbids, and the first scanner is unverifiable by construction, so
 * anchoring on first scan would let one person with a photo of the QR set the
 * venue to their living room and get every genuine attendee flagged.
 */
const AnchorVenueBody = z.object({
  mode: z.literal("anchor_venue"),
  outreachId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const ScanBody = z.object({
  mode: z.literal("scan"),
  outreachId: z.string().uuid(),
  /** The secret carried in the QR. Compared against outreach_checkin_codes.code. */
  checkinCode: z.string().uuid(),
  /**
   * Optional by design. A volunteer who denies location, or whose device
   * cannot get a fix, still checks in -- the scan alone is accepted rather
   * than penalising less-connected volunteers.
   */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().optional(),
});

const ResolveBody = z.object({
  mode: z.literal("resolve"),
  outreachId: z.string().uuid(),
  volunteerId: z.string().uuid(),
  status: z.enum(["present", "absent"]),
  note: z.string().max(1000).optional(),
  /**
   * WHICH DAY the organiser is deciding about. Optional only because a
   * single-day outreach leaves nothing to choose — see `resolveDayId`. On an
   * outreach with several days this is required, and asking for it is refused
   * rather than guessed: picking a day on the organiser's behalf would file a
   * judgement against a day they were not looking at.
   */
  outreachDayId: z.string().uuid().optional(),
});

const CheckinRequestBody = z.discriminatedUnion("mode", [
  AnchorVenueBody,
  ScanBody,
  ResolveBody,
]);

export async function POST(request: Request) {
  try {
    const caller = await authenticate(request);
    const body = CheckinRequestBody.parse(await request.json());

    if (body.mode === "anchor_venue") {
      return Response.json(await anchorVenue(caller, body));
    }
    if (body.mode === "scan") {
      return Response.json(await recordScan(caller.userId, caller.role, body));
    }
    return Response.json(await resolveAttendance(caller, body));
  } catch (err) {
    return errorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// mode: anchor_venue
// ---------------------------------------------------------------------------

async function anchorVenue(caller: AuthedCaller, body: z.infer<typeof AnchorVenueBody>) {
  await assertOwnsOutreach(caller, body.outreachId);
  const admin = getSupabaseAdmin();

  const anchoredAt = new Date().toISOString();
  const { error } = await admin
    .from("outreaches")
    .update({
      venue_latitude: body.latitude,
      venue_longitude: body.longitude,
      venue_anchored_at: anchoredAt,
    })
    .eq("id", body.outreachId);
  if (error) throw Errors.internal("Could not save the venue location.");

  // Echoed so the QR screen can tell the organiser whether the anchor it just
  // saved will actually be honoured -- an anchor captured on the wrong day is
  // discarded rather than trusted.
  //
  // "The right day" is ANY day this outreach runs on, not `outreaches.date`,
  // which is only the first. An organiser anchoring the venue on day three of
  // a campaign was previously told their anchor would not count, which was
  // wrong and would have made them stop bothering.
  const { data: todayRow } = await admin
    .from("outreach_days")
    .select("day")
    .eq("outreach_id", body.outreachId)
    .eq("day", todayIsoDate())
    .maybeSingle();

  return {
    outreachId: body.outreachId,
    anchoredAt,
    usableForEvent: isVenueAnchorUsable(anchoredAt, (todayRow?.day as string | null) ?? null),
  };
}

// ---------------------------------------------------------------------------
// mode: scan
// ---------------------------------------------------------------------------

async function recordScan(
  userId: string,
  role: string,
  body: z.infer<typeof ScanBody>
) {
  if (role !== "volunteer") {
    throw Errors.forbidden("Only a volunteer can check in to an outreach.");
  }

  const admin = getSupabaseAdmin();

  const { data: outreach, error: outreachError } = await admin
    .from("outreaches")
    .select("id, date, venue_latitude, venue_longitude, venue_anchored_at")
    .eq("id", body.outreachId)
    .maybeSingle();
  if (outreachError) throw Errors.internal("Could not load the outreach.");
  if (!outreach) throw Errors.notFound("Outreach not found.");

  // The code is the whole reason a QR is stronger than a button, so where it
  // lives matters. It is NOT a column on `outreaches`: those rows are readable
  // by every authenticated user (outreaches_select_open_or_own) and RLS cannot
  // restrict columns, so a volunteer could simply have selected the secret and
  // checked in from home. It lives in `outreach_checkin_codes`, one row per
  // outreach, readable only by the owning organisation.
  // See supabase/migrations/20260807_checkin_code_isolation.sql.
  const { data: codeRow, error: codeError } = await admin
    .from("outreach_checkin_codes")
    .select("code")
    .eq("outreach_id", body.outreachId)
    .maybeSingle();
  if (codeError) throw Errors.internal("Could not load the check-in code.");
  if (!codeRow || codeRow.code !== body.checkinCode) {
    throw Errors.forbidden("That check-in code is not valid for this outreach.");
  }

  // Only an accepted volunteer can be present. A pending or rejected applicant
  // scanning the code is a mistake worth naming clearly rather than silently
  // recording.
  const { data: application, error: applicationError } = await admin
    .from("applications")
    .select("id, status")
    .eq("outreach_id", body.outreachId)
    .eq("volunteer_id", userId)
    .maybeSingle();
  if (applicationError) throw Errors.internal("Could not load your application.");

  // The message names the ACTUAL state rather than restating the rule. "You
  // are not on the accepted list" is true of four quite different situations
  // -- never applied, still pending, waitlisted, withdrawn -- and a volunteer
  // standing at a venue holding a phone cannot tell which one applies to them,
  // nor can whoever they show it to.
  if (!application) {
    throw Errors.forbidden(
      "You have not applied to this outreach, so there is nothing to check in to. Check that this is the right event."
    );
  }
  if (application.status !== "accepted") {
    const explanation: Record<string, string> = {
      pending: "Your application is still waiting on the organisation's decision.",
      waitlisted: "You are on the waitlist for this outreach, not the confirmed list.",
      rejected: "Your application to this outreach was not accepted.",
      cancelled: "You withdrew from this outreach.",
    };
    throw Errors.forbidden(
      `${explanation[application.status] ?? "Your application is not accepted."} Only confirmed volunteers can check in — speak to the organiser if you think this is wrong.`
    );
  }

  // WHICH DAY is being checked into: the one happening today. A scan is a
  // physical act at a venue, so there is exactly one honest answer and no need
  // to ask the volunteer — but there has to BE an answer, because attendance is
  // now recorded per day and a single scan must never mark someone present for
  // a month-long campaign.
  const day = await todayDay(body.outreachId);

  // The silent location check. Coordinates enter here and go no further: the
  // verdict is all that survives this function.
  //
  // Checked against TODAY'S day rather than `outreaches.date`, which is only
  // the FIRST day. On a four-day campaign the old comparison would have
  // discarded the anchor on days two, three and four — every genuine on-site
  // scan reading as unverified — because the anchor was correctly captured
  // that morning rather than on day one.
  const anchorUsable = isVenueAnchorUsable(
    outreach.venue_anchored_at as string | null,
    day.day
  );
  const venue = anchorUsable
    ? {
        latitude: outreach.venue_latitude as number,
        longitude: outreach.venue_longitude as number,
      }
    : null;
  const scan =
    body.latitude !== undefined && body.longitude !== undefined
      ? { latitude: body.latitude, longitude: body.longitude, accuracy: body.accuracy ?? null }
      : null;

  const locationCheck: LocationCheck = classifyScanLocation(scan, venue);

  const outreachDayId = day.id;

  const checkedInAt = new Date().toISOString();
  const { error: upsertError } = await admin.from("attendance").upsert(
    {
      outreach_id: body.outreachId,
      volunteer_id: userId,
      outreach_day_id: outreachDayId,
      checked_in_at: checkedInAt,
      check_in_method: "qr_scan",
      location_check: locationCheck,
    },
    { onConflict: "outreach_id,volunteer_id,outreach_day_id" }
  );
  if (upsertError) throw Errors.internal("Could not record your check-in.");

  // The volunteer is told they are checked in, full stop. A 'mismatch' is a
  // signal for the ORGANISER's exception list, not an accusation to put in
  // front of someone who may simply have a confused GPS -- and telling them
  // would also teach anyone gaming it exactly where the boundary sits.
  return {
    outreachId: body.outreachId,
    outreachDayId,
    checkedInAt,
    present: true,
  };
}

/**
 * The `outreach_days` row for TODAY, or a refusal naming why there isn't one.
 *
 * Ghana is GMT year-round, so the server's own UTC date is the local calendar
 * date — no timezone conversion, and none should be added without also deciding
 * whose timezone would win.
 *
 * Refusing a scan on a day the event does not run is a NEW bound, and a
 * deliberate one. It follows from attendance being per day: there is no day to
 * file the scan against, and inventing one (the first day? the nearest?) would
 * put a record on a date the volunteer was demonstrably not there. It also
 * matches the venue anchor, which is already honoured only on the day it was
 * captured for.
 */
async function todayDay(outreachId: string): Promise<{ id: string; day: string }> {
  const admin = getSupabaseAdmin();
  const today = todayIsoDate();

  const { data, error } = await admin
    .from("outreach_days")
    .select("id, day")
    .eq("outreach_id", outreachId)
    .eq("day", today)
    .maybeSingle();

  if (error) throw Errors.internal("Could not work out which day of this outreach today is.");
  if (!data) {
    throw Errors.forbidden(
      "This outreach is not running today, so there is nothing to check in to. Check the dates on the event."
    );
  }

  return { id: data.id as string, day: data.day as string };
}

/** Today as `YYYY-MM-DD`. Ghana is GMT year-round, so UTC is the local calendar date. */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// mode: resolve
// ---------------------------------------------------------------------------

/**
 * The organiser's final word on one volunteer.
 *
 * Available for ANYONE on the list, not only the unscanned: no automated
 * signal ever overrules a human who was physically at the event.
 *
 * Records the decision and nothing else -- no V-Score movement. See the note
 * at the top of this file: the -15 no-show penalty belongs to the post-event
 * review (/api/vscore, attended = false), so that exactly one path can change
 * a score.
 */
async function resolveAttendance(caller: AuthedCaller, body: z.infer<typeof ResolveBody>) {
  await assertOwnsOutreach(caller, body.outreachId);
  const admin = getSupabaseAdmin();

  const outreachDayId = await resolveDayId(body.outreachId, body.outreachDayId);

  const resolvedAt = new Date().toISOString();
  const { error } = await admin.from("attendance").upsert(
    {
      outreach_id: body.outreachId,
      volunteer_id: body.volunteerId,
      outreach_day_id: outreachDayId,
      organiser_status: body.status,
      organiser_note: body.note ?? null,
      resolved_by: caller.userId,
      resolved_at: resolvedAt,
    },
    { onConflict: "outreach_id,volunteer_id,outreach_day_id" }
  );
  if (error) throw Errors.internal("Could not save that attendance decision.");

  return {
    outreachId: body.outreachId,
    outreachDayId,
    volunteerId: body.volunteerId,
    status: body.status,
    resolvedAt,
  };
}

/**
 * Which day an organiser's decision belongs to.
 *
 * A day sent explicitly is checked against this outreach and used. A day left
 * out is only acceptable when the outreach HAS one day, where there was never a
 * choice to make — which is every outreach on the platform until somebody
 * creates a multi-day one, and is why the field is optional at all. Beyond
 * that, guessing is refused: filing an absence against the wrong day of a
 * campaign is precisely the error the per-day model exists to prevent.
 */
async function resolveDayId(outreachId: string, requested: string | undefined): Promise<string> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("outreach_days")
    .select("id")
    .eq("outreach_id", outreachId)
    .order("day", { ascending: true });

  if (error) throw Errors.internal("Could not load the days of this outreach.");

  const days = (data ?? []) as { id: string }[];
  if (days.length === 0) {
    // trg_outreaches_default_day makes this unreachable for anything created
    // after 20260818_multi_day_app_support.sql, and the repair in that same
    // migration covers everything created before it.
    throw Errors.internal("This outreach has no days recorded, so attendance cannot be filed.");
  }

  if (requested) {
    if (!days.some((day) => day.id === requested)) {
      throw Errors.badRequest("That day does not belong to this outreach.");
    }
    return requested;
  }

  if (days.length > 1) {
    throw Errors.badRequest(
      "This outreach runs over several days, so say which day this decision is about."
    );
  }

  return days[0]!.id;
}
