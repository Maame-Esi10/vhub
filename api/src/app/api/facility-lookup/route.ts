import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit } from "../../../server/rateLimit";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { assertAdmin } from "../../../server/adminAudit";
import { findFacilityMatches, type Facility } from "@/lib/facilityMatch";
import register from "../../../server/data/hefra-facilities.json";

export const runtime = "nodejs";

/**
 * HeFRA register lookup for the admin's organisation review (built 2026-09-24).
 *
 * Given an organisation, returns the entries in HeFRA's list of licensed
 * facilities whose names look like it, with each licence's expiry. It is
 * EVIDENCE for the admin, never a decision: most outreach organisations are
 * not health facilities and will never be on the register, so the endpoint
 * decides nothing and writes nothing, which is why it records no audit row.
 *
 * Admin-only. The register is public information, but the ORGANISATION's name
 * and region are read here on the service-role key, and only an admin reviewing
 * it has a reason to ask.
 *
 * The register lives in this deployment as JSON extracted from HeFRA's PDF by
 * scripts/extract-hefra.py, rather than in a table: it is read-only reference
 * data that changes when HeFRA publishes a new list, so a table would be a
 * schema change and a loader for something a file answers.
 */
const Body = z.object({ organisationId: z.string().uuid() });

const FACILITIES = register.facilities as Facility[];

export async function POST(req: Request): Promise<Response> {
  try {
    enforceIpRateLimit(req);
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = Body.parse(json);

    const caller = await authenticate(req);
    assertAdmin(caller);

    const admin = getSupabaseAdmin();
    const [{ data: org, error: orgError }, { data: profile, error: profileError }] = await Promise.all([
      admin.from("organisation_profiles").select("org_name").eq("id", body.organisationId).maybeSingle(),
      admin.from("profiles").select("region").eq("id", body.organisationId).maybeSingle(),
    ]);
    if (orgError || profileError) throw Errors.internal("Could not load the organisation.");
    if (!org) throw Errors.notFound("Organisation not found.");

    const today = new Date().toISOString().slice(0, 10);
    const matches = findFacilityMatches(FACILITIES, org.org_name ?? "", {
      region: profile?.region ?? null,
      today,
    });

    return Response.json({
      matches,
      searchedName: org.org_name,
      register: { source: register.source, extracted: register.extracted, count: register.count },
    });
  } catch (error) {
    return errorResponse(error, req);
  }
}
