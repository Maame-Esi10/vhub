// V-HUB database types — mirrors supabase/schema.sql exactly (snake_case columns).
// Backend is Supabase ONLY. Do not add Firebase types here.

// The location verdict is defined once, in lib/attendance.ts, alongside the
// logic that produces it — the values are a behaviour, not just a column
// constraint, and a second copy here would be free to drift from the rule the
// API actually applies.
import type { LocationCheck } from "@/lib/attendance";

export type { LocationCheck };

/**
 * 'admin' is the platform moderator — organisation verification, credential
 * Gate 1, moderation, disputes. It is NOT a role anyone can register as: the
 * welcome screen never offers it, the database bars a client from inserting a
 * profiles row carrying it (profiles_insert_own's with-check), and the only
 * way to become one is an UPDATE run in the Supabase SQL editor.
 */
export type ProfileRole = "volunteer" | "organisation" | "admin";

/**
 * The roles a person can actually sign up as. Deliberately narrower than
 * ProfileRole so "no admin signup" is a compile error rather than a rule
 * someone has to remember — anything feeding registration (the signup form,
 * the auth-metadata payload) is typed with this, not with ProfileRole.
 */
export type SignupRole = Exclude<ProfileRole, "admin">;

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

/**
 * How far an organisation is through verification.
 *
 * A boolean could not say "we looked and declined", "we are waiting" or "this
 * account is suspended". `organisation_profiles.verified` still exists and is
 * still what every screen reads, but it is now DERIVED from this by the
 * database and cannot be written by anybody — a boolean that must agree with
 * something else will eventually disagree with it.
 */
export type OrgVerificationState =
  | "unverified"
  | "documents_submitted"
  | "verified"
  | "rejected"
  /** Reversible moderation stop. Set only by an admin (package F). */
  | "suspended"
  /** Permanent. Set only by an admin (package F). */
  | "banned";

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
   * Cloudinary PUBLIC_ID of the credential document — a name, never an
   * address. The asset is stored privately and cannot be fetched without a
   * signature, so there is no URL here to leak; a screen that needs to show
   * the document asks /api/document-url for a link that expires.
   *
   * Written only by /api/verification-document on the service-role key,
   * together with verification_status — neither is in the client's UPDATE
   * grant list.
   */
  credential_document_id: string | null;
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
  /**
   * Whether the profile shows a gallery drawn from this organisation's past
   * events. Defaults TRUE: an organisation that uploaded images to its events
   * has already said it wants them seen, and an opt-IN would leave the section
   * permanently empty for everyone who never found the switch.
   */
  show_gallery: boolean;
  /**
   * An address on the organisation's own domain, submitted as verification
   * evidence. NOT the same as `contact_email`, which is the public enquiries
   * address and may legitimately be a free webmail account.
   */
  official_email: string | null;
  physical_address: string | null;
  contact_person: string | null;
  verification_state: OrgVerificationState;
  /**
   * The reason behind the LAST decision, so the organisation can fix and
   * resubmit. The full history lives in admin_actions and is never overwritten.
   */
  verification_reason: string | null;
  verification_decided_at: string | null;
  verification_submitted_at: string | null;
  /** DERIVED from verification_state by the database. Never writable. */
  verified: boolean;
  created_at: string;
  updated_at: string;
}

/** One registration number an organisation quotes. Many per organisation. */
export interface OrganisationRegistration {
  id: string;
  organisation_id: string;
  /** The scheme, e.g. "Registrar-General" or "NGO Board". Free text: the list is not fixed. */
  label: string;
  number: string;
  created_at: string;
}

/**
 * One supporting document an organisation submitted.
 *
 * Holds the Cloudinary PUBLIC_ID, never a URL — the asset is private and a
 * stored address is the thing that leaks. Read it through /api/document-url.
 */
export interface OrganisationDocument {
  id: string;
  organisation_id: string;
  document_id: string;
  label: string | null;
  created_at: string;
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
/**
 * One image in an outreach's gallery.
 *
 * SEPARATE FROM `outreaches.flyer_url`, which is unchanged and unaffected. The
 * flyer is the single banner that heads the card and the detail hero; these are
 * the event's poster and photographs. An outreach may have either, both or
 * neither, and nothing here ever falls back to the flyer.
 */
export interface OutreachImage {
  id: string;
  outreach_id: string;
  /** Cloudinary secure URL. Public delivery, like the flyer — never the credential path. */
  url: string;
  caption: string | null;
  /** Display order. NOT unique; ties break on created_at. */
  position: number;
  created_at: string;
}

/**
 * One calendar day an outreach runs on.
 *
 * SINGLE-DAY IS THE n=1 CASE. Every outreach has at least one of these —
 * guaranteed by `trg_outreaches_default_day`, not by client code — so nothing
 * anywhere has to branch on "is this multi-day". `outreaches.date` is the
 * FIRST day, kept in step by trigger, which is why the feed bound, the reminder
 * window, the under-subscription stages and the lifecycle close all still work
 * untouched.
 */
export interface OutreachDay {
  id: string;
  outreach_id: string;
  /** ISO calendar date, `YYYY-MM-DD`. */
  day: string;
  /**
   * Null means "the same hours as the outreach". A campaign running 9–4 every
   * day states that once on the outreach; these exist for the day that differs.
   * Read them through `dayStartTime()` / `dayEndTime()` in lib/outreachDays.ts
   * rather than directly, so the inheritance happens in one place.
   */
  start_time: string | null;
  end_time: string | null;
  created_at: string;
}

/**
 * One day a volunteer promised, on one application.
 *
 * A TABLE RATHER THAN A COUNT, because this is the unit everything else is
 * measured against: attendance is scored on days committed versus days
 * attended, never against the event's span. A student who commits to four
 * Saturdays of a month-long campaign and attends all four did exactly what they
 * promised, and must not be marked absent for the 26 days they never offered.
 */
export interface ApplicationDay {
  id: string;
  application_id: string;
  outreach_day_id: string;
  created_at: string;
  /**
   * When the volunteer dropped this day, or null while they are still
   * committed to it.
   *
   * A release is never a DELETE. The row stays and carries when it happened,
   * because that is the evidence the accountability system reads — a deleted
   * row cannot be told apart from a day that was never promised.
   */
  released_at: string | null;
  /**
   * True when the release landed within 24 hours of that day's own start.
   *
   * Server-derived and absent from the client's UPDATE grant list: a volunteer
   * who could set this could declare their own lateness.
   */
  late_release: boolean;
}

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
 * One volunteer's attendance on ONE DAY of one outreach.
 * UNIQUE (outreach_id, volunteer_id, outreach_day_id).
 *
 * Per day, not per event: a single scan must never be able to record someone
 * present for a month-long campaign, which is the whole reason
 * 20260812_multi_day_outreaches.sql swapped the two-column constraint out.
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
  /** Which day of the outreach this row is about. NOT NULL at the column. */
  outreach_day_id: string;
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
  /** False when the organisation has opted its profile gallery out. */
  show_gallery: boolean;
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

/**
 * What an admin action was performed ON. A CHECK constraint in the database,
 * not an enum, so later admin packages can widen it in one transaction.
 */
export type AdminActionTargetType =
  | "volunteer"
  | "organisation"
  | "outreach"
  | "application"
  | "event_review"
  | "dispute"
  | "document"
  | "vetted_source"
  | "policy";

/**
 * One admin decision: who, when, what they touched, what they did and why.
 *
 * Insert-only, and only by the serverless API on the service-role key — the
 * client has no INSERT/UPDATE/DELETE privilege at all, and a database trigger
 * refuses rewrites even from the API. A correction is a new row.
 *
 * `actor_id` is null when the admin's account has since been deleted; the row
 * survives, which is the point of an audit trail, and `actor_email` is the
 * snapshot that still names them.
 */
export interface AdminAction {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  target_type: AdminActionTargetType;
  target_id: string | null;
  action: string;
  reason: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}
