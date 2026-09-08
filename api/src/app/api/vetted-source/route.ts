import { z } from "zod";
import { authenticate } from "../../../server/auth";
import { errorResponse, Errors } from "../../../server/httpErrors";
import { enforceIpRateLimit } from "../../../server/rateLimit";
import { getSupabaseAdmin } from "../../../server/supabaseAdmin";
import { assertAdmin, recordAdminAction } from "../../../server/adminAudit";

export const runtime = "nodejs";

/**
 * The vetted-sources whitelist: add one, remove one.
 *
 * SURFACE ONLY. Nothing reads this table, no listing is fetched from any of
 * these sources, and no outreach is created from one. The feature behind it is
 * deferred and stays deferred; this records which sources WOULD be acceptable,
 * kept now while the reasoning is fresh rather than reconstructed later.
 *
 * It goes through an endpoint rather than a client insert for one reason: every
 * add and every removal writes an audit row. A whitelist is an editorial
 * decision about what V-HUB would be willing to republish, and the record of
 * who decided and why is the more valuable half of it.
 */

const AddBody = z.object({
  action: z.literal("add"),
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().min(1).max(400),
  sourceType: z.string().trim().max(120).optional(),
  rationale: z.string().trim().min(3).max(1000),
});

const RemoveBody = z.object({
  action: z.literal("remove"),
  id: z.string().uuid(),
  /** Why it is being removed. A whitelist entry vanishing with no reason is worse than a wrong entry. */
  reason: z.string().trim().min(3).max(1000),
});

const Body = z.union([AddBody, RemoveBody]);

export async function POST(req: Request): Promise<Response> {
  try {
    // First, ahead of validation and of authentication, so a flood is refused
    // before this project spends anything on it. Counted once per request
    // however many times it is called -- see server/rateLimit.ts.
    enforceIpRateLimit(req);
    const json = await req.json().catch(() => {
      throw Errors.badRequest("Request body must be valid JSON.");
    });
    const body = Body.parse(json);

    const caller = await authenticate(req);
    assertAdmin(caller);

    const admin = getSupabaseAdmin();

    if (body.action === "add") {
      const { data, error } = await admin
        .from("vetted_sources")
        .insert({
          name: body.name,
          url: body.url,
          source_type: body.sourceType ?? null,
          rationale: body.rationale,
          added_by: caller.userId,
        })
        .select("id")
        .single();

      if (error) {
        throw error.code === "23505"
          ? Errors.conflict("That source is already on the list.")
          : Errors.internal("Could not add that source.");
      }

      await recordAdminAction(caller, {
        targetType: "vetted_source",
        targetId: data.id as string,
        action: "added a vetted source",
        reason: body.rationale,
        payload: { name: body.name, url: body.url, sourceType: body.sourceType ?? null },
      });

      return Response.json({ id: data.id });
    }

    // Read BEFORE deleting, so the audit row can say what was removed. Once the
    // row is gone the only record of it is the one written here.
    const { data: existing } = await admin
      .from("vetted_sources")
      .select("id, name, url, source_type, rationale")
      .eq("id", body.id)
      .maybeSingle();

    if (!existing) throw Errors.notFound("That source is not on the list.");

    const { error } = await admin.from("vetted_sources").delete().eq("id", body.id);
    if (error) throw Errors.internal("Could not remove that source.");

    await recordAdminAction(caller, {
      targetType: "vetted_source",
      targetId: body.id,
      action: "removed a vetted source",
      reason: body.reason,
      payload: {
        name: existing.name,
        url: existing.url,
        sourceType: existing.source_type,
        originalRationale: existing.rationale,
      },
    });

    return Response.json({ removed: true });
  } catch (err) {
    return errorResponse(err, req);
  }
}
