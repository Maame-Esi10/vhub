// V-HUB database types — mirrors supabase/schema.sql exactly (snake_case columns).
// Backend is Supabase ONLY. Do not add Firebase types here.

// The location verdict is defined once, in lib/attendance.ts, alongside the
// logic that produces it — the values are a behaviour, not just a column
// constraint, and a second copy here would be free to drift from the rule the
// API actually applies.
import type { LocationCheck } from "@/lib/attendance";

export type { LocationCheck };

export type ProfileRole = "volunteer" | "organisation";

// Qualified professionals first, then students, then support roles — the same
// order VOLUNTEER_CATEGORIES renders in (constants/categories.ts).
// 'student' deliberately covers ALL health/medical disciplines (medicine,
// nursing, pharmacy, allied health), not pharmacy alone; 'pharmacist' is the
// qualified pharmacy role. See docs/REPORT_NOTES.md.
export type VolunteerCategory =
  | "doctor"
  | "nurse"
  | "midwife"
  | "pharmacist"
  | "student"
  | "first_aider"
  | "other";

export type ExperienceLevel = "beginner" | "intermediate" | "experienced";

/**
 * Tiered credential verification. Ghana has no public licensing-registry API
 * (Nursing & Midwifery Council, Medical & Dental Council, Pharmacy Council),
 * so verification is a human/document process, not a boolean.
 * unverified = declaration signed only; documents_pending = credential
 * document uploaded (Cloudinary, later phase), awaiting review; verified = a
 * human org-admin approved the document.
 */
export type VerificationStatus = "unverified" | "documents_pending" | "verified";

export type OutreachRoleType = "clinical" | "support";

/**
 * `cancelled` is terminal and cannot be reversed (trg_outreaches_no_uncancel):
 * the volunteers who were told the event is off must not be silently
 * re-enrolled days later. It is distinct from `closed`, which means "no longer
 * recruiting" and leaves the event happening.
 */
export type OutreachStatus = "draft" | "open" | "closed" | "completed" | "cancelled";

export type ApplicationType = "quick_join" | "full";

export type ApplicationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "waitlisted"
  /**
   * Terminal. Applied when an outreach ends with this application still
   * pending or waitlisted — the event filled up or finished before a place
   * could be offered.
   *
   * DISTINCT FROM `rejected` on purpose. `rejected` means an organisation
   * looked at this person and declined them; being crowded out of a full event
   * is not that. Never carries a V-Score effect.
   */
  | "not_selected"
  | "cancelled";

/** Base identity. PK = auth.users.id. */
export interface Profile {
  id: string;
  role: ProfileRole;
  full_name: string;
  phone: string | null;
  email: string | null;
  region: string | null;
  district: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 1:1 extension of Profile for role = 'volunteer'.
 * v_score is never client-writable — recomputed only by the serverless
 * /api/vscore endpoint using the service-role key.
 */
export interface VolunteerProfile {
  id: string;
  category: VolunteerCategory | null;
  skill_tags: string[] | null;
  specialties: string[] | null;
  experience_level: ExperienceLevel | null;
  availability_slots: string[] | null;
  bio: string | null;
  v_score: number;
  events_attended: number;
  declaration_signed: boolean;
  verification_status: VerificationStatus;
  /**
   * Cloudinary URL of the credential document. Written only by
   * /api/verification-document on the service-role key, together with
   * verification_status — neither is in the client's UPDATE grant list.
   */
  credential_document_url: string | null;
  created_at: string;
  updated_at: string;
}

/** 1:1 extension of Profile for role = 'organisation'. */
export interface OrganisationProfile {
  id: string;
  org_name: string;
  org_type: string | null;
  description: string | null;
  website: string | null;
  /**
   * Public enquiries address volunteers can write to. Deliberately NOT the
   * login email (that lives on auth.users) and not the same thing as
   * profiles.email, which is private PII the schema keeps row-scoped.
   */
  contact_email: string | null;
  /** Public enquiries phone, Ghana format. Distinct from the private profiles.phone. */
  contact_phone: string | null;
  verified: boolean;
  created_at: string;
  updated_at: string;
}

/** Belongs to an OrganisationProfile. */
/**
 * One per-category role slot of a multi-role outreach.
 *
 * An outreach has EITHER zero of these (single-role mode — the legacy
 * `required_category` / `role_type` / `slots_total` describe it) OR one row per
 * category it wants. The two modes are distinguished by the presence of rows
 * and nothing else; there is deliberately no `is_multi_role` flag.
 *
 * `slots_filled` is derived by trigger and is never client-writable.
 */
export interface OutreachRole {
  id: string;
  outreach_id: string;
  category: VolunteerCategory;
  role_type: OutreachRoleType;
  /** Minimum acceptable experience — a FLOOR, not an exact match. Null = any level. */
  min_experience_level: ExperienceLevel | null;
  /** Null inherits the outreach's `required_skills`. */
  required_skills: string[] | null;
  slots_total: number;
  slots_filled: number;
  created_at: string;
}

export interface Outreach {
  id: string;
  organisation_id: string;
  title: string;
  description: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  region: string | null;
  district: string | null;
  location_name: string | null;
  required_skills: string[] | null;
  required_category: string | null;
  role_type: OutreachRoleType | null;
  slots_total: number;
  slots_filled: number;
  status: OutreachStatus;
  /** Cloudinary URL of the flyer image. Client-writable by the owning org. */
  flyer_url: string | null;
  /**
   * Venue anchor for the attendance location check, captured from the
   * ORGANISER's device. Server-only (written by /api/checkin) — absent from
   * the outreaches grant lists, so a client cannot forge an anchor.
   *
   * Note there is no `checkin_code` here: the QR secret lives in
   * `outreach_checkin_codes`, because every authenticated user can read an
   * outreach row and RLS cannot hide a column.
   */
  venue_latitude: number | null;
  venue_longitude: number | null;
  /** Honoured only on the event's own day — see isVenueAnchorUsable(). */
  venue_anchored_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The secret encoded in an outreach's check-in QR. One row per outreach,
 * readable ONLY by the owning organisation (outreach_checkin_codes_select_owner)
 * and never rotated — reissuing would invalidate a QR already on display.
 */
export interface OutreachCheckinCode {
  outreach_id: string;
  code: string;
  created_at: string;
}

/**
 * Volunteer <-> Outreach join. UNIQUE (outreach_id, volunteer_id).
 * match_score is never client-writable — written only by the serverless
 * /api/match endpoint using the service-role key.
 */
export interface Application {
  id: string;
  outreach_id: string;
  volunteer_id: string;
  /**
   * Which role of a multi-role outreach this application is for.
   *
   * NULL in single-role mode, and NULL for every application made before
   * multi-role existed — so it is nullable permanently and every read path
   * must handle null. Settable on INSERT only: an accepted volunteer must not
   * be able to move themselves into a different role's slot afterwards.
   */
  outreach_role_id: string | null;
  type: ApplicationType;
  status: ApplicationStatus;
  match_score: number | null;
  /** Volunteer's statement of intent — only collected on `full` applications. */
  motivation: string | null;
  cancelled_at: string | null;
  /** Volunteer's stated withdrawal reason. Not V-Score input. */
  cancellation_reason: string | null;
  late_cancellation: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Organisation's post-event review of a volunteer for an outreach.
 * UNIQUE (outreach_id, volunteer_id).
 */
export interface EventReview {
  id: string;
  outreach_id: string;
  volunteer_id: string;
  reviewed_by: string;
  attended: boolean | null;
  reliability_score: number | null;
  clinical_score: number | null;
  /** Slugs from constants/review-remarks.ts. Never null — defaults to `{}`. */
  remark_chips: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** How an attendance row came to exist. */
export type CheckInMethod = "qr_scan" | "organiser";

/** The organiser's final word on one volunteer. NULL on the row = unresolved. */
export type OrganiserAttendanceStatus = "present" | "absent";

/**
 * One volunteer's attendance at one outreach. UNIQUE (outreach_id, volunteer_id).
 *
 * Written ONLY by /api/checkin on the service-role key — `authenticated` has
 * no insert/update/delete policy or privilege on this table at all.
 *
 * PRIVACY: there is no coordinate field here, and that is deliberate rather
 * than incidental. A scan's location is compared to the venue anchor in memory
 * and discarded; only `location_check` survives. Do not add one.
 */
export interface Attendance {
  id: string;
  outreach_id: string;
  volunteer_id: string;
  /** Null means they never scanned — which is what puts them on the organiser's list. */
  checked_in_at: string | null;
  check_in_method: CheckInMethod | null;
  location_check: LocationCheck;
  organiser_status: OrganiserAttendanceStatus | null;
  organiser_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One entry of `volunteer_review_summary.remark_counts`, most frequent first. */
export interface RemarkCount {
  chip: string;
  count: number;
}

/**
 * Row of the `volunteer_review_summary` view — what an ORGANISATION may see
 * about a volunteer's reviews: an aggregate, never the individual reviews.
 * A volunteer is judged on their pattern of contribution rather than on one
 * bad day or one grumpy reviewer. Carries no PII; never add a name here.
 */
export interface VolunteerReviewSummary {
  volunteer_id: string;
  v_score: number;
  events_attended: number;
  reviews_count: number;
  avg_reliability: number | null;
  avg_clinical: number | null;
  remark_counts: RemarkCount[];
}

/**
 * Row of the `public_volunteer_profiles` view — the non-sensitive slice of
 * profiles + volunteer_profiles that any signed-in user may read for
 * pre-application browsing. Deliberately has no phone/email: those stay
 * behind the row-scoped policies on the underlying tables.
 */
export interface PublicVolunteerProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  region: string | null;
  district: string | null;
  created_at: string;
  category: VolunteerCategory | null;
  skill_tags: string[] | null;
  specialties: string[] | null;
  experience_level: ExperienceLevel | null;
  availability_slots: string[] | null;
  bio: string | null;
  v_score: number;
  events_attended: number;
  verification_status: VerificationStatus;
}

/** Row of the `public_organisation_profiles` view. Also carries no phone/email. */
export interface PublicOrganisationProfile {
  id: string;
  avatar_url: string | null;
  region: string | null;
  district: string | null;
  created_at: string;
  org_name: string;
  org_type: string | null;
  description: string | null;
  website: string | null;
  verified: boolean;
  contact_email: string | null;
  contact_phone: string | null;
}

/**
 * Gemini Layer 2 skill-equivalence cache. Read/written only by the
 * serverless API using the service-role key — never by the mobile client.
 * UNIQUE (skill_a, skill_b).
 */
export interface SkillMatchCache {
  id: string;
  skill_a: string;
  skill_b: string;
  is_match: boolean;
  created_at: string;
}
