import type { Layer1OutreachInput } from "@/lib/matching/layer1";

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
export function toOutreachInput(outreach: Record<string, unknown>): Layer1OutreachInput {
  return {
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
