// V-HUB database types — mirrors supabase/schema.sql exactly (snake_case columns).
// Backend is Supabase ONLY. Do not add Firebase types here.

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

export type OutreachStatus = "draft" | "open" | "closed" | "completed";

export type ApplicationType = "quick_join" | "full";

export type ApplicationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "waitlisted"
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
  created_at: string;
  updated_at: string;
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
  notes: string | null;
  created_at: string;
  updated_at: string;
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
