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
//   2. Resolving someone as absent applies the -15 no-show penalty to
//      volunteer_profiles.v_score, which is already service-role-only.
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
  const outreach = await assertOwnsOutreach(caller, body.outreachId);
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

  return {
    outreachId: body.outreachId,
    anchoredAt,
    // Echoed so the QR screen can tell the organiser whether the anchor it
    // just saved will actually be honoured -- an anchor captured on the wrong
    // day is discarded rather than trusted.
    usableForEvent: isVenueAnchorUsable(anchoredAt, outreach.date as string | null),
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
  if (!application || application.status !== "accepted") {
    throw Errors.forbidden(
      "You are not on the accepted list for this outreach, so you cannot check in."
    );
  }

  // The silent location check. Coordinates enter here and go no further: the
  // verdict is all that survives this function.
  const anchorUsable = isVenueAnchorUsable(
    outreach.venue_anchored_at as string | null,
    outreach.date as string | null
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

  const checkedInAt = new Date().toISOString();
  const { error: upsertError } = await admin.from("attendance").upsert(
    {
      outreach_id: body.outreachId,
      volunteer_id: userId,
      checked_in_at: checkedInAt,
      check_in_method: "qr_scan",
      location_check: locationCheck,
    },
    { onConflict: "outreach_id,volunteer_id" }
  );
  if (upsertError) throw Errors.internal("Could not record your check-in.");

  // The volunteer is told they are checked in, full stop. A 'mismatch' is a
  // signal for the ORGANISER's exception list, not an accusation to put in
  // front of someone who may simply have a confused GPS -- and telling them
  // would also teach anyone gaming it exactly where the boundary sits.
  return {
    outreachId: body.outreachId,
    checkedInAt,
    present: true,
  };
}

// ---------------------------------------------------------------------------
// mode: resolve
// ---------------------------------------------------------------------------

/**
 * The organiser's final word on one volunteer.
 *
 * Available for ANYONE on the list, not only the unscanned: no automated
 * signal ever overrules a human who was physically at the event. Marking
 * someone absent is what applies the -15 no-show penalty, which is why this
 * cannot live on the client.
 */
async function resolveAttendance(caller: AuthedCaller, body: z.infer<typeof ResolveBody>) {
  await assertOwnsOutreach(caller, body.outreachId);
  const admin = getSupabaseAdmin();

  const resolvedAt = new Date().toISOString();
  const { error } = await admin.from("attendance").upsert(
    {
      outreach_id: body.outreachId,
      volunteer_id: body.volunteerId,
      organiser_status: body.status,
      organiser_note: body.note ?? null,
      resolved_by: caller.userId,
      resolved_at: resolvedAt,
    },
    { onConflict: "outreach_id,volunteer_id" }
  );
  if (error) throw Errors.internal("Could not save that attendance decision.");

  return {
    outreachId: body.outreachId,
    volunteerId: body.volunteerId,
    status: body.status,
    resolvedAt,
  };
}
