import type { AuthedCaller } from "./auth";
import { Errors } from "./httpErrors";
import { getSupabaseAdmin } from "./supabaseAdmin";

/**
 * The audit trail every admin write goes through.
 *
 * WHY IT IS A HELPER AND NOT A LINE OF CODE IN EACH ROUTE: an admin decision
 * recorded nowhere is a decision with no evidence behind it, and history
 * cannot be backfilled. One function means one place to get right, and a new
 * admin endpoint that forgets to call it is visible in review as an endpoint
 * that never imports this file.
 *
 * The table is append-only, enforced by a database trigger that applies to the
 * service role too — so this can add to the record and can never revise it.
 * A correction is a new row saying what was corrected.
 */

export type AdminActionTarget =
  | "volunteer"
  | "organisation"
  | "outreach"
  | "application"
  | "event_review"
  | "dispute"
  | "document"
  | "vetted_source"
  | "policy"
  | "score_event";

export interface AdminActionInput {
  targetType: AdminActionTarget;
  targetId?: string | null;
  /** Short verb phrase, read by a human: "approved organisation verification". */
  action: string;
  /** The admin's written reason. Required for anything a person could contest. */
  reason?: string | null;
  /** Anything else worth keeping, e.g. the previous state. */
  payload?: Record<string, unknown>;
}

/** Throws 403 unless the caller is an admin. Every admin route calls this first. */
export function assertAdmin(caller: AuthedCaller): void {
  if (caller.role !== "admin") {
    throw Errors.forbidden("This action is for V-HUB administrators only.");
  }
}

/**
 * Writes one audit row.
 *
 * Called AFTER the decision it records has been written, deliberately. If the
 * decision fails there is nothing to record, and an audit row describing a
 * change that did not happen is worse than no row at all.
 *
 * It throws on failure rather than swallowing the error, which is the opposite
 * of how this project treats notifications. A missing notification costs
 * somebody a message they can still find in the app; a missing audit row is a
 * decision that has silently escaped the record, and the caller must be able to
 * tell the admin that the write is incomplete.
 */
export async function recordAdminAction(
  caller: AuthedCaller,
  input: AdminActionInput
): Promise<void> {
  const admin = getSupabaseAdmin();

  // The actor's email is SNAPSHOTTED here rather than joined at read time, so
  // the row still names a person after the account is deleted.
  const { data: actor } = await admin
    .from("profiles")
    .select("email")
    .eq("id", caller.userId)
    .maybeSingle();

  const { error } = await admin.from("admin_actions").insert({
    actor_id: caller.userId,
    actor_email: (actor?.email as string | null) ?? null,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    action: input.action,
    reason: input.reason?.trim() ? input.reason.trim() : null,
    payload: input.payload ?? {},
  });

  if (error) {
    throw Errors.internal(
      "The decision was applied but could not be recorded in the audit log. Tell the V-HUB owner before making further decisions."
    );
  }
}
