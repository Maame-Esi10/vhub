import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit } from "../../../server/rateLimit";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { rankApplicants } from "@/lib/roster";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Where a waitlisted volunteer actually stands in the queue.
//
//   POST {}  ->  { positions: [{ applicationId, outreachId, position, waitlistSize }] }
//
// Why this needs the server at all: position is a volunteer's rank among the
// OTHER waitlisted applicants to the same outreach, and RLS deliberately
// forbids a volunteer from reading anyone else's application. The client
// therefore cannot compute it, and the honest options are a service-role
// endpoint (this) or a SECURITY DEFINER database function. This route was
// chosen because it needs no schema change, and because the ranking rule
// already lives in TypeScript (lib/roster.ts) and is unit-tested there --
// duplicating it in SQL would be a second copy free to drift from the
// promotion rule in /api/application-status.
//
// The number is computed on demand, never stored. A stored position would be
// wrong the moment another applicant was waitlisted, withdrew, or had their
// V-Score move.
// ---------------------------------------------------------------------------

interface WaitlistRow {
  id: string;
  outreach_id: string;
  volunteer_id: string;
  status: string;
  match_score: number | null;
  created_at: string;
  volunteer: { v_score: number | null } | null;
}

export async function POST(req: Request): Promise<Response> {
  try {
    // First, ahead of validation and of authentication, so a flood is refused
    // before this project spends anything on it. Counted once per request
    // however many times it is called -- see server/rateLimit.ts.
    enforceIpRateLimit(req);
    const caller = await authenticate(req);
    if (caller.role !== "volunteer") {
      throw Errors.forbidden("Only a volunteer has a waitlist position.");
    }

    const admin = getSupabaseAdmin();

    const { data: mine, error: mineError } = await admin
      .from("applications")
      .select("id, outreach_id")
      .eq("volunteer_id", caller.userId)
      .eq("status", "waitlisted");
    if (mineError) throw Errors.internal("Could not load your applications.");

    if (!mine || mine.length === 0) {
      return Response.json({ positions: [] });
    }

    const outreachIds = [...new Set(mine.map((row) => row.outreach_id as string))];

    // v_score is embedded because ranking applies the reliability multiplier;
    // ordering by match_score alone would disagree with the order the
    // organisation sees and with the promotion rule.
    const { data: rows, error: rowsError } = await admin
      .from("applications")
      .select("id, outreach_id, volunteer_id, status, match_score, created_at, volunteer:volunteer_profiles(v_score)")
      .in("outreach_id", outreachIds)
      .eq("status", "waitlisted");
    if (rowsError) throw Errors.internal("Could not work out your place in the queue.");

    const byOutreach = new Map<string, WaitlistRow[]>();
    for (const row of (rows ?? []) as unknown as WaitlistRow[]) {
      byOutreach.set(row.outreach_id, [...(byOutreach.get(row.outreach_id) ?? []), row]);
    }

    const positions: {
      applicationId: string;
      outreachId: string;
      position: number;
      waitlistSize: number;
    }[] = [];

    for (const [outreachId, group] of byOutreach) {
      const ranked = rankApplicants(
        group.map((row) => ({
          id: row.id,
          status: "waitlisted" as const,
          matchScore: row.match_score,
          vScore: row.volunteer?.v_score ?? null,
          createdAt: row.created_at,
          volunteerId: row.volunteer_id,
        }))
      );

      const index = ranked.findIndex((entry) => entry.volunteerId === caller.userId);
      if (index === -1) continue;

      positions.push({
        applicationId: ranked[index]!.id,
        outreachId,
        position: index + 1,
        waitlistSize: ranked.length,
      });
    }

    return Response.json({ positions });
  } catch (err) {
    return errorResponse(err, req);
  }
}
