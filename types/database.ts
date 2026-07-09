// V-HUB database types — mirrors supabase/schema.sql exactly (snake_case columns).
// Backend is Supabase ONLY. Do not add Firebase types here.

export type ProfileRole = "volunteer" | "organisation";

export type VolunteerCategory =
  | "nurse"
  | "pharmacy_student"
  | "first_aider"
  | "doctor"
  | "midwife"
  | "other";

export type ExperienceLevel = "beginner" | "intermediate" | "experienced";

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
  license_number: string | null;
  license_verified: boolean;
  skill_tags: string[] | null;
  experience_level: ExperienceLevel | null;
  availability_days: string[] | null;
  bio: string | null;
  v_score: number;
  events_attended: number;
  declaration_signed: boolean;
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
  cancelled_at: string | null;
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
