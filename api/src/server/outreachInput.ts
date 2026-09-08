import type { Layer1OutreachDay, Layer1OutreachInput } from "@/lib/matching/layer1";
import { getSupabaseAdmin } from "./supabaseAdmin";

/**
 * Maps a raw `outreaches` row onto the scorer's input shape.
 *
 * Shared rather than written at each call site: this mapper has already been
 * the site of one silent scoring bug. An earlier copy omitted `role_type`,
 * which disabled the support-role category override (a support outreach needs
 * no specific profession, so its category component is forced to 1.0) for
 * every applicant scored through that path — with no error and no visible
 * symptom beyond scores that were quietly too low. One definition means a
 * field added to the scorer cannot be honoured in one place and forgotten in
 * another.
 */
export function toOutreachInput(
  outreach: Record<string, unknown>,
  /**
   * This outreach's `outreach_days` rows, for the availability component.
   *
   * OMITTED MEANS "not loaded", NOT "no days". The scorer then falls back to
   * `date` as the single day, which is exactly what it did before days entered
   * the calculation -- so a caller that cannot load them degrades to the old
   * behaviour rather than scoring everybody at zero. Every outreach really has
   * at least one day row, structurally, so an empty array can only ever mean a
   * read that did not happen.
   */
  days?: readonly Layer1OutreachDay[]
): Layer1OutreachInput {
  return {
    ...(days && days.length > 0 ? { days } : {}),
    required_skills: (outreach.required_skills as string[] | null) ?? null,
    required_category: (outreach.required_category as string | null) ?? null,
    role_type: (outreach.role_type as Layer1OutreachInput["role_type"]) ?? null,
    region: (outreach.region as string | null) ?? null,
    district: (outreach.district as string | null) ?? null,
    date: (outreach.date as string | null) ?? null,
    start_time: (outreach.start_time as string | null) ?? null,
    end_time: (outreach.end_time as string | null) ?? null,
  };
}

/**
 * The `outreach_days` rows for these outreaches, keyed by outreach id.
 *
 * Availability is now scored across every day an event runs on rather than
 * against its first, so the scorer needs the day list. Shared here beside
 * `toOutreachInput` for the same reason that mapper is shared: four call sites
 * need it, and four copies of a query is four places for one of them to quietly
 * fall behind.
 *
 * ONE `.in()` QUERY FOR THE WHOLE SET, never one per outreach. The ranked feed
 * scores every open outreach in a region, so a per-row query would turn one
 * request into dozens -- the same rule the app's own `useOutreachDaysForMany`
 * follows.
 *
 * A FAILURE DEGRADES, IT DOES NOT THROW. An outreach missing from the returned
 * map is scored against its `date` alone, which is precisely the behaviour
 * availability had before this change. A feed with slightly coarser
 * availability scores beats no feed at all -- the same call
 * `fetchRolesByOutreach` already makes for roles.
 */
export async function fetchDaysByOutreach(
  admin: ReturnType<typeof getSupabaseAdmin>,
  outreachIds: readonly string[]
): Promise<Map<string, Layer1OutreachDay[]>> {
  const byOutreach = new Map<string, Layer1OutreachDay[]>();
  if (outreachIds.length === 0) return byOutreach;

  const { data, error } = await admin
    .from("outreach_days")
    .select("outreach_id, day, start_time, end_time")
    .in("outreach_id", outreachIds as string[]);

  if (error) {
    console.error(
      "[match] could not load outreach days, scoring availability on the first day only:",
      error.message
    );
    return byOutreach;
  }

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const outreachId = row.outreach_id as string;
    byOutreach.set(outreachId, [
      ...(byOutreach.get(outreachId) ?? []),
      {
        day: row.day as string,
        // Null is meaningful and must survive: it is how a day says it runs to
        // the event's hours rather than to any of its own.
        start_time: (row.start_time as string | null) ?? null,
        end_time: (row.end_time as string | null) ?? null,
      },
    ]);
  }

  return byOutreach;
}
