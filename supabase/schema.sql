-- V-HUB Supabase schema
-- Backend is Supabase ONLY (Postgres + Auth + RLS). Never Firebase.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DO blocks for enums.
-- Paste directly into the Supabase SQL editor.
--
-- THIS FILE NOW DESCRIBES THE WHOLE DATABASE, AND THAT IS TESTED (2026-09-24).
-- Until then it had fallen far behind supabase/migrations/: multi-role
-- (outreach_roles), multi-day (outreach_days, application_days,
-- apply_to_outreach, save_outreach), the event gallery, vetted sources and the
-- V-Score replay functions existed ONLY in migrations, and on an empty database
-- the file stopped partway, because statements used tables and columns created
-- further down. It had been "safe to re-run" on the live database and nothing
-- more.
--
-- IT HAS THREE PARTS, and the order is what makes a fresh run work:
--
--   PART 0  every enum, table and column, plus the functions that exist only in
--           migrations, so nothing below meets an object that does not exist yet.
--   PART 1  the hand-written schema, unchanged, with the reasoning behind each
--           decision. Where a migration later changed something here, the
--           comment names the migration.
--   PART 2  the FINAL form of everything the migrations changed or added:
--           constraints, indexes, functions, policies, triggers and grants.
--           WHERE PART 1 AND PART 2 DISAGREE, PART 2 IS THE LIVE DEFINITION;
--           the reasoning is in the migration of the same subject.
--
-- PARTS 0 AND 2 ARE GENERATED, NOT HAND-WRITTEN. They were produced by rebuilding
-- the database the way the live one was built (this file as of July, then every
-- migration in date order) in a real Postgres, reading its catalog, and writing
-- out whatever this file lacked. The result was then checked three ways, all of
-- which must hold for the file to be trusted:
--   1. an EMPTY database built from this file alone matches that rebuild exactly
--      (functions, policies, triggers, columns, constraints, indexes, grants);
--   2. running this file TWICE changes nothing the second time;
--   3. running it on top of the rebuilt live history changes nothing either.
-- Only the two one-off V-Score backup tables are left out, deliberately: they
-- were snapshots taken during a migration, not part of the design.
--
-- WHEN YOU WRITE A MIGRATION, CHANGE THIS FILE IN THE SAME PASS. A snapshot
-- nobody maintains is worse than no snapshot, because it looks authoritative.
-- The live database is this file THEN the migrations in date order; where the
-- two disagree the migration wins, and the disagreement is the bug.

-- Function bodies are checked when they run, not when they are created, so a
-- function can be defined before the tables it reads. This is what pg_dump
-- itself does, and it lasts only for this session.
set check_function_bodies = off;

-- ============================================================
-- PART 0: every enum, table and column (generated)
-- ============================================================
create extension if not exists "pgcrypto";

-- Enums, with every value the migrations added. On an existing database each
-- block hits duplicate_object and does nothing.
do $$ begin
  create type application_status as enum ('pending', 'accepted', 'rejected', 'waitlisted', 'cancelled', 'not_selected');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type application_type as enum ('quick_join', 'full');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type dispute_status as enum ('open', 'upheld', 'rejected', 'withdrawn');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type dispute_type as enum ('attendance', 'review');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type experience_level as enum ('beginner', 'intermediate', 'experienced');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type moderation_state as enum ('active', 'suspended', 'banned');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type org_verification_state as enum ('unverified', 'documents_submitted', 'verified', 'rejected', 'suspended', 'banned');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type outreach_role_type as enum ('clinical', 'support');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type outreach_status as enum ('draft', 'open', 'closed', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type profile_role as enum ('volunteer', 'organisation', 'admin');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type score_event_kind as enum ('late_cancellation', 'on_time_cancellation', 'late_release');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type verification_status as enum ('unverified', 'documents_pending', 'verified');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type volunteer_category as enum ('doctor', 'nurse', 'midwife', 'pharmacist', 'allied_health', 'student', 'first_aider', 'other');
exception when duplicate_object then null;
end $$;
-- 20260925a: an existing database already has the type, so the value is added
-- here. Not used anywhere in this file, which is what makes adding it inside
-- the same transaction legal.
alter type volunteer_category add value if not exists 'allied_health' after 'pharmacist';

-- Every table with every column, and its primary key. Foreign keys, checks,
-- uniques and indexes come later, once every table they point at exists.
create table if not exists admin_actions (
  id uuid default gen_random_uuid() not null,
  actor_id uuid,
  actor_email text,
  target_type text not null,
  target_id uuid,
  action text not null,
  reason text,
  payload jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint admin_actions_pkey PRIMARY KEY (id)
);
alter table admin_actions add column if not exists id uuid default gen_random_uuid();
alter table admin_actions add column if not exists actor_id uuid;
alter table admin_actions add column if not exists actor_email text;
alter table admin_actions add column if not exists target_type text;
alter table admin_actions add column if not exists target_id uuid;
alter table admin_actions add column if not exists action text;
alter table admin_actions add column if not exists reason text;
alter table admin_actions add column if not exists payload jsonb default '{}'::jsonb;
alter table admin_actions add column if not exists created_at timestamp with time zone default now();
create table if not exists application_days (
  id uuid default gen_random_uuid() not null,
  application_id uuid not null,
  outreach_day_id uuid not null,
  created_at timestamp with time zone default now() not null,
  released_at timestamp with time zone,
  late_release boolean default false not null,
  constraint application_days_pkey PRIMARY KEY (id)
);
alter table application_days add column if not exists id uuid default gen_random_uuid();
alter table application_days add column if not exists application_id uuid;
alter table application_days add column if not exists outreach_day_id uuid;
alter table application_days add column if not exists created_at timestamp with time zone default now();
alter table application_days add column if not exists released_at timestamp with time zone;
alter table application_days add column if not exists late_release boolean default false;
create table if not exists applications (
  id uuid default gen_random_uuid() not null,
  outreach_id uuid not null,
  volunteer_id uuid not null,
  type application_type default 'full'::application_type not null,
  status application_status default 'pending'::application_status not null,
  match_score numeric,
  cancelled_at timestamp with time zone,
  late_cancellation boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  motivation text,
  cancellation_reason text,
  outreach_role_id uuid,
  constraint applications_pkey PRIMARY KEY (id)
);
alter table applications add column if not exists id uuid default gen_random_uuid();
alter table applications add column if not exists outreach_id uuid;
alter table applications add column if not exists volunteer_id uuid;
alter table applications add column if not exists type application_type default 'full'::application_type;
alter table applications add column if not exists status application_status default 'pending'::application_status;
alter table applications add column if not exists match_score numeric;
alter table applications add column if not exists cancelled_at timestamp with time zone;
alter table applications add column if not exists late_cancellation boolean default false;
alter table applications add column if not exists created_at timestamp with time zone default now();
alter table applications add column if not exists updated_at timestamp with time zone default now();
alter table applications add column if not exists motivation text;
alter table applications add column if not exists cancellation_reason text;
alter table applications add column if not exists outreach_role_id uuid;
create table if not exists attendance (
  id uuid default gen_random_uuid() not null,
  outreach_id uuid not null,
  volunteer_id uuid not null,
  checked_in_at timestamp with time zone,
  check_in_method text,
  location_check text default 'not_checked'::text not null,
  organiser_status text,
  organiser_note text,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  outreach_day_id uuid not null,
  constraint attendance_pkey PRIMARY KEY (id)
);
alter table attendance add column if not exists id uuid default gen_random_uuid();
alter table attendance add column if not exists outreach_id uuid;
alter table attendance add column if not exists volunteer_id uuid;
alter table attendance add column if not exists checked_in_at timestamp with time zone;
alter table attendance add column if not exists check_in_method text;
alter table attendance add column if not exists location_check text default 'not_checked'::text;
alter table attendance add column if not exists organiser_status text;
alter table attendance add column if not exists organiser_note text;
alter table attendance add column if not exists resolved_by uuid;
alter table attendance add column if not exists resolved_at timestamp with time zone;
alter table attendance add column if not exists created_at timestamp with time zone default now();
alter table attendance add column if not exists updated_at timestamp with time zone default now();
alter table attendance add column if not exists outreach_day_id uuid;
create table if not exists disputes (
  id uuid default gen_random_uuid() not null,
  volunteer_id uuid not null,
  outreach_id uuid not null,
  type dispute_type not null,
  outreach_day_id uuid,
  statement text not null,
  status dispute_status default 'open'::dispute_status not null,
  resolution text,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint disputes_pkey PRIMARY KEY (id)
);
alter table disputes add column if not exists id uuid default gen_random_uuid();
alter table disputes add column if not exists volunteer_id uuid;
alter table disputes add column if not exists outreach_id uuid;
alter table disputes add column if not exists type dispute_type;
alter table disputes add column if not exists outreach_day_id uuid;
alter table disputes add column if not exists statement text;
alter table disputes add column if not exists status dispute_status default 'open'::dispute_status;
alter table disputes add column if not exists resolution text;
alter table disputes add column if not exists resolved_by uuid;
alter table disputes add column if not exists resolved_at timestamp with time zone;
alter table disputes add column if not exists created_at timestamp with time zone default now();
create table if not exists event_reviews (
  id uuid default gen_random_uuid() not null,
  outreach_id uuid not null,
  volunteer_id uuid not null,
  reviewed_by uuid not null,
  attended boolean,
  reliability_score integer,
  clinical_score integer,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  remark_chips text[] default '{}'::text[] not null,
  constraint event_reviews_pkey PRIMARY KEY (id)
);
alter table event_reviews add column if not exists id uuid default gen_random_uuid();
alter table event_reviews add column if not exists outreach_id uuid;
alter table event_reviews add column if not exists volunteer_id uuid;
alter table event_reviews add column if not exists reviewed_by uuid;
alter table event_reviews add column if not exists attended boolean;
alter table event_reviews add column if not exists reliability_score integer;
alter table event_reviews add column if not exists clinical_score integer;
alter table event_reviews add column if not exists notes text;
alter table event_reviews add column if not exists created_at timestamp with time zone default now();
alter table event_reviews add column if not exists updated_at timestamp with time zone default now();
alter table event_reviews add column if not exists remark_chips text[] default '{}'::text[];
create table if not exists notifications (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  type text not null,
  title text not null,
  body text not null,
  outreach_id uuid,
  data jsonb default '{}'::jsonb not null,
  read_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint notifications_pkey PRIMARY KEY (id)
);
alter table notifications add column if not exists id uuid default gen_random_uuid();
alter table notifications add column if not exists user_id uuid;
alter table notifications add column if not exists type text;
alter table notifications add column if not exists title text;
alter table notifications add column if not exists body text;
alter table notifications add column if not exists outreach_id uuid;
alter table notifications add column if not exists data jsonb default '{}'::jsonb;
alter table notifications add column if not exists read_at timestamp with time zone;
alter table notifications add column if not exists created_at timestamp with time zone default now();
create table if not exists organisation_documents (
  id uuid default gen_random_uuid() not null,
  organisation_id uuid not null,
  document_id text not null,
  label text,
  created_at timestamp with time zone default now() not null,
  constraint organisation_documents_pkey PRIMARY KEY (id)
);
alter table organisation_documents add column if not exists id uuid default gen_random_uuid();
alter table organisation_documents add column if not exists organisation_id uuid;
alter table organisation_documents add column if not exists document_id text;
alter table organisation_documents add column if not exists label text;
alter table organisation_documents add column if not exists created_at timestamp with time zone default now();
create table if not exists organisation_profiles (
  id uuid not null,
  org_name text not null,
  org_type text,
  description text,
  website text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  contact_email text,
  contact_phone text,
  show_gallery boolean default true not null,
  official_email text,
  physical_address text,
  contact_person text,
  verification_state org_verification_state default 'unverified'::org_verification_state not null,
  verification_reason text,
  verification_decided_at timestamp with time zone,
  verification_submitted_at timestamp with time zone,
  verified boolean generated always as ((verification_state = 'verified'::org_verification_state)) stored,
  document_consent_at timestamp with time zone,
  constraint organisation_profiles_pkey PRIMARY KEY (id)
);
alter table organisation_profiles add column if not exists id uuid;
alter table organisation_profiles add column if not exists org_name text;
alter table organisation_profiles add column if not exists org_type text;
alter table organisation_profiles add column if not exists description text;
alter table organisation_profiles add column if not exists website text;
alter table organisation_profiles add column if not exists created_at timestamp with time zone default now();
alter table organisation_profiles add column if not exists updated_at timestamp with time zone default now();
alter table organisation_profiles add column if not exists contact_email text;
alter table organisation_profiles add column if not exists contact_phone text;
alter table organisation_profiles add column if not exists show_gallery boolean default true;
alter table organisation_profiles add column if not exists official_email text;
alter table organisation_profiles add column if not exists physical_address text;
alter table organisation_profiles add column if not exists contact_person text;
alter table organisation_profiles add column if not exists verification_state org_verification_state default 'unverified'::org_verification_state;
alter table organisation_profiles add column if not exists verification_reason text;
alter table organisation_profiles add column if not exists verification_decided_at timestamp with time zone;
alter table organisation_profiles add column if not exists verification_submitted_at timestamp with time zone;
alter table organisation_profiles add column if not exists document_consent_at timestamp with time zone;
create table if not exists organisation_registrations (
  id uuid default gen_random_uuid() not null,
  organisation_id uuid not null,
  label text not null,
  number text not null,
  created_at timestamp with time zone default now() not null,
  constraint organisation_registrations_pkey PRIMARY KEY (id)
);
alter table organisation_registrations add column if not exists id uuid default gen_random_uuid();
alter table organisation_registrations add column if not exists organisation_id uuid;
alter table organisation_registrations add column if not exists label text;
alter table organisation_registrations add column if not exists number text;
alter table organisation_registrations add column if not exists created_at timestamp with time zone default now();
create table if not exists outreach_checkin_codes (
  outreach_id uuid not null,
  code uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  constraint outreach_checkin_codes_pkey PRIMARY KEY (outreach_id)
);
alter table outreach_checkin_codes add column if not exists outreach_id uuid;
alter table outreach_checkin_codes add column if not exists code uuid default gen_random_uuid();
alter table outreach_checkin_codes add column if not exists created_at timestamp with time zone default now();
create table if not exists outreach_days (
  id uuid default gen_random_uuid() not null,
  outreach_id uuid not null,
  day date not null,
  start_time time without time zone,
  end_time time without time zone,
  created_at timestamp with time zone default now() not null,
  constraint outreach_days_pkey PRIMARY KEY (id)
);
alter table outreach_days add column if not exists id uuid default gen_random_uuid();
alter table outreach_days add column if not exists outreach_id uuid;
alter table outreach_days add column if not exists day date;
alter table outreach_days add column if not exists start_time time without time zone;
alter table outreach_days add column if not exists end_time time without time zone;
alter table outreach_days add column if not exists created_at timestamp with time zone default now();
create table if not exists outreach_images (
  id uuid default gen_random_uuid() not null,
  outreach_id uuid not null,
  url text not null,
  caption text,
  position integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint outreach_images_pkey PRIMARY KEY (id)
);
alter table outreach_images add column if not exists id uuid default gen_random_uuid();
alter table outreach_images add column if not exists outreach_id uuid;
alter table outreach_images add column if not exists url text;
alter table outreach_images add column if not exists caption text;
alter table outreach_images add column if not exists position integer default 0;
alter table outreach_images add column if not exists created_at timestamp with time zone default now();
create table if not exists outreach_roles (
  id uuid default gen_random_uuid() not null,
  outreach_id uuid not null,
  category text not null,
  role_type text not null,
  min_experience_level text,
  required_skills text[],
  slots_total integer not null,
  slots_filled integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint outreach_roles_pkey PRIMARY KEY (id)
);
alter table outreach_roles add column if not exists id uuid default gen_random_uuid();
alter table outreach_roles add column if not exists outreach_id uuid;
alter table outreach_roles add column if not exists category text;
alter table outreach_roles add column if not exists role_type text;
alter table outreach_roles add column if not exists min_experience_level text;
alter table outreach_roles add column if not exists required_skills text[];
alter table outreach_roles add column if not exists slots_total integer;
alter table outreach_roles add column if not exists slots_filled integer default 0;
alter table outreach_roles add column if not exists created_at timestamp with time zone default now();
create table if not exists outreaches (
  id uuid default gen_random_uuid() not null,
  organisation_id uuid not null,
  title text not null,
  description text,
  date date not null,
  start_time time without time zone,
  end_time time without time zone,
  region text,
  district text,
  location_name text,
  required_skills text[],
  required_category text,
  role_type outreach_role_type not null,
  slots_total integer not null,
  slots_filled integer default 0 not null,
  status outreach_status default 'draft'::outreach_status not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  flyer_url text,
  venue_latitude double precision,
  venue_longitude double precision,
  venue_anchored_at timestamp with time zone,
  location_image_url text,
  location_lat numeric,
  location_lng numeric,
  constraint outreaches_pkey PRIMARY KEY (id)
);
alter table outreaches add column if not exists id uuid default gen_random_uuid();
alter table outreaches add column if not exists organisation_id uuid;
alter table outreaches add column if not exists title text;
alter table outreaches add column if not exists description text;
alter table outreaches add column if not exists date date;
alter table outreaches add column if not exists start_time time without time zone;
alter table outreaches add column if not exists end_time time without time zone;
alter table outreaches add column if not exists region text;
alter table outreaches add column if not exists district text;
alter table outreaches add column if not exists location_name text;
alter table outreaches add column if not exists required_skills text[];
alter table outreaches add column if not exists required_category text;
alter table outreaches add column if not exists role_type outreach_role_type;
alter table outreaches add column if not exists slots_total integer;
alter table outreaches add column if not exists slots_filled integer default 0;
alter table outreaches add column if not exists status outreach_status default 'draft'::outreach_status;
alter table outreaches add column if not exists created_at timestamp with time zone default now();
alter table outreaches add column if not exists updated_at timestamp with time zone default now();
alter table outreaches add column if not exists flyer_url text;
alter table outreaches add column if not exists venue_latitude double precision;
alter table outreaches add column if not exists venue_longitude double precision;
alter table outreaches add column if not exists venue_anchored_at timestamp with time zone;
alter table outreaches add column if not exists location_image_url text;
alter table outreaches add column if not exists location_lat numeric;
alter table outreaches add column if not exists location_lng numeric;
create table if not exists profiles (
  id uuid not null,
  role profile_role not null,
  full_name text not null,
  phone text,
  email text,
  region text,
  district text,
  avatar_url text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  moderation_state moderation_state default 'active'::moderation_state not null,
  moderation_reason text,
  moderated_at timestamp with time zone,
  closed_at timestamp with time zone,
  constraint profiles_pkey PRIMARY KEY (id)
);
alter table profiles add column if not exists id uuid;
alter table profiles add column if not exists role profile_role;
alter table profiles add column if not exists full_name text;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists email text;
alter table profiles add column if not exists region text;
alter table profiles add column if not exists district text;
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists created_at timestamp with time zone default now();
alter table profiles add column if not exists updated_at timestamp with time zone default now();
alter table profiles add column if not exists moderation_state moderation_state default 'active'::moderation_state;
alter table profiles add column if not exists moderation_reason text;
alter table profiles add column if not exists moderated_at timestamp with time zone;
alter table profiles add column if not exists closed_at timestamp with time zone;
create table if not exists score_events (
  id uuid default gen_random_uuid() not null,
  volunteer_id uuid not null,
  kind score_event_kind not null,
  points numeric not null,
  outreach_id uuid,
  application_id uuid,
  outreach_day_id uuid,
  reason text not null,
  voided_at timestamp with time zone,
  voided_reason text,
  dedupe_key text not null,
  created_at timestamp with time zone default now() not null,
  constraint score_events_pkey PRIMARY KEY (id)
);
alter table score_events add column if not exists id uuid default gen_random_uuid();
alter table score_events add column if not exists volunteer_id uuid;
alter table score_events add column if not exists kind score_event_kind;
alter table score_events add column if not exists points numeric;
alter table score_events add column if not exists outreach_id uuid;
alter table score_events add column if not exists application_id uuid;
alter table score_events add column if not exists outreach_day_id uuid;
alter table score_events add column if not exists reason text;
alter table score_events add column if not exists voided_at timestamp with time zone;
alter table score_events add column if not exists voided_reason text;
alter table score_events add column if not exists dedupe_key text;
alter table score_events add column if not exists created_at timestamp with time zone default now();
create table if not exists skill_match_cache (
  id uuid default gen_random_uuid() not null,
  skill_a text not null,
  skill_b text not null,
  is_match boolean not null,
  created_at timestamp with time zone default now() not null,
  constraint skill_match_cache_pkey PRIMARY KEY (id)
);
alter table skill_match_cache add column if not exists id uuid default gen_random_uuid();
alter table skill_match_cache add column if not exists skill_a text;
alter table skill_match_cache add column if not exists skill_b text;
alter table skill_match_cache add column if not exists is_match boolean;
alter table skill_match_cache add column if not exists created_at timestamp with time zone default now();
create table if not exists vetted_sources (
  id uuid default gen_random_uuid() not null,
  name text not null,
  url text not null,
  source_type text,
  rationale text not null,
  added_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint vetted_sources_pkey PRIMARY KEY (id)
);
alter table vetted_sources add column if not exists id uuid default gen_random_uuid();
alter table vetted_sources add column if not exists name text;
alter table vetted_sources add column if not exists url text;
alter table vetted_sources add column if not exists source_type text;
alter table vetted_sources add column if not exists rationale text;
alter table vetted_sources add column if not exists added_by uuid;
alter table vetted_sources add column if not exists created_at timestamp with time zone default now();
create table if not exists volunteer_profiles (
  id uuid not null,
  category volunteer_category,
  skill_tags text[],
  specialties text[],
  experience_level experience_level,
  availability_slots text[],
  bio text,
  v_score numeric default 70 not null,
  events_attended integer default 0 not null,
  declaration_signed boolean default false not null,
  verification_status verification_status default 'unverified'::verification_status not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  credential_document_id text,
  verification_reason text,
  verification_decided_at timestamp with time zone,
  verification_submitted_at timestamp with time zone,
  document_consent_at timestamp with time zone,
  v_score_recomputed_at timestamp with time zone,
  constraint volunteer_profiles_pkey PRIMARY KEY (id)
);
alter table volunteer_profiles add column if not exists id uuid;
alter table volunteer_profiles add column if not exists category volunteer_category;
alter table volunteer_profiles add column if not exists skill_tags text[];
alter table volunteer_profiles add column if not exists specialties text[];
alter table volunteer_profiles add column if not exists experience_level experience_level;
alter table volunteer_profiles add column if not exists availability_slots text[];
alter table volunteer_profiles add column if not exists bio text;
alter table volunteer_profiles add column if not exists v_score numeric default 70;
alter table volunteer_profiles add column if not exists events_attended integer default 0;
alter table volunteer_profiles add column if not exists declaration_signed boolean default false;
alter table volunteer_profiles add column if not exists verification_status verification_status default 'unverified'::verification_status;
alter table volunteer_profiles add column if not exists created_at timestamp with time zone default now();
alter table volunteer_profiles add column if not exists updated_at timestamp with time zone default now();
alter table volunteer_profiles add column if not exists credential_document_id text;
alter table volunteer_profiles add column if not exists verification_reason text;
alter table volunteer_profiles add column if not exists verification_decided_at timestamp with time zone;
alter table volunteer_profiles add column if not exists verification_submitted_at timestamp with time zone;
alter table volunteer_profiles add column if not exists document_consent_at timestamp with time zone;
alter table volunteer_profiles add column if not exists v_score_recomputed_at timestamp with time zone;

-- Functions that exist only because a migration created them. Created here,
-- before the policies further down that call them.
CREATE OR REPLACE FUNCTION public.application_role_is_clinical(p_outreach_id uuid, p_role_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    -- The role the volunteer actually applied for, when they chose one.
    (select r.role_type = 'clinical' from outreach_roles r where r.id = p_role_id),
    -- Otherwise the outreach's own summary (single-role mode).
    (select o.role_type = 'clinical' from outreaches o where o.id = p_outreach_id),
    -- Neither could be resolved: treat it as clinical and require
    -- verification. Fail closed.
    true
  );
$function$;

CREATE OR REPLACE FUNCTION public.apply_to_outreach(p_outreach_id uuid, p_type text, p_motivation text, p_outreach_role_id uuid, p_day_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS applications
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  existing applications;
  saved    applications;
begin
  select * into existing
    from applications
   where outreach_id = p_outreach_id
     and volunteer_id = auth.uid();

  if found and existing.status <> 'cancelled' then
    raise exception 'You have already applied to this outreach.'
      using errcode = 'unique_violation';
  end if;

  if found then
    -- Clear the withdrawn commitment WHILE the row still reads 'cancelled',
    -- which is the only state the helper accepts. Done through the helper
    -- because this function runs as the volunteer, who holds no DELETE on
    -- application_days (20260821).
    perform clear_withdrawn_application_days(existing.id);

    -- A withdrawn application still occupies UNIQUE (outreach_id,
    -- volunteer_id), so re-applying reactivates the row rather than inserting.
    -- outreach_role_id is deliberately NOT rewritten: it is INSERT-only, so a
    -- revived application keeps the role it was made for.
    update applications
       set status              = 'pending',
           type                = p_type::application_type,
           motivation          = p_motivation,
           cancellation_reason = null
     where id = existing.id
     returning * into saved;
  else
    -- A first application has no committed days, so there is nothing to clear
    -- and no DELETE is issued at all.
    insert into applications (
      outreach_id, volunteer_id, type, motivation, outreach_role_id
    ) values (
      p_outreach_id, auth.uid(), p_type::application_type, p_motivation, p_outreach_role_id
    )
    returning * into saved;
  end if;

  insert into application_days (application_id, outreach_day_id)
  select saved.id, d.id
    from outreach_days d
   where d.outreach_id = p_outreach_id
     and (
       p_day_ids is null
       or array_length(p_day_ids, 1) is null
       or d.id = any (p_day_ids)
     )
  on conflict (application_id, outreach_day_id) do nothing;

  -- Zero days is never a valid commitment.
  if not exists (select 1 from application_days where application_id = saved.id) then
    raise exception 'Choose at least one day you can attend.'
      using errcode = 'check_violation';
  end if;

  return saved;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assert_day_belongs_to_outreach()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1
      from applications a
      join outreach_days d on d.id = new.outreach_day_id
     where a.id = new.application_id
       and d.outreach_id = a.outreach_id
  ) then
    raise exception 'That day does not belong to this outreach.'
      using errcode = 'check_violation';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.assert_role_belongs_to_outreach()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.outreach_role_id is not null
     and not exists (
       select 1 from outreach_roles r
        where r.id = new.outreach_role_id
          and r.outreach_id = new.outreach_id
     )
  then
    raise exception 'This role does not belong to that outreach.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.clear_withdrawn_application_days(p_application_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  app applications;
begin
  select * into app from applications where id = p_application_id;

  if not found
     or app.volunteer_id is distinct from auth.uid()
     or app.status <> 'cancelled' then
    raise exception 'Only your own withdrawn application can be cleared.'
      using errcode = 'insufficient_privilege';
  end if;

  -- An attended day is evidence and is never erased, whatever the status says.
  if exists (
    select 1 from attendance
     where outreach_id = app.outreach_id
       and volunteer_id = app.volunteer_id
  ) then
    raise exception 'This application has attendance recorded and cannot be cleared.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from application_days where application_id = p_application_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.count_recent_late_releases(p_volunteer_id uuid, p_window_days integer DEFAULT 90)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int
    from application_days ad
    join applications a on a.id = ad.application_id
   where a.volunteer_id = p_volunteer_id
     and ad.late_release
     and ad.released_at is not null
     and ad.released_at >= now() - make_interval(days => p_window_days);
$function$;

CREATE OR REPLACE FUNCTION public.create_default_outreach_day()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Times deliberately left NULL: see section 1. The day inherits the
  -- outreach's hours rather than freezing a copy of them.
  insert into outreach_days (outreach_id, day)
  values (new.id, new.date)
  on conflict (outreach_id, day) do nothing;
  return null;
end $function$;

-- 20260925c: the database copy of constants/skillEligibility.ts. `category`
-- is text, not the enum, so this file can fill it in the same transaction
-- that adds the 'allied_health' enum value.
create table if not exists volunteer_claim_eligibility (
  kind text not null check (kind in ('skill', 'specialty')),
  item text not null,
  category text not null,
  constraint volunteer_claim_eligibility_pkey primary key (kind, item, category)
);

create or replace function enforce_volunteer_claim_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  added_skills text[];
  added_specialties text[];
  refused text;
begin
  added_skills := array(
    select unnest(coalesce(new.skill_tags, '{}'))
    except
    select unnest(case when tg_op = 'UPDATE' then coalesce(old.skill_tags, '{}') else '{}' end)
  );
  added_specialties := array(
    select unnest(coalesce(new.specialties, '{}'))
    except
    select unnest(case when tg_op = 'UPDATE' then coalesce(old.specialties, '{}') else '{}' end)
  );

  select string_agg(s, ', ') into refused
  from unnest(added_skills) as s
  where not exists (
    select 1 from volunteer_claim_eligibility e
    where e.kind = 'skill' and e.item = s and e.category = new.category::text
  );
  if refused is not null then
    raise exception 'These skills are not open to your role: %', refused using errcode = 'check_violation';
  end if;

  select string_agg(s, ', ') into refused
  from unnest(added_specialties) as s
  where not exists (
    select 1 from volunteer_claim_eligibility e
    where e.kind = 'specialty' and e.item = s and e.category = new.category::text
  );
  if refused is not null then
    raise exception 'These specialties are not open to your role: %', refused using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


CREATE OR REPLACE FUNCTION public.reset_verification_on_category_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.category is not null and new.category is distinct from old.category then
    new.verification_status := 'unverified';
    new.credential_document_id := null;
    new.verification_submitted_at := null;
    new.verification_decided_at := null;
    new.verification_reason := null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_volunteer_list_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  new_skills int := coalesce(cardinality(new.skill_tags), 0);
  new_specialties int := coalesce(cardinality(new.specialties), 0);
  old_skills int := case when tg_op = 'UPDATE' then coalesce(cardinality(old.skill_tags), 0) else 0 end;
  old_specialties int := case when tg_op = 'UPDATE' then coalesce(cardinality(old.specialties), 0) else 0 end;
begin
  if new_skills > 15 and new_skills > old_skills then
    raise exception 'A volunteer can list at most 15 skills.' using errcode = 'check_violation';
  end if;
  if new_specialties > 3 and new_specialties > old_specialties then
    raise exception 'A volunteer can list at most 3 specialties.' using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_outreach_image_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  existing int;
begin
  select count(*) into existing from outreach_images where outreach_id = new.outreach_id;

  if existing >= 8 then
    raise exception 'An outreach can have at most 8 gallery images. Remove one before adding another.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.outreaches_needing_resolution()
 RETURNS TABLE(outreach_id uuid, unresolved_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.outreach_id, count(*) as unresolved_count
    from applications a
    join outreaches o on o.id = a.outreach_id
   where a.status in ('pending', 'waitlisted')
     and (
       -- The organisation ended it.
       o.status in ('closed', 'completed')
       -- Or the day came and went while it was still open.
       or (o.status = 'open' and o.date < current_date)
     )
   group by a.outreach_id;
$function$;

CREATE OR REPLACE FUNCTION public.refuse_committed_day_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  commitments int;
begin
  select count(*) into commitments
    from application_days where outreach_day_id = old.id;

  if commitments > 0 then
    raise exception
      'Volunteers have already committed to %. Leave the day in place — a day nobody attends simply does not count.',
      to_char(old.day, 'FMDay DD Mon YYYY')
      using errcode = 'restrict_violation';
  end if;

  return old;
end $function$;

CREATE OR REPLACE FUNCTION public.refuse_delete_of_used_outreach()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  application_count int;
  attendance_count  int;
  review_count      int;
begin
  select count(*) into application_count from applications  where outreach_id = old.id;
  select count(*) into attendance_count  from attendance    where outreach_id = old.id;
  select count(*) into review_count      from event_reviews where outreach_id = old.id;

  -- Cancelled applications count too. Someone applied and withdrew; that is
  -- still their record of having been involved.
  if application_count > 0 or attendance_count > 0 or review_count > 0 then
    raise exception
      'This outreach has % application(s), % attendance record(s) and % review(s). Cancel it instead of deleting it.',
      application_count, attendance_count, review_count
      using errcode = 'restrict_violation';
  end if;

  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refuse_uncancelling_outreach()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception
      'This outreach was cancelled and cannot be reopened. Create a new one instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_unsuccessful_applications(p_outreach_id uuid)
 RETURNS TABLE(application_id uuid, volunteer_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  update applications a
     set status = 'not_selected'
   where a.outreach_id = p_outreach_id
     -- Only these two. `accepted` earned a place, `cancelled` withdrew,
     -- `rejected` already had a decision, and `not_selected` is idempotent.
     and a.status in ('pending', 'waitlisted')
  returning a.id, a.volunteer_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_outreach(p_outreach_id uuid, p_title text, p_description text, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_region text, p_district text, p_location_name text, p_required_skills text[], p_required_category text, p_role_type outreach_role_type, p_slots_total integer, p_flyer_url text, p_roles jsonb, p_days date[] DEFAULT NULL::date[])
 RETURNS outreaches
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  saved outreaches;
  first_day date;
  stored_day_count int;
begin
  if p_days is not null then
    if array_length(p_days, 1) is null then
      raise exception 'An outreach needs at least one day.'
        using errcode = 'check_violation';
    end if;

    -- See sync_single_day_from_outreach: the day set is managed explicitly
    -- below, and letting that trigger fire in between would move an existing
    -- day row rather than add one.
    perform set_config('vhub.skip_day_sync', '1', true);
    select min(d) into first_day from unnest(p_days) as d;
  else
    first_day := p_date;
  end if;

  update outreaches o
     set title             = p_title,
         description       = p_description,
         date              = first_day,
         start_time        = p_start_time,
         end_time          = p_end_time,
         region            = p_region,
         district          = p_district,
         location_name     = p_location_name,
         required_skills   = p_required_skills,
         required_category = p_required_category,
         role_type         = p_role_type,
         slots_total       = coalesce(p_slots_total, o.slots_total),
         flyer_url         = p_flyer_url
   where o.id = p_outreach_id;

  if not found then
    raise exception 'That outreach could not be found, or it is not yours to edit.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_days is not null then
    select count(*) into stored_day_count
      from outreach_days where outreach_id = p_outreach_id;

    if stored_day_count = 1 and array_length(p_days, 1) = 1 then
      -- Rule 2: a reschedule. Moved in place, so the row keeps its id and every
      -- commitment on it survives — which is what an organisation means when
      -- they change the date of their own event.
      update outreach_days
         set day = p_days[1]
       where outreach_id = p_outreach_id
         and day is distinct from p_days[1];
    else
      -- Rule 3. Remove only the days that are genuinely gone; the delete
      -- trigger refuses any that carry commitments, which aborts the whole save
      -- — the details included — rather than half-applying the edit.
      delete from outreach_days
       where outreach_id = p_outreach_id
         and day <> all (p_days);

      -- Rule 1. Add only the days that are genuinely new, so surviving days
      -- keep their ids and the commitments hanging off them.
      insert into outreach_days (outreach_id, day)
      select p_outreach_id, d
        from unnest(p_days) as d
      on conflict (outreach_id, day) do nothing;
    end if;
  end if;

  if p_roles is not null then
    delete from outreach_roles where outreach_id = p_outreach_id;

    insert into outreach_roles (
      outreach_id, category, role_type, min_experience_level, slots_total
    )
    select
      p_outreach_id,
      r.category,
      r.role_type,
      r.min_experience_level,
      r.slots_total
      from jsonb_to_recordset(p_roles) as r(
             category             text,
             role_type            text,
             min_experience_level text,
             slots_total          int
           );
  end if;

  -- Re-read rather than RETURNING: the day and role triggers rewrite `date`,
  -- role_type, slots_total and slots_filled after the update above.
  select * into saved from outreaches where id = p_outreach_id;
  return saved;
end;
$function$;

CREATE OR REPLACE FUNCTION public.stamp_application_day_release()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  day_start timestamptz;
  live_future_days int;
  any_day_started boolean;
begin
  -- Nothing about the release changed; this is some other update to the row.
  if new.released_at is null and old.released_at is null then
    return new;
  end if;
  if new.released_at is not null and old.released_at is not null then
    return new;
  end if;

  select (d.day + coalesce(d.start_time, o.start_time, '00:00'::time))
           at time zone 'UTC'
    into day_start
    from outreach_days d
    join outreaches o on o.id = d.outreach_id
   where d.id = new.outreach_day_id;

  -- ---------- taking a released day back on ----------
  -- Allowed while the day is still ahead, and it clears the late flag: the
  -- volunteer is committed again, so there is no cancellation to weigh.
  if new.released_at is null and old.released_at is not null then
    if day_start is not null and now() >= day_start then
      raise exception 'That day has already started, so it cannot be taken back on.'
        using errcode = 'check_violation';
    end if;
    new.late_release := false;
    return new;
  end if;

  -- ---------- releasing ----------
  if day_start is not null and now() >= day_start then
    raise exception 'That day has already started. Releasing it now would be a no-show, not a cancellation.'
      using errcode = 'check_violation';
  end if;

  -- The client cannot choose the timestamp, only ask for the release.
  new.released_at := now();
  new.late_release := day_start is not null
                      and now() >= day_start - interval '24 hours';

  select
    count(*) filter (
      where ad.released_at is null
        and ad.id <> new.id
        and (d.day + coalesce(d.start_time, o.start_time, '00:00'::time))
              at time zone 'UTC' > now()
    ),
    bool_or(
      (d.day + coalesce(d.start_time, o.start_time, '00:00'::time))
        at time zone 'UTC' <= now()
    )
    into live_future_days, any_day_started
    from application_days ad
    join outreach_days d on d.id = ad.outreach_day_id
    join outreaches o on o.id = d.outreach_id
   where ad.application_id = new.application_id;

  if live_future_days = 0 and not coalesce(any_day_started, false) then
    raise exception 'That is the last day you are committed to. Withdraw from the outreach instead.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_outreach_first_day()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected_outreach uuid := coalesce(new.outreach_id, old.outreach_id);
begin
  update outreaches o
     set date = (select min(d.day) from outreach_days d where d.outreach_id = o.id)
   where o.id = affected_outreach
     and exists (select 1 from outreach_days where outreach_id = affected_outreach)
     -- Added in this migration. Without it the write always happens, which
     -- re-fires trg_outreaches_sync_single_day below for ever.
     and o.date is distinct from
         (select min(d.day) from outreach_days d where d.outreach_id = o.id);
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.sync_outreach_role_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected_outreach uuid := coalesce(new.outreach_id, old.outreach_id);
begin
  update outreaches o
     set role_type = (
           case
             when exists (
               select 1 from outreach_roles r
                where r.outreach_id = o.id and r.role_type = 'clinical'
             ) then 'clinical' else 'support'
           end
         )::outreach_role_type
   where o.id = affected_outreach
     and exists (select 1 from outreach_roles where outreach_id = affected_outreach);
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_outreach_totals_from_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected_outreach uuid := coalesce(new.outreach_id, old.outreach_id);
begin
  update outreaches o
     set slots_total  = (select coalesce(sum(r.slots_total), 0)  from outreach_roles r where r.outreach_id = o.id),
         slots_filled = (select coalesce(sum(r.slots_filled), 0) from outreach_roles r where r.outreach_id = o.id)
   where o.id = affected_outreach
     and exists (select 1 from outreach_roles where outreach_id = affected_outreach);
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_role_slots_filled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected_role uuid := coalesce(new.outreach_role_id, old.outreach_role_id);
  affected_outreach uuid := coalesce(new.outreach_id, old.outreach_id);
begin
  if affected_role is not null then
    update outreach_roles r
       set slots_filled = (
         select count(*) from applications a
          where a.outreach_role_id = r.id and a.status = 'accepted'
       )
     where r.id = affected_role;
  end if;

  -- Guarded on the existence of role rows, so this NEVER fires for a
  -- single-role outreach. That guard is what makes the migration safe for
  -- every outreach that already exists.
  if exists (select 1 from outreach_roles where outreach_id = affected_outreach) then
    update outreaches o
       set slots_filled = (select coalesce(sum(r.slots_filled), 0) from outreach_roles r where r.outreach_id = o.id),
           slots_total  = (select coalesce(sum(r.slots_total), 0)  from outreach_roles r where r.outreach_id = o.id)
     where o.id = affected_outreach;
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_single_day_from_outreach()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- STAND ASIDE FOR save_outreach(), which manages the day set explicitly.
  --
  -- Without this, adding an EARLIER day to a one-day outreach corrupts it
  -- silently. save_outreach updates `date` first (for the ownership check), so
  -- this trigger would see one day row, treat the new first date as a
  -- reschedule, and MOVE that row -- carrying every commitment on it onto a
  -- different date -- and the day the organisation actually meant to keep would
  -- then be re-inserted as a brand-new row with no commitments. The day set
  -- would look right and the promises would be attached to the wrong dates.
  --
  -- `true` scopes the setting to the transaction, so it cannot leak into the
  -- next statement on a pooled connection.
  if coalesce(current_setting('vhub.skip_day_sync', true), '') = '1' then
    return null;
  end if;

  if (select count(*) from outreach_days where outreach_id = new.id) = 1 then
    update outreach_days
       set day = new.date
     where outreach_id = new.id
       and day is distinct from new.date;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.vscore_day_ratio(p_volunteer_id uuid, p_outreach_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with committed as (
    select ad.outreach_day_id
      from application_days ad
      join applications a on a.id = ad.application_id
     where a.volunteer_id = p_volunteer_id
       and a.outreach_id  = p_outreach_id
       and ad.released_at is null
  )
  select case
    when count(*) = 0 then null::numeric
    else least(
           1::numeric,
           greatest(
             0::numeric,
             sum(
               case
                 when coalesce(
                        (select attendance_is_present(att)
                           from attendance att
                          where att.volunteer_id    = p_volunteer_id
                            and att.outreach_id     = p_outreach_id
                            and att.outreach_day_id = c.outreach_day_id
                          limit 1),
                        true)
                 then 1 else 0
               end
             )::numeric / count(*)::numeric
           )
         )
  end
  from committed c;
$function$;

CREATE OR REPLACE FUNCTION public.vscore_event_outcome(p_attended boolean, p_reliability integer, p_clinical integer)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_attended is false then 0::numeric
    when p_attended is not true then null::numeric
    when p_reliability is null then null::numeric
    when p_clinical is null then (p_reliability * 20)::numeric
    else (((p_reliability + p_clinical) / 2.0) * 20)::numeric
  end;
$function$;

CREATE OR REPLACE FUNCTION public.vscore_replay()
 RETURNS TABLE(volunteer_id uuid, score numeric, events_attended integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with recursive merged as (
    -- Reviewed events.
    select
      er.volunteer_id                                as volunteer_id,
      er.created_at                                  as at,
      0                                              as source_rank,
      er.id                                          as tie,
      'review'::text                                 as entry_kind,
      er.attended                                    as attended,
      er.reliability_score                           as reliability_score,
      er.clinical_score                              as clinical_score,
      null::numeric                                  as points,
      vscore_day_ratio(er.volunteer_id, er.outreach_id) as day_ratio,
      exists (
        select 1 from disputes d
         where d.volunteer_id = er.volunteer_id
           and d.outreach_id = er.outreach_id
           and d.status = 'upheld'
      )                                              as voided,
      (
        coalesce(er.attended, false)
        or exists (
          select 1 from disputes d
           where d.volunteer_id = er.volunteer_id
             and d.outreach_id = er.outreach_id
             and d.type = 'attendance'
             and d.status = 'upheld'
        )
      )                                              as attended_effective
    from event_reviews er

    union all

    -- Penalties. They carry no attendance, no ratings and no days, and never
    -- touch the attendance count -- cancelling is not attending.
    select
      se.volunteer_id,
      se.created_at,
      1,
      se.id,
      'penalty'::text,
      null::boolean,
      null::integer,
      null::integer,
      se.points,
      null::numeric,
      (se.voided_at is not null),
      false
    from score_events se
  ),
  ordered as (
    select
      m.*,
      row_number() over (
        partition by m.volunteer_id
        order by m.at, m.source_rank, m.tie
      ) as n
    from merged m
  ),
  walk as (
    select
      v.volunteer_id,
      -- The casts are load-bearing. A recursive CTE demands the same type in
      -- both terms: row_number() returns bigint, so a bare 0 here is an integer
      -- and Postgres refuses the whole function with "has type integer in
      -- non-recursive term but bigint overall".
      0::bigint    as n,
      70::numeric  as score,
      0::integer   as attended_count
    from (select distinct o.volunteer_id from ordered o) v

    union all

    select
      w.volunteer_id,
      o.n,
      case
        when o.voided then w.score
        when o.entry_kind = 'penalty'
          then greatest(0::numeric, least(100::numeric, w.score + o.points))
        when vscore_event_outcome(o.attended, o.reliability_score, o.clinical_score) is null
          then w.score
        else greatest(
               0::numeric,
               least(
                 100::numeric,
                 0.7 * w.score
                 + 0.3 * (
                     vscore_event_outcome(o.attended, o.reliability_score, o.clinical_score)
                     * coalesce(o.day_ratio, 1::numeric)
                   )
               )
             )
      end,
      (w.attended_count + case when o.attended_effective then 1 else 0 end)::integer
    from walk w
    join ordered o
      on o.volunteer_id = w.volunteer_id
     and o.n = w.n + 1
  )
  select distinct on (walk.volunteer_id)
    walk.volunteer_id,
    walk.score,
    walk.attended_count
  from walk
  order by walk.volunteer_id, walk.n desc;
$function$;

-- ============================================================
-- PART 1: the hand-written schema
-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- Enums
-- ============================================================
-- 'admin' is the platform moderator: organisation verification, credential
-- Gate 1, moderation and disputes. It is NOT a role anyone can register as —
-- the welcome screen never offers it, profiles_insert_own bars a client from
-- inserting it (see that policy), and the only way to become one is an UPDATE
-- run in the SQL editor on the postgres role.
-- NOTE: this create-type only runs on a FRESH install. An already-provisioned
-- project gets the value from supabase/migrations/20260825a_admin_role_enum.sql,
-- which must be pasted ON ITS OWN — a new enum value cannot be used in the
-- same transaction that adds it.
do $$ begin
  create type profile_role as enum ('volunteer', 'organisation', 'admin');
exception when duplicate_object then null; end $$;

-- Order: qualified professionals, then students, then support roles.
-- 'student' covers all health/medical disciplines (medicine, nursing,
-- pharmacy, allied health); 'pharmacist' is the qualified pharmacy role.
-- NOTE: this create-type only runs on a FRESH install (the duplicate_object
-- guard skips it on existing databases). An already-provisioned project is
-- migrated by the separate ALTER TYPE script (rename pharmacy_student→student,
-- add pharmacist) — the enum's physical value order there will differ, which
-- is cosmetic only: display order comes from VOLUNTEER_CATEGORIES in TS, never
-- from the enum. See docs/REPORT_NOTES.md.
-- How far an organisation is through verification. A boolean could not express
-- "we looked and said no", "we are waiting", or "this account is suspended",
-- and all three are states an organisation can be in. `suspended` and `banned`
-- are moderation states (package F) and are in the enum from the start so that
-- adding them later does not need its own separate migration paste.
do $$ begin
  create type org_verification_state as enum (
    'unverified',
    'documents_submitted',
    'verified',
    'rejected',
    'suspended',
    'banned'
  );
exception when duplicate_object then null; end $$;

-- Whether an account may do anything NEW (admin phase package F). Deliberately
-- SEPARATE from org_verification_state: "we checked their documents" and "they
-- are currently allowed to operate" are independent facts, and folding them
-- together would make a suspension erase a verification that could not then be
-- restored. On `profiles`, so one implementation covers both roles.
do $$ begin
  create type moderation_state as enum ('active', 'suspended', 'banned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type volunteer_category as enum ('doctor', 'nurse', 'midwife', 'pharmacist', 'allied_health', 'student', 'first_aider', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type experience_level as enum ('beginner', 'intermediate', 'experienced');
exception when duplicate_object then null; end $$;

do $$ begin
  create type outreach_role_type as enum ('clinical', 'support');
exception when duplicate_object then null; end $$;

-- 'cancelled' added by 20260815a_outreach_status_cancelled.sql. It was missing
-- from this list until 2026-09-23, so a project provisioned from this file
-- alone could not cancel an outreach -- and the `exception when
-- duplicate_object` wrapper meant nothing said so.
do $$ begin
  create type outreach_status as enum ('draft', 'open', 'closed', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_type as enum ('quick_join', 'full');
exception when duplicate_object then null; end $$;

-- 'not_selected' added by 20260811_not_selected_status.sql; same omission and
-- same silence as outreach_status above.
do $$ begin
  create type application_status as enum ('pending', 'accepted', 'rejected', 'waitlisted', 'cancelled', 'not_selected');
exception when duplicate_object then null; end $$;

-- Ghana has no public licensing-registry API (Nursing & Midwifery Council,
-- Medical & Dental Council, Pharmacy Council) to verify a self-entered
-- license number against, so verification is a tiered human/document
-- process instead of a boolean. unverified = declaration signed only;
-- documents_pending = credential document uploaded (Cloudinary, later
-- phase), awaiting review; verified = a human org-admin approved the
-- document.
do $$ begin
  create type verification_status as enum ('unverified', 'documents_pending', 'verified');
exception when duplicate_object then null; end $$;

-- ============================================================
-- Shared trigger function: maintains updated_at on every table
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- profiles — base identity, PK = auth.users.id
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role profile_role not null,
  full_name text not null,
  phone text,
  email text,
  region text,
  district text,
  avatar_url text,
  -- Moderation (package F). Server-only, like `role` and for the same reason:
  -- a client that could clear its own suspension would make moderation
  -- advisory. `moderation_reason` is the reason for the CURRENT state and is
  -- cleared on reinstatement; the history of every decision lives in
  -- admin_actions and is never overwritten.
  moderation_state moderation_state not null default 'active',
  moderation_reason text,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

alter table profiles enable row level security;

-- Row-scoped: a user may read their own profile row, plus the profile row
-- of the other party in any application relationship (org <-> volunteer who
-- applied to one of that org's outreaches). This intentionally does NOT
-- allow a volunteer to browse an org's profile before applying, or an org to
-- browse volunteers who haven't applied -- phone/email are PII and must not
-- be readable by unrelated authenticated users.
-- FOLLOW-UP (not built yet): Figma's "Volunteer Public Profile" and
-- "Organization Public Profile" screens will need broader read access for
-- pre-application browsing/discovery. When those screens are built, add a
-- `public` flag column or a dedicated view exposing only non-sensitive
-- columns (name, avatar, bio, skills, v_score) -- never phone/email --
-- rather than loosening this policy back to using (true).
-- is_related_via_application(): "does an application link me and this person?"
--
-- This lookup MUST go through a security definer function rather than an
-- inline `exists (select 1 from applications ...)` subquery. Inline, it forms
-- a policy cycle -- applications_insert_own subqueries volunteer_profiles,
-- and volunteer_profiles/profiles subquery applications right back -- and
-- Postgres aborts with SQLSTATE 42P17, "infinite recursion detected in policy
-- for relation applications". That broke Quick Join, Full Application, and
-- the organisation Applicants list. Postgres never inlines a security definer
-- body, which is what severs the cycle. See
-- supabase/migrations/20260731_fix_applications_rls_recursion.sql.
--
-- DO NOT "simplify" the two policies below back into inline subqueries.
--
-- Not a widening of access: exists(P) or exists(Q) == exists(P or Q) over the
-- same join, so this computes exactly what the inline branches did. Table
-- names are schema-qualified because Postgres resolves relation names against
-- pg_temp before an explicitly set search_path.
create or replace function public.is_related_via_application(target_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.applications a
    join public.outreaches o on o.id = a.outreach_id
    where (a.volunteer_id = target_id and o.organisation_id = auth.uid())
       or (o.organisation_id = target_id and a.volunteer_id = auth.uid())
  );
$$;

-- Reviewed and accepted: the grant also exposes this as PostgREST
-- rpc/is_related_via_application with an arbitrary target_id. It returns only
-- a boolean that is already derivable from ordinary row visibility, so it is
-- not a new disclosure. Noted so a future audit doesn't read it as an
-- oversight.
revoke all on function public.is_related_via_application(uuid) from public;
grant execute on function public.is_related_via_application(uuid) to authenticated;

-- is_admin(): the role test, in one place, so no policy ever spells it out
-- again. security definer for the same reason as the function above — a policy
-- on `profiles` that has to read `profiles` is a recursion cycle (42P17), and
-- Postgres never inlines a security definer body. The default argument is
-- auth.uid(), so a policy just writes is_admin(); the explicit-uid form is for
-- server-side callers asking about somebody else. search_path is pinned so a
-- caller cannot shadow `profiles` with a table in pg_temp.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

-- Reviewed and accepted, as above: this is exposed as rpc/is_admin and returns
-- a boolean about a role already visible on any profile row the caller can
-- read. Not a new disclosure.
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

drop policy if exists "profiles_select_authenticated" on profiles;
create policy "profiles_select_authenticated"
  on profiles for select
  to authenticated
  using (
    auth.uid() = id
    or public.is_related_via_application(profiles.id)
    -- A queue that cannot show a volunteer's NAME beside their document is not
    -- usable. Admins read profiles for that and nothing else.
    or is_admin()
  );

-- `role <> 'admin'` is the second half of the role lock, and it guards the
-- INSERT rather than the UPDATE. The profiles row is created BY THE CLIENT at
-- signup (useSignUp, and useAuthGuard's bootstrap-from-metadata fallback), so
-- the role named in that insert is the client's to choose. While the enum held
-- only 'volunteer' and 'organisation' that was harmless — both are self-service
-- roles anyone can register as. The moment 'admin' became a legal value it was
-- a privilege escalation: register, ignore the app, POST /rest/v1/profiles with
-- role='admin'. The UPDATE lock (role absent from the grant list, below) never
-- covered this path, because an insert is not an update.
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id and role <> 'admin');

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- volunteer_profiles — 1:1 extension of profiles
-- v_score is service-role write-only; see column privilege revoke at bottom of file.
-- ============================================================
create table if not exists volunteer_profiles (
  id uuid primary key references profiles(id) on delete cascade,
  category volunteer_category,
  skill_tags text[],
  specialties text[],
  experience_level experience_level,
  availability_slots text[],
  bio text,
  v_score numeric not null default 70 check (v_score >= 0 and v_score <= 100),
  events_attended int not null default 0,
  declaration_signed boolean not null default false,
  verification_status verification_status not null default 'unverified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration for installs where volunteer_profiles already existed (Phase 0
-- ran once against the live project): add the new columns and drop the
-- superseded day-only availability column idempotently. Safe to re-run.
-- specialties: medical specialty tags (e.g. "Cardiology"), distinct from
-- skill_tags (granular clinical skills, e.g. "Venipuncture"). App-validated
-- against a constants list, same plain-array style as skill_tags.
alter table volunteer_profiles add column if not exists specialties text[];
-- availability_slots: composite "{day}_{slot}" tokens, e.g. "sat_afternoon",
-- day in mon|tue|wed|thu|fri|sat|sun, slot in morning|afternoon|evening.
-- App-validated, same plain-array style as skill_tags / required_skills.
alter table volunteer_profiles add column if not exists availability_slots text[];
-- availability_days (day-only granularity) is superseded by
-- availability_slots and dropped entirely, not kept alongside it.
alter table volunteer_profiles drop column if exists availability_days;
-- license_number/license_verified are dropped entirely: Ghana has no public
-- licensing-registry API (Nursing & Midwifery Council, Medical & Dental
-- Council, Pharmacy Council), so a self-entered license number proves
-- nothing. Replaced by the tiered verification_status enum below, driven by
-- an org-admin document review flow (later phase) instead of a boolean.
alter table volunteer_profiles drop column if exists license_number;
alter table volunteer_profiles drop column if exists license_verified;
alter table volunteer_profiles add column if not exists verification_status verification_status not null default 'unverified';

-- The Cloudinary PUBLIC_ID of the credential document backing verification --
-- a name, never an address. The URL column this replaced was the leak itself:
-- Cloudinary stored the asset with public delivery and the permanent URL sat
-- in this table, so anyone holding that string could fetch someone's identity
-- document with no session and no authorisation check. Credentials are now
-- `authenticated` assets, unfetchable without a signature, and
-- /api/document-url mints a short-lived signed link per request for a
-- requester it has just authorised. NEVER store a delivery URL here again.
--
-- Absent from volunteer_profiles' UPDATE grant list on purpose, alongside
-- verification_status itself: /api/verification-document writes BOTH together
-- on the service-role key, which is what makes 'documents_pending' mean a
-- document was really uploaded rather than a state a client simply asserted.
alter table volunteer_profiles add column if not exists credential_document_id text;
alter table volunteer_profiles drop column if exists credential_document_url;

-- The credential REVIEW (admin phase package D). All three are server-only:
-- a volunteer able to clear their own rejection reason could hide a decision
-- from the next reviewer.
--
-- There is deliberately NO 'rejected' verification_status. A volunteer whose
-- document was declined IS unverified -- that is the state they are in and the
-- thing they can act on. What they need is the REASON, which is this column;
-- a fourth enum value would need its own migration paste and a branch in every
-- screen, and would mean "unverified, and also we are cross about it".
alter table volunteer_profiles
  add column if not exists verification_reason text,
  add column if not exists verification_decided_at timestamptz,
  add column if not exists verification_submitted_at timestamptz;

-- When this volunteer agreed to the credential-upload consent text (admin
-- phase package E). NULL means they have not, and /api/verification-document
-- REFUSES a document in that case -- which is what makes the consent real
-- rather than a checkbox that proves nothing once the form closes. Server-only:
-- a client able to write it could record an agreement to something it was never
-- shown.
alter table volunteer_profiles
  add column if not exists document_consent_at timestamptz;

-- When v_score was last DERIVED by replaying the volunteer's whole review
-- history (V-Score reversal, owner-approved 2026-08-26 --
-- supabase/migrations/20260903a/b). v_score stopped being a running total that
-- each review blends into and became a CACHE of that replay; the truth is
-- event_reviews plus any upheld disputes. A derived value nothing records the
-- age of is indistinguishable from a stale one, which is what this column is
-- for. Server-only, like v_score itself: absent from every grant list.
alter table volunteer_profiles
  add column if not exists v_score_recomputed_at timestamptz;

-- The Cloudinary URL of an outreach's flyer image. Unlike the column above
-- this IS client-writable (see the grant lists at the foot of this file): an
-- organisation sets it on its own outreach, and a bad value harms only that
-- organisation's own listing.
alter table outreaches add column if not exists flyer_url text;

-- Venue photo and coordinates (2026-09-16). See
-- supabase/migrations/20260916_outreach_location.sql for the reasoning: the
-- image is a Cloudinary public_id on PUBLIC delivery like the flyer, and the
-- coordinates exist to hand to whichever map app the phone already has rather
-- than to render a map inside VHub.
alter table outreaches add column if not exists location_image_url text;
alter table outreaches add column if not exists location_lat numeric;
alter table outreaches add column if not exists location_lng numeric;
alter table outreaches drop constraint if exists outreaches_location_pair;
alter table outreaches add constraint outreaches_location_pair
  check ((location_lat is null) = (location_lng is null));
alter table outreaches drop constraint if exists outreaches_location_range;
alter table outreaches add constraint outreaches_location_range
  check (
    (location_lat is null or (location_lat >= -90 and location_lat <= 90))
    and (location_lng is null or (location_lng >= -180 and location_lng <= 180))
  );

drop trigger if exists trg_volunteer_profiles_updated_at on volunteer_profiles;
create trigger trg_volunteer_profiles_updated_at
  before update on volunteer_profiles
  for each row execute function set_updated_at();

alter table volunteer_profiles enable row level security;

-- Row-scoped, mirrors profiles_select_authenticated above (this row can
-- carry sensitive volunteer PII and must not be readable by unrelated
-- authenticated users). See the FOLLOW-UP note on profiles_select_authenticated
-- for the future public discovery view this will need once the public
-- profile screens are built.
-- Uses is_related_via_application() (defined above the profiles policies) and
-- not an inline applications subquery -- that is what caused SQLSTATE 42P17.
-- Do not revert it.
drop policy if exists "volunteer_profiles_select_authenticated" on volunteer_profiles;
-- `or is_admin()` is what makes the credential queue possible at all: an admin
-- shares no application with anybody, so without it the only person who is
-- supposed to read these rows would see none of them.
create policy "volunteer_profiles_select_authenticated"
  on volunteer_profiles for select
  to authenticated
  using (
    auth.uid() = id
    or public.is_related_via_application(volunteer_profiles.id)
    or is_admin()
  );

drop policy if exists "volunteer_profiles_insert_own" on volunteer_profiles;
create policy "volunteer_profiles_insert_own"
  on volunteer_profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "volunteer_profiles_update_own" on volunteer_profiles;
create policy "volunteer_profiles_update_own"
  on volunteer_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- organisation_profiles — 1:1 extension of profiles
-- ============================================================
create table if not exists organisation_profiles (
  id uuid primary key references profiles(id) on delete cascade,
  org_name text not null,
  org_type text,
  description text,
  website text,
  -- Public enquiry details the organisation chooses to publish. These are NOT
  -- the same as profiles.contact/email: those are the individual account
  -- holder's private PII and stay row-scoped. An org's published address is
  -- information it is deliberately advertising, which is why it can live on a
  -- `using (true)` table without contradicting the PII rule above.
  contact_email text,
  contact_phone text,
  -- Verification evidence. `official_email` is asked for SEPARATELY from
  -- contact_email above: the public enquiries address may legitimately be a
  -- Gmail, while an address on the organisation's own domain is a weak but
  -- real signal that the domain and the organisation are connected.
  official_email text,
  physical_address text,
  contact_person text,
  verification_state org_verification_state not null default 'unverified',
  -- The reason for the LAST decision, which is what the organisation needs in
  -- order to fix and resubmit. The full history of every decision lives in
  -- admin_actions and is never overwritten.
  verification_reason text,
  verification_decided_at timestamptz,
  verification_submitted_at timestamptz,
  -- The same consent record as volunteer_profiles.document_consent_at, for an
  -- organisation submitting its verification documents.
  document_consent_at timestamptz,
  -- DERIVED, and therefore unwritable by anyone including the service role.
  -- A boolean that must agree with something else will eventually disagree
  -- with it unless the database computes it -- the same reasoning CLAUDE.md
  -- gives for having no `is_multi_role` flag. Eight places read this boolean;
  -- deriving it keeps every one of them working untouched while
  -- verification_state becomes the truth.
  verified boolean generated always as (verification_state = 'verified') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_organisation_profiles_updated_at on organisation_profiles;
create trigger trg_organisation_profiles_updated_at
  before update on organisation_profiles
  for each row execute function set_updated_at();

alter table organisation_profiles enable row level security;

-- Deliberately broad (using (true)), unlike profiles_select_authenticated
-- above. Volunteers need to browse organisation info before applying to their
-- outreaches (Figma "Organization Public Profile" flow), and both
-- `useOutreaches` and `useApplications` EMBED this table into their outreach
-- reads to name the organisation on a card -- so DO NOT tighten this to a
-- row-scoped policy: it would return null for every outreach a volunteer does
-- not own, which is all of them.
--
-- THE COMMENT HERE USED TO SAY THE TABLE "HOLDS NO PII" AND LISTED ITS COLUMNS
-- AS org_name/org_type/description/website/verified. That stopped being true
-- when verification shipped (20260827) and added official_email,
-- physical_address, contact_person, verification_state, verification_reason and
-- two timestamps, and nothing revisited this policy -- so until 2026-09-23 any
-- volunteer or rival organisation could read an org's street address, its named
-- contact, and the verbatim reason an admin gave for rejecting it.
--
-- RLS CANNOT SPLIT BY COLUMN, so the row policy stays broad and the split is
-- made with column privileges at the bottom of this file: `authenticated` keeps
-- SELECT on the public columns only, and the private ones come back through
-- `organisation_private_profiles`, a definer-rights view carrying its own
-- `id = auth.uid() or is_admin()` test.
drop policy if exists "organisation_profiles_select_authenticated" on organisation_profiles;
create policy "organisation_profiles_select_authenticated"
  on organisation_profiles for select
  to authenticated
  using (true);

drop policy if exists "organisation_profiles_insert_own" on organisation_profiles;
create policy "organisation_profiles_insert_own"
  on organisation_profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "organisation_profiles_update_own" on organisation_profiles;
create policy "organisation_profiles_update_own"
  on organisation_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- outreaches — belongs to an organisation
-- ============================================================
create table if not exists outreaches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation_profiles(id) on delete cascade,
  title text not null,
  description text,
  date date not null,
  start_time time,
  end_time time,
  region text,
  district text,
  location_name text,
  required_skills text[],
  required_category text,
  role_type outreach_role_type,
  slots_total int not null check (slots_total > 0),
  slots_filled int not null default 0 check (slots_filled >= 0),
  status outreach_status not null default 'draft',
  -- The venue ANCHOR for the attendance location check, captured from the
  -- ORGANISER's device by an explicit "I'm at the venue" tap. The organiser's
  -- physical presence is the location reference, which is what removes any
  -- need for a map picker, a geocoding service, or venue coordinates entered
  -- in advance.
  --
  -- Note the asymmetry that makes this privacy-safe: the VENUE's coordinates
  -- are stored (a published public event, not a person), while the
  -- VOLUNTEER's coordinates are never stored anywhere -- see `attendance`.
  --
  -- All three are absent from the grant lists at the foot of this file:
  -- written only by /api/checkin on the service-role key, so a forged anchor
  -- cannot be PATCHed in to make a remote check-in look "confirmed".
  venue_latitude double precision,
  venue_longitude double precision,
  -- What makes a bad anchor harmless: an anchor is honoured only on the
  -- event's OWN day (isVenueAnchorUsable in lib/attendance.ts). An organiser
  -- who opens the QR screen at home the night before does not poison the
  -- event -- the stale anchor is discarded, every scan resolves to
  -- 'unavailable', and everyone is still PRESENT. The failure mode is losing
  -- a verification signal, never inventing a contradiction.
  venue_anchored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slots_filled_le_total check (slots_filled <= slots_total)
);

-- Migration for installs where outreaches already existed.
-- (supabase/migrations/20260805_attendance_and_reviews.sql)
alter table outreaches add column if not exists venue_latitude double precision;
alter table outreaches add column if not exists venue_longitude double precision;
alter table outreaches add column if not exists venue_anchored_at timestamptz;

-- NOTE: checkin_code was added here by 20260805 and REMOVED by
-- 20260807_checkin_code_isolation.sql. It must not come back: this table's
-- rows are readable by every authenticated user
-- (outreaches_select_open_or_own below), RLS cannot restrict columns, and so
-- a secret stored here was readable by any volunteer with a session -- which
-- would have let anyone check in without attending. The code now lives in
-- `outreach_checkin_codes`, one row per outreach, scoped to its owner. The
-- actual DROP is deliberately deferred to that section, AFTER the backfill
-- that reads this column -- dropping it here would silently reissue every
-- live code on a re-run.

drop trigger if exists trg_outreaches_updated_at on outreaches;
create trigger trg_outreaches_updated_at
  before update on outreaches
  for each row execute function set_updated_at();

create index if not exists idx_outreaches_status_region on outreaches (status, region);
create index if not exists idx_outreaches_organisation_id on outreaches (organisation_id);

alter table outreaches enable row level security;

drop policy if exists "outreaches_select_open_or_own" on outreaches;
create policy "outreaches_select_open_or_own"
  on outreaches for select
  to authenticated
  -- `or is_admin()` exists for the statistics screen: every question it asks
  -- is a count ACROSS the platform, and an admin owns nothing. Without it the
  -- counts would come back quietly wrong rather than failing, which is worse --
  -- nobody checks a number that looks plausible.
  using (status <> 'draft' or organisation_id = auth.uid() or is_admin());

drop policy if exists "outreaches_insert_own" on outreaches;
create policy "outreaches_insert_own"
  on outreaches for insert
  to authenticated
  with check (organisation_id = auth.uid());

drop policy if exists "outreaches_update_own" on outreaches;
create policy "outreaches_update_own"
  on outreaches for update
  to authenticated
  using (organisation_id = auth.uid())
  with check (organisation_id = auth.uid());

drop policy if exists "outreaches_delete_own" on outreaches;
create policy "outreaches_delete_own"
  on outreaches for delete
  to authenticated
  using (organisation_id = auth.uid());

-- ============================================================
-- applications — volunteer <-> outreach
-- match_score is service-role write-only; see column privilege revoke at bottom of file.
-- ============================================================
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid not null references outreaches(id) on delete cascade,
  volunteer_id uuid not null references volunteer_profiles(id) on delete cascade,
  type application_type not null default 'full',
  status application_status not null default 'pending',
  match_score numeric check (match_score >= 0 and match_score <= 100),
  cancelled_at timestamptz,
  late_cancellation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outreach_id, volunteer_id)
);

-- Two free-text fields the Figma flows collect and the original 6-table
-- field list did not account for. Both are nullable and additive, so no
-- existing behaviour changes; migration-safe for installs already carrying
-- application rows.
--   motivation: the "short motivation" a volunteer writes on the Full
--     Application form for a clinical outreach. Without a column it would be
--     typed and discarded, and the reviewing org would never see the one
--     thing that distinguishes a full application from a quick join.
--   cancellation_reason: the withdrawal reason from the Figma "Withdrawal
--     Process" screen. Unlike cancelled_at/late_cancellation this is NOT
--     V-Score input, so it stays volunteer-writable.
alter table applications add column if not exists motivation text;
alter table applications add column if not exists cancellation_reason text;

drop trigger if exists trg_applications_updated_at on applications;
create trigger trg_applications_updated_at
  before update on applications
  for each row execute function set_updated_at();

create index if not exists idx_applications_volunteer_id on applications (volunteer_id);
create index if not exists idx_applications_outreach_id on applications (outreach_id);

alter table applications enable row level security;

drop policy if exists "applications_select_own_or_org" on applications;
create policy "applications_select_own_or_org"
  on applications for select
  to authenticated
  using (
    volunteer_id = auth.uid()
    -- Same reason as outreaches above: platform-wide counts.
    or is_admin()
    or exists (
      select 1 from outreaches o
      where o.id = applications.outreach_id
        and o.organisation_id = auth.uid()
    )
  );

-- Phase 2 eligibility rule, enforced server-side rather than only in the
-- application form: a volunteer may insert an application for themselves, to
-- an outreach that is actually open, and -- if that outreach is clinical --
-- only once their credentials are verified. Support-role (and unclassified)
-- outreaches never require verification, so Quick Join stays open to
-- everyone. The UI gates this too and explains what to do about it; this
-- policy is the backstop that makes the rule real rather than cosmetic.
drop policy if exists "applications_insert_own" on applications;
-- SUPERSEDED by 20260817_per_role_verification_gate.sql, which is the live
-- version. The gate now asks application_role_is_clinical() about the ROLE the
-- volunteer chose, not the outreach's summarised role_type -- that summary is
-- 'clinical' if ANY role is, so this version refused an unverified volunteer
-- who had picked the SUPPORT role of a mixed event, which is the exact failure
-- multi-role exists to remove.
create policy "applications_insert_own"
  on applications for insert
  to authenticated
  with check (
    volunteer_id = auth.uid()
    and exists (
      select 1 from outreaches o
      where o.id = applications.outreach_id
        and o.status = 'open'
    )
    and (
      not application_role_is_clinical(
        applications.outreach_id,
        applications.outreach_role_id
      )
      or exists (
        select 1 from volunteer_profiles vp
        where vp.id = auth.uid()
          and vp.verification_status = 'verified'
      )
    )
  );

-- Volunteers may only update their own row, and only to cancel it (status ->
-- 'cancelled'); they may never set status to accepted/rejected/waitlisted
-- themselves. Orgs may manage full status transitions on applications to
-- their own outreaches (pending/accepted/rejected/waitlisted).
drop policy if exists "applications_update_own_or_org" on applications;

-- Volunteers may set exactly two statuses on their own row: 'cancelled'
-- (withdraw) and 'pending' (re-apply to something they withdrew from --
-- applications has unique (outreach_id, volunteer_id), so re-applying
-- reactivates the existing row rather than inserting a second one; see
-- useCreateApplication). Re-applying is gated by the SAME eligibility test as
-- applications_insert_own, so it cannot be used to slip into a clinical
-- outreach unverified, or into a closed one. accepted/rejected/waitlisted
-- remain org-only.
-- See supabase/migrations/20260731_allow_reapply_after_withdrawal.sql for the
-- full rationale and one accepted limitation (a volunteer can also move their
-- own rejected application back to pending).
drop policy if exists "applications_update_own_cancel" on applications;
create policy "applications_update_own_cancel"
  on applications for update
  to authenticated
  using (volunteer_id = auth.uid())
  with check (
    volunteer_id = auth.uid()
    and (
      status = 'cancelled'
      -- PER-ROLE, not per-outreach. Replaced by
      -- 20260817_per_role_verification_gate.sql; this file still carried the
      -- old `o.role_type is distinct from 'clinical'` test until 2026-09-23, so
      -- re-running it reintroduced the exact bug that migration exists to fix:
      -- an unverified volunteer who withdrew from the SUPPORT role of a mixed
      -- clinical/support event could not re-apply, because the event as a whole
      -- summarises to 'clinical'.
      or (
        status = 'pending'
        and exists (
          select 1 from outreaches o
          where o.id = applications.outreach_id
            and o.status = 'open'
        )
        and (
          not application_role_is_clinical(
            applications.outreach_id,
            applications.outreach_role_id
          )
          or exists (
            select 1 from volunteer_profiles vp
            where vp.id = auth.uid()
              and vp.verification_status = 'verified'
          )
        )
      )
    )
  );

-- Trigger backstop for the policy above. A WITH CHECK only sees the NEW row,
-- so the policy cannot say "pending is allowed only if the row WAS cancelled"
-- -- which would otherwise let a volunteer move their own REJECTED application
-- back to pending and re-enter an org's queue. A BEFORE UPDATE trigger sees
-- OLD and NEW and can compare them. RLS still decides who may write what;
-- this only constrains the transition. Orgs are exempt: they legitimately move
-- an application rejected -> pending when reconsidering someone.
-- See supabase/migrations/20260731_block_rejected_to_pending.sql.
create or replace function public.enforce_volunteer_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.volunteer_id is distinct from auth.uid() then
    return new;
  end if;

  if exists (
    select 1 from public.outreaches o
    where o.id = new.outreach_id
      and o.organisation_id = auth.uid()
  ) then
    return new;
  end if;

  if new.status = 'pending' and old.status is distinct from 'cancelled' then
    raise exception
      'A volunteer may only return an application to pending after withdrawing it (was: %).',
      old.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_volunteer_status_transition() from public;

drop trigger if exists trg_applications_volunteer_status_transition on applications;
create trigger trg_applications_volunteer_status_transition
  before update of status on applications
  for each row
  when (old.status is distinct from new.status)
  execute function public.enforce_volunteer_status_transition();

drop policy if exists "applications_update_org_status" on applications;
create policy "applications_update_org_status"
  on applications for update
  to authenticated
  using (
    exists (
      select 1 from outreaches o
      where o.id = applications.outreach_id
        and o.organisation_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from outreaches o
      where o.id = applications.outreach_id
        and o.organisation_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- Cancellation stamping. cancelled_at and late_cancellation drive the
-- V-Score penalty (-8 late vs -2 on-time), so both are revoked from
-- `authenticated` at the bottom of this file -- a volunteer must not be able
-- to backdate a withdrawal or claim it was on time. They are therefore
-- stamped here instead, from a BEFORE trigger: column-level UPDATE
-- privileges are checked against the columns named in the statement's SET
-- clause, so a trigger may write columns the caller itself cannot, while the
-- applications_update_own_cancel policy still holds the caller to
-- status = 'cancelled'.
--
-- "Late" = within 24 hours of the event start. Ghana observes GMT (UTC+0)
-- year-round with no DST, so reading the naive date + start_time as UTC is
-- exact, not an approximation. An outreach with no start_time is treated as
-- starting at midnight, and a cancellation after the event has already
-- started is always late.
-- ------------------------------------------------------------
create or replace function stamp_application_cancellation()
returns trigger as $$
declare
  event_start timestamptz;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select (o.date + coalesce(o.start_time, '00:00'::time)) at time zone 'UTC'
      into event_start
    from outreaches o
    where o.id = new.outreach_id;

    new.cancelled_at := now();
    new.late_cancellation :=
      event_start is not null and now() >= event_start - interval '24 hours';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_applications_stamp_cancellation on applications;
create trigger trg_applications_stamp_cancellation
  before update of status on applications
  for each row execute function stamp_application_cancellation();

-- ------------------------------------------------------------
-- outreaches.slots_filled is DERIVED from accepted applications, never
-- written by a client. Recomputing it as a full count (rather than +1/-1)
-- makes it idempotent and immune to two orgs accepting concurrently: each
-- transaction re-counts, and the slots_filled_le_total check constraint
-- rejects the accept that would overfill the event, rolling back that
-- application update atomically with it.
--
-- security definer (with a pinned search_path) is required: a volunteer
-- cancelling their own accepted application must decrement the counter, but
-- outreaches_update_own only lets the owning organisation update that row.
-- ------------------------------------------------------------
create or replace function sync_outreach_slots_filled()
returns trigger as $$
declare
  target_outreach uuid;
begin
  -- NEW is unassigned on DELETE (and OLD on INSERT), so branch on TG_OP
  -- rather than coalescing the two — touching the unassigned record raises.
  if tg_op = 'DELETE' then
    target_outreach := old.outreach_id;
  else
    target_outreach := new.outreach_id;
  end if;

  update outreaches o
  set slots_filled = (
    select count(*)
    from applications a
    where a.outreach_id = target_outreach
      and a.status = 'accepted'
  )
  where o.id = target_outreach;

  -- AFTER trigger: the return value is ignored, but must still be a valid record.
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_applications_sync_slots_filled on applications;
create trigger trg_applications_sync_slots_filled
  after insert or delete or update of status on applications
  for each row execute function sync_outreach_slots_filled();

-- ============================================================
-- event_reviews — org's post-event review of a volunteer per outreach
-- ============================================================
create table if not exists event_reviews (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid not null references outreaches(id) on delete cascade,
  volunteer_id uuid not null references volunteer_profiles(id) on delete cascade,
  reviewed_by uuid not null references organisation_profiles(id) on delete cascade,
  attended boolean,
  reliability_score int check (reliability_score between 1 and 5),
  clinical_score int check (clinical_score between 1 and 5),
  -- Standardised tappable remarks, so an organiser can give real feedback
  -- without composing prose -- the same friction argument as exception-based
  -- attendance. Slugs only; constants/review-remarks.ts is the vocabulary and
  -- holds the display labels, so wording can change without a migration.
  remark_chips text[] not null default '{}',
  -- The free-text escape hatch. Always optional, never blocks submission.
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outreach_id, volunteer_id)
);

-- Migration for installs where event_reviews already existed.
-- (supabase/migrations/20260805_attendance_and_reviews.sql)
alter table event_reviews add column if not exists remark_chips text[] not null default '{}';

drop trigger if exists trg_event_reviews_updated_at on event_reviews;
create trigger trg_event_reviews_updated_at
  before update on event_reviews
  for each row execute function set_updated_at();

create index if not exists idx_event_reviews_outreach_id on event_reviews (outreach_id);
create index if not exists idx_event_reviews_volunteer_id on event_reviews (volunteer_id);
create index if not exists idx_event_reviews_reviewed_by on event_reviews (reviewed_by);

alter table event_reviews enable row level security;

drop policy if exists "event_reviews_select_org_or_volunteer" on event_reviews;
create policy "event_reviews_select_org_or_volunteer"
  on event_reviews for select
  to authenticated
  using (
    volunteer_id = auth.uid()
    -- `or is_admin()`: a review dispute cannot be judged without reading the
    -- review it is about.
    or is_admin()
    or exists (
      select 1 from outreaches o
      where o.id = event_reviews.outreach_id
        and o.organisation_id = auth.uid()
    )
  );

-- OWNING THE OUTREACH IS NOT ENOUGH (added 2026-09-23, see
-- 20260923_audit_fixes.sql). Until then this checked only that the caller owned
-- the outreach, and `public_volunteer_profiles` hands every signed-in user the
-- id of every volunteer on the platform -- so an organisation could file
-- `attended = false` against somebody who had never applied to it, and the
-- V-Score replay would count it. One such review takes a new volunteer from 70
-- to 49.
drop policy if exists "event_reviews_insert_org" on event_reviews;
create policy "event_reviews_insert_org"
  on event_reviews for insert
  to authenticated
  with check (
    reviewed_by = auth.uid()
    and exists (
      select 1 from outreaches o
      where o.id = event_reviews.outreach_id
        and o.organisation_id = auth.uid()
    )
    and exists (
      select 1 from applications a
      where a.outreach_id = event_reviews.outreach_id
        and a.volunteer_id = event_reviews.volunteer_id
        and a.status = 'accepted'
    )
  );

drop policy if exists "event_reviews_update_org" on event_reviews;
create policy "event_reviews_update_org"
  on event_reviews for update
  to authenticated
  using (
    exists (
      select 1 from outreaches o
      where o.id = event_reviews.outreach_id
        and o.organisation_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from outreaches o
      where o.id = event_reviews.outreach_id
        and o.organisation_id = auth.uid()
    )
  );

-- ============================================================
-- outreach_checkin_codes — the secret inside each check-in QR.
-- (supabase/migrations/20260807_checkin_code_isolation.sql)
--
-- A separate table rather than a column on `outreaches`, and the reason is the
-- standing one at the foot of this file: RLS scopes ROWS, never COLUMNS.
-- outreaches_select_open_or_own makes every non-draft outreach row readable by
-- every authenticated user, so a secret stored there was readable by any
-- volunteer with a session -- who could then pass /api/checkin's code check
-- from home and be recorded present. Storing it here turns a column-privilege
-- problem into a row problem, which one policy settles.
--
-- The code is never rotated: reissuing it would invalidate a QR an organiser
-- may be displaying at a live event.
-- ============================================================
create table if not exists outreach_checkin_codes (
  outreach_id uuid primary key references outreaches(id) on delete cascade,
  code uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Issues a code with every new outreach (a column default did this before).
-- SECURITY DEFINER because the trigger fires as the inserting organisation,
-- which deliberately has no insert privilege or policy here.
create or replace function issue_outreach_checkin_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into outreach_checkin_codes (outreach_id)
  values (new.id)
  on conflict (outreach_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_outreaches_issue_checkin_code on outreaches;
create trigger trg_outreaches_issue_checkin_code
  after insert on outreaches
  for each row execute function issue_outreach_checkin_code();

-- Backfill for existing installs. Any code already issued under the old
-- arrangement is carried across FIRST, so an outreach whose QR has been
-- displayed keeps working; only then does every remaining outreach get a
-- fresh one.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'outreaches'
      and column_name = 'checkin_code'
  ) then
    insert into outreach_checkin_codes (outreach_id, code)
    select id, checkin_code from outreaches where checkin_code is not null
    on conflict (outreach_id) do nothing;
  end if;
end $$;

insert into outreach_checkin_codes (outreach_id)
select id from outreaches
on conflict (outreach_id) do nothing;

-- Only now is the exposed column safe to remove. See the note in the
-- outreaches section above.
alter table outreaches drop column if exists checkin_code;

alter table outreach_checkin_codes enable row level security;

-- The owning organisation, and nobody else. A volunteer gets zero rows, not a
-- filtered column.
drop policy if exists "outreach_checkin_codes_select_owner" on outreach_checkin_codes;
create policy "outreach_checkin_codes_select_owner"
  on outreach_checkin_codes for select
  to authenticated
  using (
    exists (
      select 1 from outreaches o
      where o.id = outreach_checkin_codes.outreach_id
        and o.organisation_id = auth.uid()
    )
  );

-- Written only by the trigger above and the service role in /api/checkin.
revoke insert, update, delete on outreach_checkin_codes from authenticated;

-- ============================================================
-- attendance — who actually turned up.
-- (supabase/migrations/20260805_attendance_and_reviews.sql)
--
-- One row per (outreach, volunteer), created by /api/checkin when a volunteer
-- scans, or when the organiser resolves someone who never did.
--
-- PRIVACY, load-bearing: this table stores the VERDICT of the location check
-- and nothing else. There is deliberately no latitude, no longitude, no
-- accuracy, no timestamped position -- not "we don't query them", but "they do
-- not exist here". The volunteer's coordinates are read once, in memory, at
-- the moment they choose to scan, compared against the venue anchor, and
-- discarded. There is no movement record to leak, subpoena, or accidentally
-- join against, and the guarantee comes from the shape of the table rather
-- than from anyone's discipline.
--
-- Do not add coordinate columns here. If a future feature needs them, that is
-- a decision to re-take explicitly, not a column to slip in.
-- ============================================================
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid not null references outreaches(id) on delete cascade,
  volunteer_id uuid not null references volunteer_profiles(id) on delete cascade,

  -- Null means they never scanned, which is what puts them on the organiser's
  -- "needs action" list.
  checked_in_at timestamptz,
  check_in_method text check (check_in_method in ('qr_scan', 'organiser')),

  -- The silent location check's verdict at scan time:
  --   not_checked -- no scan happened (organiser-entered row)
  --   confirmed   -- scan agreed with the venue anchor
  --   unavailable -- location denied, unavailable, too imprecise, or the
  --                  organiser never anchored the venue. COUNTS AS PRESENT:
  --                  uneven phone and data access is a fact of the target
  --                  context, and an honest volunteer must never be penalised
  --                  for a device limitation or poor signal.
  --   mismatch    -- scan clearly contradicted the venue. The only value that
  --                  escalates; it exists to close the shared-code hole (a
  --                  photo of the QR sent to someone at home).
  location_check text not null default 'not_checked'
    check (location_check in ('not_checked', 'confirmed', 'unavailable', 'mismatch')),

  -- The organiser's final word. NULL = unresolved. The organisation ALWAYS has
  -- the final override on anyone, present or absent: no automated signal ever
  -- overrules a human who was physically at the event.
  organiser_status text check (organiser_status in ('present', 'absent')),
  organiser_note text,
  resolved_by uuid references organisation_profiles(id) on delete set null,
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outreach_id, volunteer_id)
);

drop trigger if exists trg_attendance_updated_at on attendance;
create trigger trg_attendance_updated_at
  before update on attendance
  for each row execute function set_updated_at();

create index if not exists idx_attendance_outreach_id on attendance (outreach_id);
create index if not exists idx_attendance_volunteer_id on attendance (volunteer_id);

-- The effective answer to "did they attend?", in one place so no screen
-- re-derives it and drifts. Mirrored by isPresent() in lib/attendance.ts.
--
-- DEFAULT PRESENT. An unresolved row with no scan still reads as present,
-- because the organiser only actively flags real no-shows -- effort scales
-- with the number of ABSENCES, not the number of volunteers, so a
-- well-attended 20-person event needs no review work at all. Absence is only
-- ever an explicit human judgement, never an inference from silence (which
-- would turn a flat phone into a -15 penalty).
create or replace function attendance_is_present(a attendance)
returns boolean
language sql
immutable
as $$
  select case
    when a.organiser_status is not null then a.organiser_status = 'present'
    else true
  end;
$$;

alter table attendance enable row level security;

-- A volunteer sees their own attendance; the owning organisation sees every
-- row for its own outreaches.
drop policy if exists "attendance_select_own_or_org" on attendance;
create policy "attendance_select_own_or_org"
  on attendance for select
  to authenticated
  using (
    volunteer_id = auth.uid()
    -- `or is_admin()`: an attendance dispute is judged on this record -- did
    -- they scan, and what did the silent location check return -- and an admin
    -- is neither the volunteer nor the organisation.
    or is_admin()
    or exists (
      select 1 from outreaches o
      where o.id = attendance.outreach_id
        and o.organisation_id = auth.uid()
    )
  );

-- No insert/update/delete policy for `authenticated`, deliberately. EVERY
-- write goes through /api/checkin on the service-role key, for two reasons
-- that cannot be enforced client-side:
--   1. A check-in must be verified against outreach_checkin_codes.code, which
--      the volunteer must not be able to read. Were the client to write this
--      table directly, marking yourself present at an event you never attended
--      would be a single PATCH.
--   2. This table is the evidence a V-Score is later derived from, so the
--      record must be unforgeable by either party -- a volunteer marking
--      itself present, or anyone marking a rival absent.
-- Service role bypasses RLS, so it needs no policy here. The privileges are
-- revoked too -- see the write-protection block at the foot of this file.
--
-- NOTE (owner decision, 2026-08-07): setting organiser_status = 'absent' here
-- applies NO V-Score penalty. Absence moves a score only when the
-- organisation files the post-event review (/api/vscore, attended = false),
-- so exactly one code path can change v_score and a single no-show cannot be
-- punished twice. The consequence is recorded in docs/REPORT_NOTES.md: an
-- organisation that never reviews leaves its no-shows unpenalised.

-- ============================================================
-- skill_match_cache — Gemini Layer 2 skill-equivalence cache.
-- Written/read ONLY by the serverless API via the service-role key
-- (RLS enabled, zero policies granted -> default-deny for anon/authenticated).
-- ============================================================
create table if not exists skill_match_cache (
  id uuid primary key default gen_random_uuid(),
  skill_a text not null,
  skill_b text not null,
  is_match boolean not null,
  created_at timestamptz not null default now(),
  unique (skill_a, skill_b)
);

alter table skill_match_cache enable row level security;
-- Intentionally no policies: only service_role (which bypasses RLS) may access this table.

-- ============================================================
-- push_tokens — Expo push tokens, one row per (user, device).
--
-- MIRRORS api/sql/push_tokens.sql, which is the api/ project's self-contained
-- copy (same arrangement as skill_match_cache above). Both are idempotent and
-- must stay identical -- edit one, edit the other.
--
-- One row per device rather than a single column on profiles: Expo issues a
-- token per app install, so one account on a phone and a tablet has two and
-- both should receive a push. The unique pair is what makes the API's
-- `.upsert(..., { onConflict: "user_id,expo_push_token" })` idempotent -- the
-- app re-registers on every launch, since Expo may rotate a token silently.
--
-- FK to profiles(id), not auth.users(id): PostgREST can only embed across a
-- declared FK, and /api/match reaches tokens from a volunteer_profiles scan.
-- profiles is the table both sides join to. This does NOT make
-- volunteer_profiles -> push_tokens a one-hop embed (they are siblings
-- pointing at profiles, not related to each other), which is why that query
-- nests push_tokens INSIDE its profiles embed -- see notifyCandidates in
-- api/src/app/api/match/route.ts.
--
-- Own-row RLS rather than the service-role-only posture skill_match_cache
-- uses: the mobile app registers and (at sign-out) deletes its OWN token, and
-- `with check (user_id = auth.uid())` is what stops a client registering its
-- token against someone else's id to mirror their notification stream.
-- No column-level GRANT block is needed here (unlike profiles/applications
-- etc. below): every column is either the client's own to write or DB-managed,
-- and forging created_at/updated_at achieves nothing.
--
-- The serverless routes read OTHER users' tokens (pushing an acceptance to a
-- promoted volunteer) on the service-role key, which bypasses RLS entirely.
-- That is expected, and is why no cross-user policy exists or should be added.
-- ============================================================
create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  expo_push_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

drop trigger if exists trg_push_tokens_updated_at on push_tokens;
create trigger trg_push_tokens_updated_at
  before update on push_tokens
  for each row execute function set_updated_at();

create index if not exists idx_push_tokens_user_id on push_tokens (user_id);

alter table push_tokens enable row level security;

drop policy if exists "push_tokens_select_own" on push_tokens;
create policy "push_tokens_select_own"
  on push_tokens for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_tokens_insert_own" on push_tokens;
create policy "push_tokens_insert_own"
  on push_tokens for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_own" on push_tokens;
create policy "push_tokens_update_own"
  on push_tokens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_delete_own" on push_tokens;
create policy "push_tokens_delete_own"
  on push_tokens for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- notifications — the in-app notification feed (design-refs/Notifications.png).
--
-- An Expo push is fire-and-forget; once the OS banner is dismissed it is gone.
-- The screen needs day-grouped history and a per-row read state, so every
-- server dispatch site also writes a row here and the screen reads THIS table
-- rather than the OS notification tray.
--
-- No insert policy, deliberately: rows are written only by the serverless API
-- on the service-role key. A user able to insert could fabricate a "Documents
-- Verified" or "accepted" entry for themselves, and this screen is precisely
-- where someone goes to confirm such a claim.
--
-- Update is narrowed to read_at by the COLUMN GRANT below, not by the policy:
-- RLS restricts rows, never columns, so without it "mark as read" would also
-- permit rewriting title/body/type on one's own notifications -- reintroducing
-- the forgery the missing insert policy exists to prevent.
--
-- No delete policy: the design offers mark-all-read, not deletion.
-- ============================================================
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('new_match', 'application_status', 'event_reminder', 'test')),
  title text not null,
  body text not null,
  outreach_id uuid references outreaches(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on notifications (user_id, created_at desc);

alter table notifications enable row level security;

drop policy if exists "notifications_select_own" on notifications;
create policy "notifications_select_own"
  on notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own"
  on notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke update on notifications from authenticated;
grant update (read_at) on notifications to authenticated;

-- ============================================================
-- admin_actions — the audit trail behind every admin decision.
--
-- Built with the admin role itself, not after the features it records: an
-- admin write shipped before the row that records it is a decision with no
-- evidence behind it, and history cannot be backfilled.
--
-- Written ONLY by the serverless API on the service-role key — the same
-- posture as v_score and verification_status. Readable by admins.
--
-- actor_id is nullable and `on delete set null` on purpose: an audit row must
-- outlive the account that wrote it, and cascading would let deleting an admin
-- erase the record of everything they decided. actor_email is a snapshot taken
-- at write time so a row whose actor is gone still names a person.
--
-- target_type is a CHECK rather than an enum, deliberately: later admin
-- packages add target kinds, and extending a check constraint is a plain
-- drop-and-add inside one transaction, whereas a new enum value cannot be used
-- in the transaction that adds it (which is why the admin migration ships as
-- two separate pastes). `action` is free text: every package adds verbs, they
-- are read by humans rather than branched on, and a constraint listing them
-- would need editing on every package for no protection. `reason` may be null
-- (viewing a document is not a decision) but never blank -- a reason that is
-- one space looks answered and is not.
-- ============================================================
create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  actor_email text,
  target_type text not null check (target_type in (
    'volunteer',
    'organisation',
    'outreach',
    'application',
    'event_review',
    'dispute',
    'document',
    'vetted_source',
    'policy',
    'score_event'
  )),
  target_id uuid,
  action text not null check (length(btrim(action)) > 0),
  reason text check (reason is null or length(btrim(reason)) > 0),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- The audit feed: newest first, whole table.
create index if not exists idx_admin_actions_created
  on admin_actions (created_at desc);

-- "Everything ever done to this organisation / this volunteer" -- the history
-- strip the verification, moderation and dispute screens all need.
create index if not exists idx_admin_actions_target
  on admin_actions (target_type, target_id, created_at desc);

alter table admin_actions enable row level security;

-- Readable by admins and nobody else. There is deliberately NO insert, update
-- or delete policy: the service role bypasses RLS, so the only writer is the
-- API, and a client write is refused twice over (no policy, and the revoke).
drop policy if exists "admin_actions_select_admin" on admin_actions;
create policy "admin_actions_select_admin"
  on admin_actions for select
  to authenticated
  using (is_admin());

revoke insert, update, delete on admin_actions from authenticated;
revoke all on admin_actions from anon;

-- Append-only, enforced against the API too. RLS and grants stop clients; they
-- do not stop the service role, which bypasses both and is precisely what
-- writes here. An audit trail the API can quietly rewrite is not evidence, so
-- the refusal is a trigger, which applies to every role. A correction is a NEW
-- row saying what was corrected.
--
-- postgres/supabase_admin are exempt for one honest reason: anyone holding
-- that role can drop this trigger in a second statement anyway, so refusing
-- them would buy no safety and would cost a drop-and-recreate every time test
-- rows are cleared.
create or replace function refuse_admin_actions_rewrite()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  raise exception 'admin_actions is append-only; % is not permitted. Record a correcting row instead.', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists trg_admin_actions_append_only on admin_actions;
create trigger trg_admin_actions_append_only
  before update or delete on admin_actions
  for each row execute function refuse_admin_actions_rewrite();

-- ============================================================
-- organisation_registrations — the numbers an organisation quotes.
--
-- MANY per organisation, not four columns: the brief names four example
-- schemes and says the form must accept others, so fixed columns would mean a
-- migration every time a new scheme appears. No uniqueness across
-- organisations -- two branches of one NGO can legitimately quote the same
-- parent registration, and rejecting the honest case to catch a dishonest one
-- an admin will see anyway is the wrong trade.
-- ============================================================
create table if not exists organisation_registrations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation_profiles(id) on delete cascade,
  label text not null check (length(btrim(label)) > 0),
  number text not null check (length(btrim(number)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_organisation_registrations_org
  on organisation_registrations (organisation_id);

alter table organisation_registrations enable row level security;

-- The organisation sees its own; an admin sees all; nobody else. A
-- registration number is not a public fact -- volunteers judge legitimacy by
-- the verified badge, not by reading numbers they cannot check.
drop policy if exists "organisation_registrations_select" on organisation_registrations;
create policy "organisation_registrations_select"
  on organisation_registrations for select
  to authenticated
  using (organisation_id = auth.uid() or is_admin());

revoke insert, update, delete on organisation_registrations from authenticated;
revoke all on organisation_registrations from anon;

-- ============================================================
-- organisation_documents — private, exactly like credentials.
--
-- Stores the Cloudinary PUBLIC_ID and never a URL, for the reason package B
-- established: a stored URL is a permanent fetchable address, and that is the
-- thing that leaks. Read through /api/document-url.
-- ============================================================
create table if not exists organisation_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation_profiles(id) on delete cascade,
  document_id text not null check (length(btrim(document_id)) > 0),
  label text,
  created_at timestamptz not null default now(),
  unique (organisation_id, document_id)
);

create index if not exists idx_organisation_documents_org
  on organisation_documents (organisation_id, created_at);

alter table organisation_documents enable row level security;

drop policy if exists "organisation_documents_select" on organisation_documents;
create policy "organisation_documents_select"
  on organisation_documents for select
  to authenticated
  using (organisation_id = auth.uid() or is_admin());

revoke insert, update, delete on organisation_documents from authenticated;
revoke all on organisation_documents from anon;

-- ============================================================
-- Only a VERIFIED organisation may put an event in front of volunteers.
--
-- Enforced at the database, not with a disabled button -- the same standard
-- the clinical gate is held to. A disabled button is a suggestion.
--
-- DRAFTS ARE STILL ALLOWED. Nothing about a draft is visible to anyone else,
-- and refusing them outright would mean an organisation waiting on review
-- cannot prepare anything, which serves nobody.
--
-- `suspended` and `banned` fall out of this for free, since neither equals
-- 'verified'.
-- ============================================================
create or replace function refuse_outreach_from_unverified_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state org_verification_state;
  v_moderation moderation_state;
begin
  -- TAKING AN EVENT DOWN IS ALWAYS ALLOWED, and this exemption comes before
  -- every other test (added 2026-09-23). Without it a suspended organisation's
  -- outreaches could not be cancelled -- including by the service role, because
  -- a trigger fires for every role -- so /api/moderation cancelled nothing while
  -- still emailing everyone that their event was off.
  if tg_op = 'UPDATE'
     and new.status = 'cancelled'
     and old.status is distinct from 'cancelled' then
    return new;
  end if;

  -- Moderation next, and it allows no draft exception: an organisation
  -- awaiting verification is preparing to operate, while a suspended one has
  -- been told to stop.
  select moderation_state into v_moderation from profiles where id = new.organisation_id;
  if v_moderation is distinct from 'active' then
    raise exception
      'This organisation is suspended and cannot create or publish outreaches.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'draft' then
    return new;
  end if;

  select verification_state into v_state
    from organisation_profiles
   where id = new.organisation_id;

  if v_state is distinct from 'verified' then
    raise exception
      'This organisation is not verified, so it cannot publish outreaches yet. Submit verification from Settings.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_outreaches_require_verified_org on outreaches;
create trigger trg_outreaches_require_verified_org
  before insert or update on outreaches
  for each row execute function refuse_outreach_from_unverified_org();

-- ============================================================
-- A suspended or banned VOLUNTEER cannot apply.
--
-- Their EXISTING applications are withdrawn by /api/moderation, which also
-- hands the freed places to the waitlist. This trigger stops NEW ones, which
-- an endpoint cannot do because it does not run when a volunteer applies.
--
-- Deliberately only on INSERT. An UPDATE by a suspended volunteer is them
-- CANCELLING something, and a suspended person must always be able to withdraw
-- -- refusing that would trap them in commitments they have been barred from
-- honouring.
-- ============================================================
create or replace function refuse_application_from_suspended_volunteer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moderation moderation_state;
begin
  select moderation_state into v_moderation from profiles where id = new.volunteer_id;

  if v_moderation is distinct from 'active' then
    raise exception 'This account is suspended and cannot apply to outreaches.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_applications_refuse_suspended on applications;
create trigger trg_applications_refuse_suspended
  before insert on applications
  for each row execute function refuse_application_from_suspended_volunteer();

-- ============================================================
-- disputes -- a volunteer's challenge to a record about them.
--
-- TWO THINGS CAN BE DISPUTED, and only two, because they are the two that cost
-- a volunteer something they cannot otherwise get back: being marked absent
-- when they say they were there, and a review they believe is unfair.
--
-- THE V-SCORE IS NOT TOUCHED BY ANY OF THIS. Upholding a dispute records the
-- correction and tells both parties; it does not recompute a score. Making the
-- V-Score derivable and replayable is a separate change to something already
-- built and tested, and it is its own approval gate.
-- ============================================================
do $$ begin
  create type dispute_type as enum ('attendance', 'review');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispute_status as enum ('open', 'upheld', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;

create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references profiles(id) on delete cascade,
  outreach_id uuid not null references outreaches(id) on delete cascade,
  type dispute_type not null,
  -- Attendance is per DAY, so "I was marked absent" has to name which one or
  -- an admin cannot look up the evidence. Null for a review dispute.
  outreach_day_id uuid references outreach_days(id) on delete set null,
  statement text not null check (length(btrim(statement)) > 0),
  status dispute_status not null default 'open',
  resolution text,
  -- Nullable on purpose: the dispute outlives the admin who decided it, the
  -- same rule as admin_actions.
  resolved_by uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- One OPEN dispute of each kind per event. Attendance and the review of the
-- same outreach are different complaints and may both be open; re-filing the
-- same one is noise. A partial index rather than a constraint, so a resolved
-- dispute never blocks a later, genuinely new one.
create unique index if not exists disputes_one_open_per_kind
  on disputes (volunteer_id, outreach_id, type)
  where status = 'open';

create index if not exists idx_disputes_open on disputes (status, created_at);

alter table disputes enable row level security;

drop policy if exists "disputes_select_parties" on disputes;
create policy "disputes_select_parties"
  on disputes for select
  to authenticated
  using (
    volunteer_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from outreaches o
      where o.id = disputes.outreach_id and o.organisation_id = auth.uid()
    )
  );

drop policy if exists "disputes_insert_own" on disputes;
create policy "disputes_insert_own"
  on disputes for insert
  to authenticated
  with check (volunteer_id = auth.uid());

drop policy if exists "disputes_update_own" on disputes;
create policy "disputes_update_own"
  on disputes for update
  to authenticated
  using (volunteer_id = auth.uid() and status = 'open')
  with check (volunteer_id = auth.uid());

revoke insert, update, delete on disputes from authenticated;
grant insert (
  volunteer_id,
  outreach_id,
  type,
  outreach_day_id,
  statement
) on disputes to authenticated;
-- ONLY the statement. `status` is absent: a client able to write it could mark
-- its own dispute upheld. The consequence, stated rather than left as a
-- surprise -- a volunteer cannot WITHDRAW a dispute from the app; they can
-- edit the statement, and an admin can reject one they no longer want pursued.
grant update (statement) on disputes to authenticated;

-- ============================================================
-- Public discovery views.
--
-- This is the FOLLOW-UP promised on profiles_select_authenticated: the
-- "Volunteer Public Profile" and "Organization Public Profile" screens need
-- pre-application browsing, but profiles/volunteer_profiles are row-scoped to
-- the two parties of an application precisely so phone/email are not readable
-- by unrelated authenticated users. Loosening those policies back to
-- using (true) would expose that PII, so the access is widened here instead,
-- through views whose SELECT list is the whitelist.
--
-- security_invoker = false is deliberate (and is why the column list matters):
-- the view runs with its owner's rights, so it sees past the underlying row
-- policies and returns the non-sensitive columns for any volunteer/org. NOTE
-- FOR ANY FUTURE EDIT: phone and email must never be added to either select
-- list, and the views must never be granted to `anon` -- discovery is for
-- signed-in users only.
--
-- drop + create rather than create or replace: replace cannot change a view's
-- column list, which would make this file no longer safe to re-run after a
-- column is added or removed here.
-- ============================================================
drop view if exists public_volunteer_profiles;
create view public_volunteer_profiles
with (security_invoker = false) as
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.region,
    p.district,
    p.created_at,
    vp.category,
    vp.skill_tags,
    vp.specialties,
    vp.experience_level,
    vp.availability_slots,
    vp.bio,
    vp.v_score,
    vp.events_attended,
    vp.verification_status
  from profiles p
  join volunteer_profiles vp on vp.id = p.id
  -- `closed_at is null` added by 20260908_account_closure.sql and missing here
  -- until 2026-09-23. THIS CLAUSE IS THE ONLY THING HIDING A CLOSED ACCOUNT:
  -- the view is `security_invoker = false`, so it runs with its owner's rights
  -- and bypasses RLS entirely. Re-running an older copy of this file would have
  -- republished every closed volunteer's name, avatar, bio, skills and V-Score
  -- to every signed-in user, contradicting the privacy policy that account
  -- closure was written to make true.
  where p.role = 'volunteer'
    and p.closed_at is null;

revoke all on public_volunteer_profiles from anon;
grant select on public_volunteer_profiles to authenticated;

drop view if exists public_organisation_profiles;
create view public_organisation_profiles
with (security_invoker = false) as
  select
    p.id,
    p.avatar_url,
    p.region,
    p.district,
    p.created_at,
    op.org_name,
    op.org_type,
    op.description,
    op.website,
    op.verified,
    -- Safe to publish here, unlike profiles.phone/email: these are the org's
    -- own advertised enquiry details, not a person's private contact info.
    -- The prohibition above still stands for p.phone and p.email.
    op.contact_email,
    op.contact_phone,
    -- Whether this organisation's profile shows a gallery from its past
    -- events. Default true; see 20260817_outreach_gallery.sql.
    op.show_gallery
  from profiles p
  join organisation_profiles op on op.id = p.id
  -- Same clause, same reason, same omission as the volunteer view above.
  where p.role = 'organisation'
    and p.closed_at is null;

revoke all on public_organisation_profiles from anon;
grant select on public_organisation_profiles to authenticated;

-- ============================================================
-- organisation_private_profiles — the verification evidence, for the
-- organisation itself and for admins. (supabase/migrations/20260923_audit_fixes.sql)
--
-- `security_invoker = false`, so it runs with its owner's rights and the column
-- grants below do not apply to it; its WHERE clause is the whole access rule,
-- the same arrangement public_volunteer_profiles uses.
-- ============================================================
drop view if exists organisation_private_profiles;
create view organisation_private_profiles
with (security_invoker = false) as
  select op.*
    from organisation_profiles op
   where op.id = auth.uid()
      or is_admin();

revoke all on organisation_private_profiles from anon;
grant select on organisation_private_profiles to authenticated;

-- ============================================================
-- volunteer_review_summary — what an ORGANISATION sees about a volunteer.
-- (supabase/migrations/20260805_attendance_and_reviews.sql)
--
-- An aggregate, never the individual reviews. This is a fairness decision, not
-- a convenience one: aggregation still gives an organisation a genuinely
-- informative picture at a glance, while ensuring a volunteer is judged on
-- their PATTERN of contribution rather than on one bad day or one grumpy
-- reviewer -- and it rewards consistency, which is what the system is actually
-- trying to measure. Individual reviews stay readable only by their author and
-- their subject, under event_reviews_select_org_or_volunteer.
--
-- security_invoker = FALSE, like the two discovery views above, and that is
-- load-bearing (fixed by 20260807_review_summary_aggregate_scope.sql). With
-- invoker rights the underlying row policies still applied, so an organisation
-- aggregated only the reviews IT had written -- a volunteer with twenty
-- reviews read as `reviews_count = 1`, and an average over one bad day looked
-- identical to an average over a career.
--
-- THE AGGREGATE IS THE PRIVACY BOUNDARY. Owner rights let this see every
-- review; what it returns is counts and averages, never a single review.
-- Individual rows stay row-scoped under event_reviews_select_org_or_volunteer,
-- readable only by their author and their subject.
--
-- No PII, and the standing rule on the discovery views applies here too --
-- never add a phone, an email, or a name to this select list. `notes` must
-- never be aggregated in either: free text is identifying by nature.
-- ============================================================
drop view if exists volunteer_review_summary;
create view volunteer_review_summary
with (security_invoker = false) as
  select
    vp.id as volunteer_id,
    vp.v_score,
    vp.events_attended,
    count(er.id) filter (where er.reliability_score is not null) as reviews_count,
    round(avg(er.reliability_score) filter (where er.reliability_score is not null), 2)
      as avg_reliability,
    round(avg(er.clinical_score) filter (where er.clinical_score is not null), 2)
      as avg_clinical,
    -- Chip slugs paired with how often they were received, most frequent
    -- first, e.g. [{"chip":"punctual","count":7}, ...]. Aggregated in the
    -- database so every screen shows the same ordering.
    coalesce(
      (
        select jsonb_agg(t order by t.count desc, t.chip asc)
        from (
          select chip, count(*) as count
          from event_reviews er2, unnest(er2.remark_chips) as chip
          where er2.volunteer_id = vp.id
          group by chip
        ) t
      ),
      '[]'::jsonb
    ) as remark_counts
  from volunteer_profiles vp
  left join event_reviews er on er.volunteer_id = vp.id
  group by vp.id, vp.v_score, vp.events_attended;

revoke all on volunteer_review_summary from anon;
grant select on volunteer_review_summary to authenticated;

-- ============================================================
-- Column-level write protection.
--
-- RLS row policies above decide WHICH rows a user may update; they cannot
-- restrict which columns within an allowed row. Several columns must stay
-- writable only by the serverless API's service-role key (which bypasses all
-- of this):
--   profiles.role                       -- set once at signup, immutable after:
--                                       -- it selects which branch of nearly
--                                       -- every policy in this file applies.
--                                       -- NOTE: this grant list only governs
--                                       -- UPDATE. The value chosen at INSERT
--                                       -- is barred from being 'admin' by
--                                       -- profiles_insert_own's with-check --
--                                       -- both halves are needed.
--   organisation_profiles.verified      -- trust badge; admin/service-role review only
--   volunteer_profiles.v_score          -- recomputed only by /api/vscore
--   volunteer_profiles.verification_status, events_attended
--   applications.match_score            -- written only by /api/match
--   applications.cancelled_at, late_cancellation
--                                       -- stamped by trg_applications_stamp_cancellation;
--                                       -- a volunteer must not be able to set
--                                       -- late_cancellation = false to dodge the
--                                       -- -8 penalty (vs -2 on time)
--   outreaches.slots_filled             -- derived by trg_applications_sync_slots_filled
--
-- IMPORTANT — this is expressed as "revoke the whole table, then grant back
-- the specific columns", NOT as `revoke update (col) ...`. Supabase's default
-- privileges grant `authenticated` a TABLE-level UPDATE on everything in
-- `public`, and in PostgreSQL a column-level REVOKE does not carve a hole in
-- a table-level grant -- the table grant keeps allowing every column and the
-- revoke is effectively a no-op. Written the other way round, every
-- protection listed above would have silently done nothing, and a volunteer
-- could have PATCHed their own v_score to 100.
--
-- Trigger writes are unaffected either way: column privileges are checked
-- against the columns named in the statement's SET clause, so the BEFORE
-- triggers may still write the columns revoked here.
--
-- Adding a column to one of these tables? Add it to the matching grant list
-- below or clients will not be able to write it.
--
-- `id` columns: grant update (id) appears on volunteer_profiles below despite
-- id never legitimately changing value. This is required because
-- @supabase/postgrest-js's `.upsert(payload, { onConflict: 'id' })` compiles
-- to `INSERT ... ON CONFLICT (id) DO UPDATE SET id = excluded.id, <other
-- payload columns> = excluded.<col>` -- PostgREST's generated SET clause
-- includes every column present in the payload, including the conflict
-- target itself (it must be present in the payload to name the conflict
-- target in the first place). Any table a client upserts on its PK therefore
-- needs `update (id)` granted, or the whole statement is rejected with
-- 42501 ("permission denied for table ..."), NOT an RLS violation --
-- useCompleteOnboarding.ts and useAuthGuard.ts's repairMissingVolunteerProfile
-- both upsert volunteer_profiles on `id` (self-healing a row dropped by a
-- non-transactional two-insert signup flow), which is what surfaced this.
-- Safe specifically because volunteer_profiles_update_own's `using (auth.uid()
-- = id)` / `with check (auth.uid() = id)` bind BOTH the targeted row and the
-- written row to the caller's own uid -- an upsert naming a different id is
-- rejected by `using` before it ever reaches the SET clause, so granting this
-- column can never let a caller touch (or repoint) a row that isn't theirs.
-- ============================================================

-- profiles: `role` is deliberately ABSENT from this grant list, which is what
-- makes it immutable after signup. It is set once on INSERT (the insert path
-- is unrestricted, which is what lets useSignUp/useAuthGuard create the row)
-- and must never change afterwards: role decides which tab group the app
-- routes to AND which branch of nearly every policy in this file applies, so
-- a self-service role flip was the first step of a privilege-escalation chain
-- (volunteer -> organisation -> self-verified organisation -> read applicant
-- PII, review volunteers, move real V-Scores). `id` is absent because
-- profiles is never upserted — only .insert() at signup and
-- .update({region, district}) at onboarding. created_at is DB-managed.
revoke update on profiles from authenticated;
grant update (
  full_name,
  phone,
  email,
  region,
  district,
  avatar_url
) on profiles to authenticated;

-- INSERT is column-listed too (added 20260909). It was NOT, for a long time,
-- and profiles was the only table in this file with that gap: every other one
-- does `revoke insert ... grant insert (columns)`. Supabase grants
-- `authenticated` a TABLE-LEVEL insert on everything in `public` by default,
-- and a table-level grant covers every column -- including server-only ones
-- added later, which is how `closed_at`, `moderation_state`,
-- `moderation_reason` and `moderated_at` all ended up silently insertable at
-- signup. The comment above them claiming they were protected by omission was
-- true of UPDATE and false of INSERT.
--
-- These four are EXACTLY what the client inserts, and the app has only two
-- insert paths (useSignUp and useAuthGuard's bootstrapProfileFromMetadata),
-- both writing the same four. SIGNUP DEPENDS ON THIS LIST: removing a column
-- from it breaks registration.
--
-- `role` stays because it is set once at signup; it is absent from the UPDATE
-- list, which is what makes it immutable afterwards, and
-- profiles_insert_own's with-check carries `and role <> 'admin'`.
revoke insert on profiles from authenticated;
grant insert (
  id,
  role,
  full_name,
  email
) on profiles to authenticated;

revoke insert, update, delete on profiles from anon;

-- organisation_profiles: `verified` is deliberately ABSENT — it is the trust
-- badge volunteers use to judge whether an outreach is legitimate, so it must
-- only ever be set by an admin/service-role review. The INSERT grant list
-- below already excluded it and its comment calls it out by name as a
-- "self-assigned trust badge"; the missing UPDATE block was an oversight that
-- left the same value freely settable one PATCH later.
-- `id` IS granted here (unlike profiles above) because
-- useAuthGuard.ts's repairMissingOrganisationProfile upserts this table on
-- `id` — see the upsert note in the header comment. Safe for the same reason
-- as volunteer_profiles: organisation_profiles_update_own binds both the
-- targeted and the written row to auth.uid() = id.
revoke update on organisation_profiles from authenticated;
grant update (
  id,
  org_name,
  org_type,
  description,
  website,
  contact_email,
  contact_phone,
  -- Granted by 20260817_outreach_gallery.sql, missing here until 2026-09-23.
  -- Written by hooks/useProfileEditor.ts; without it the gallery opt-out fails.
  show_gallery
) on organisation_profiles to authenticated;

revoke update on volunteer_profiles from authenticated;
grant update (
  id,
  category,
  skill_tags,
  specialties,
  experience_level,
  availability_slots,
  bio,
  declaration_signed
) on volunteer_profiles to authenticated;

revoke update on applications from authenticated;
-- status: orgs set accepted/rejected/waitlisted, volunteers set cancelled --
-- which value each may write is constrained by the RLS policies above, not here.
-- cancellation_reason: free text, not V-Score input.
-- type + motivation: volunteer-authored (both already in the INSERT grant
-- list), needed so re-applying to a withdrawn outreach can rewrite them --
-- someone may withdraw a Quick Join and return with a Full Application.
-- match_score, cancelled_at and late_cancellation stay absent: service-role only.
grant update (status, cancellation_reason, type, motivation) on applications to authenticated;

-- venue_latitude, venue_longitude and venue_anchored_at are deliberately
-- ABSENT from both this list and the INSERT list below. /api/checkin writes
-- them on the service-role key when the organiser taps "I'm at the venue", so
-- that a forged anchor cannot be PATCHed in to make a remote check-in resolve
-- as "confirmed". Do not "fix" a write failure on them by adding them here.
revoke update on outreaches from authenticated;
grant update (
  title,
  description,
  date,
  start_time,
  end_time,
  region,
  district,
  location_name,
  required_skills,
  required_category,
  role_type,
  slots_total,
  status,
  flyer_url,
  location_image_url,
  location_lat,
  location_lng
) on outreaches to authenticated;

-- ============================================================
-- Column-level write protection — INSERT.
--
-- Everything the UPDATE block above says applies identically to INSERT, and
-- for exactly the same reason: Supabase's default privileges grant
-- `authenticated` a TABLE-level INSERT on everything in `public`, and RLS
-- WITH CHECK clauses only validate row OWNERSHIP/eligibility, never which
-- columns the payload carries. Without this block a client could set the
-- server-only columns on the very first insert — the moment a row is created,
-- before any UPDATE is ever attempted — which the UPDATE protection can't
-- catch. Concretely, this is what would otherwise be possible with just the
-- shipped anon key + a real session JWT (curl/PostgREST, bypassing the app):
--   * applications: insert status = 'accepted' (self-accept, skipping org
--     review) or match_score = 100 (forge the Phase 3 ranking). Omitting
--     `status` also forces the default 'pending', which is what makes
--     trg_applications_stamp_cancellation reachable: a row can no longer be
--     born 'cancelled' and skip the late/on-time penalty stamping.
--   * volunteer_profiles: insert verification_status = 'verified' (defeating
--     the clinical-outreach eligibility gate the insert policy itself reads),
--     v_score = 100, or events_attended = 999.
--   * organisation_profiles: insert verified = true (self-assigned trust badge).
--   * outreaches: insert a bogus slots_filled (corrupts dashboard counts until
--     the next accept/cancel re-derives it via trigger).
--
-- Same mechanism as UPDATE: revoke the whole-table privilege, then grant back
-- only the columns a client legitimately supplies. Every omitted column has a
-- DB default or is nullable, so inserts that don't mention it still succeed
-- (signup's `insert({ id })` relies on exactly this). Adding a column? Add it
-- to the matching grant list below or clients won't be able to insert it.
-- ============================================================

revoke insert on volunteer_profiles from authenticated;
grant insert (
  id,
  category,
  skill_tags,
  specialties,
  experience_level,
  availability_slots,
  bio,
  declaration_signed
) on volunteer_profiles to authenticated;

-- SELECT is column-listed too, which no other table here needs. See the note
-- on organisation_profiles_select_authenticated above: the ROWS are public and
-- the verification evidence is not. `verified` is here and `verification_state`
-- is not, deliberately -- the boolean is the badge every volunteer is meant to
-- see, while the state distinguishes rejected / suspended / banned /
-- documents_submitted, which is nobody's business but the org's and the admin's.
revoke select on organisation_profiles from authenticated;
grant select (
  id,
  org_name,
  org_type,
  description,
  website,
  contact_email,
  contact_phone,
  verified,
  show_gallery,
  created_at,
  updated_at
) on organisation_profiles to authenticated;

revoke insert on organisation_profiles from authenticated;
grant insert (
  id,
  org_name,
  org_type,
  description,
  website,
  contact_email,
  contact_phone,
  show_gallery
) on organisation_profiles to authenticated;

revoke insert on outreaches from authenticated;
grant insert (
  organisation_id,
  title,
  description,
  date,
  start_time,
  end_time,
  region,
  district,
  location_name,
  required_skills,
  required_category,
  role_type,
  slots_total,
  status,
  flyer_url,
  location_image_url,
  location_lat,
  location_lng
) on outreaches to authenticated;

-- status omitted deliberately: it must default to 'pending' so a client can
-- neither self-accept nor sidestep the cancellation-stamp trigger. match_score
-- omitted: written only by /api/match. motivation is the volunteer's own
-- Full-Application free text and stays insertable.
revoke insert on applications from authenticated;
grant insert (
  outreach_id,
  volunteer_id,
  type,
  motivation,
  -- Granted by 20260811_multi_role_outreaches.sql and missing here until
  -- 2026-09-23. `apply_to_outreach()` is SECURITY INVOKER and inserts this
  -- column, so without it every application to a MULTI-ROLE outreach fails with
  -- `permission denied for table applications` (SQLSTATE 42501).
  outreach_role_id
) on applications to authenticated;

-- attendance and outreach_checkin_codes: nothing is client-writable AT ALL, so
-- these are whole-table revokes with no grant-back list. Both tables also have
-- no insert/update/delete policy, which already denies the writes -- the
-- revokes are the belt to that braces, and they fail with a different, clearer
-- error (42501 "permission denied for table", rather than an RLS violation).
--
-- attendance: a check-in must be verified against outreach_checkin_codes.code,
-- which the volunteer cannot read, and the resulting record is the evidence a
-- V-Score is later derived from. Both belong in /api/checkin.
--
-- outreach_checkin_codes: issued by trg_outreaches_issue_checkin_code (a
-- SECURITY DEFINER trigger, which is why revoking here does not stop new
-- outreaches getting a code) and read by the service role. SELECT is NOT
-- revoked -- the owning organisation reads its own code through
-- outreach_checkin_codes_select_owner to render the QR.
revoke insert, update, delete on attendance from authenticated;
revoke insert, update, delete on outreach_checkin_codes from authenticated;


-- ============================================================
-- score_events — the flat V-Score deductions
-- (supabase/migrations/20260904_score_events.sql)
--
-- The V-Score is DERIVED: volunteer_profiles.v_score is a cache of a replay of
-- the volunteer's history. This table is the part of that history which
-- produces no event_reviews row -- cancellations, and late per-day releases.
--
-- `no_show` IS DELIBERATELY NOT A KIND. A no-show is already expressed by a
-- review filed with attended = false, which floors that event's outcome to 0.
-- Adding it here would punish one absence twice.
--
-- `points` is STORED rather than derived, unlike a review's outcome: a
-- penalty's number IS the decision, and the late-release figure depends on a
-- rolling 90-day count as it stood at the moment of the release, which cannot
-- honestly be reconstructed later.
--
-- Nothing is client-writable. A client that could insert here could penalise
-- anybody by name, and one that could update here could void its own penalties.
-- Reversal is `voided_at`, which leaves the record in place.
-- ============================================================

do $$ begin
  create type score_event_kind as enum (
    'late_cancellation',
    'on_time_cancellation',
    'late_release'
  );
exception when duplicate_object then null; end $$;

create table if not exists score_events (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references profiles(id) on delete cascade,
  kind score_event_kind not null,
  points numeric not null check (points < 0 and points >= -100),
  outreach_id uuid references outreaches(id) on delete set null,
  application_id uuid references applications(id) on delete set null,
  outreach_day_id uuid references outreach_days(id) on delete set null,
  reason text not null check (length(btrim(reason)) > 0),
  voided_at timestamptz,
  voided_reason text,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (volunteer_id, dedupe_key)
);

create index if not exists idx_score_events_replay
  on score_events (volunteer_id, created_at, id)
  where voided_at is null;

alter table score_events enable row level security;

drop policy if exists "score_events_select_own_or_admin" on score_events;
create policy "score_events_select_own_or_admin"
  on score_events for select
  to authenticated
  using (volunteer_id = auth.uid() or is_admin());

revoke insert, update, delete on score_events from authenticated;
revoke all on score_events from anon;
grant select on score_events to authenticated;


-- ============================================================
-- PART 2: the final form of everything the migrations changed (generated)
--
-- Everything below restates the live definition of an object Part 1 either
-- lacks or states in an older form. It runs last, so it wins.
-- ============================================================

-- Constraints
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'application_days_unique' and conrelid = 'application_days'::regclass) then
    alter table application_days add constraint application_days_unique UNIQUE (application_id, outreach_day_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'applications_outreach_id_volunteer_id_key' and conrelid = 'applications'::regclass) then
    alter table applications add constraint applications_outreach_id_volunteer_id_key UNIQUE (outreach_id, volunteer_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_unique_day' and conrelid = 'attendance'::regclass) then
    alter table attendance add constraint attendance_unique_day UNIQUE (outreach_id, volunteer_id, outreach_day_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_reviews_outreach_id_volunteer_id_key' and conrelid = 'event_reviews'::regclass) then
    alter table event_reviews add constraint event_reviews_outreach_id_volunteer_id_key UNIQUE (outreach_id, volunteer_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisation_documents_organisation_id_document_id_key' and conrelid = 'organisation_documents'::regclass) then
    alter table organisation_documents add constraint organisation_documents_organisation_id_document_id_key UNIQUE (organisation_id, document_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_days_unique' and conrelid = 'outreach_days'::regclass) then
    alter table outreach_days add constraint outreach_days_unique UNIQUE (outreach_id, day);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'score_events_volunteer_id_dedupe_key_key' and conrelid = 'score_events'::regclass) then
    alter table score_events add constraint score_events_volunteer_id_dedupe_key_key UNIQUE (volunteer_id, dedupe_key);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'skill_match_cache_skill_a_skill_b_key' and conrelid = 'skill_match_cache'::regclass) then
    alter table skill_match_cache add constraint skill_match_cache_skill_a_skill_b_key UNIQUE (skill_a, skill_b);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vetted_sources_url_key' and conrelid = 'vetted_sources'::regclass) then
    alter table vetted_sources add constraint vetted_sources_url_key UNIQUE (url);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admin_actions_action_check' and conrelid = 'admin_actions'::regclass) then
    alter table admin_actions add constraint admin_actions_action_check CHECK ((length(btrim(action)) > 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admin_actions_reason_check' and conrelid = 'admin_actions'::regclass) then
    alter table admin_actions add constraint admin_actions_reason_check CHECK (((reason IS NULL) OR (length(btrim(reason)) > 0)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admin_actions_target_type_check' and conrelid = 'admin_actions'::regclass) then
    alter table admin_actions add constraint admin_actions_target_type_check CHECK ((target_type = ANY (ARRAY['volunteer'::text, 'organisation'::text, 'outreach'::text, 'application'::text, 'event_review'::text, 'dispute'::text, 'document'::text, 'vetted_source'::text, 'policy'::text, 'score_event'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'applications_match_score_check' and conrelid = 'applications'::regclass) then
    alter table applications add constraint applications_match_score_check CHECK (((match_score >= (0)::numeric) AND (match_score <= (100)::numeric)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_check_in_method_check' and conrelid = 'attendance'::regclass) then
    alter table attendance add constraint attendance_check_in_method_check CHECK ((check_in_method = ANY (ARRAY['qr_scan'::text, 'organiser'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_location_check_check' and conrelid = 'attendance'::regclass) then
    alter table attendance add constraint attendance_location_check_check CHECK ((location_check = ANY (ARRAY['not_checked'::text, 'confirmed'::text, 'unavailable'::text, 'mismatch'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_organiser_status_check' and conrelid = 'attendance'::regclass) then
    alter table attendance add constraint attendance_organiser_status_check CHECK ((organiser_status = ANY (ARRAY['present'::text, 'absent'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'disputes_statement_check' and conrelid = 'disputes'::regclass) then
    alter table disputes add constraint disputes_statement_check CHECK ((length(btrim(statement)) > 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_reviews_clinical_score_check' and conrelid = 'event_reviews'::regclass) then
    alter table event_reviews add constraint event_reviews_clinical_score_check CHECK (((clinical_score >= 1) AND (clinical_score <= 5)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_reviews_reliability_score_check' and conrelid = 'event_reviews'::regclass) then
    alter table event_reviews add constraint event_reviews_reliability_score_check CHECK (((reliability_score >= 1) AND (reliability_score <= 5)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_type_check' and conrelid = 'notifications'::regclass) then
    alter table notifications add constraint notifications_type_check CHECK ((type = ANY (ARRAY['new_match'::text, 'application_status'::text, 'event_reminder'::text, 'test'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisation_documents_document_id_check' and conrelid = 'organisation_documents'::regclass) then
    alter table organisation_documents add constraint organisation_documents_document_id_check CHECK ((length(btrim(document_id)) > 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisation_registrations_label_check' and conrelid = 'organisation_registrations'::regclass) then
    alter table organisation_registrations add constraint organisation_registrations_label_check CHECK ((length(btrim(label)) > 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisation_registrations_number_check' and conrelid = 'organisation_registrations'::regclass) then
    alter table organisation_registrations add constraint organisation_registrations_number_check CHECK ((length(btrim(number)) > 0));
  end if;
end $$;

-- 20260925b widened this to allied_health. An older database has the
-- narrower constraint under the same name, so it is replaced when it lacks
-- the value rather than skipped because the name exists.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'outreach_roles_category_check' and conrelid = 'outreach_roles'::regclass
             and position('allied_health' in pg_get_constraintdef(oid)) = 0) then
    alter table outreach_roles drop constraint outreach_roles_category_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'outreach_roles_category_check' and conrelid = 'outreach_roles'::regclass) then
    alter table outreach_roles add constraint outreach_roles_category_check CHECK ((category = ANY (ARRAY['doctor'::text, 'nurse'::text, 'midwife'::text, 'pharmacist'::text, 'allied_health'::text, 'student'::text, 'first_aider'::text, 'other'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_roles_min_experience_level_check' and conrelid = 'outreach_roles'::regclass) then
    alter table outreach_roles add constraint outreach_roles_min_experience_level_check CHECK ((min_experience_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'experienced'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_roles_role_type_check' and conrelid = 'outreach_roles'::regclass) then
    alter table outreach_roles add constraint outreach_roles_role_type_check CHECK ((role_type = ANY (ARRAY['clinical'::text, 'support'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_roles_slots_filled_check' and conrelid = 'outreach_roles'::regclass) then
    alter table outreach_roles add constraint outreach_roles_slots_filled_check CHECK ((slots_filled >= 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_roles_slots_filled_le_total' and conrelid = 'outreach_roles'::regclass) then
    alter table outreach_roles add constraint outreach_roles_slots_filled_le_total CHECK ((slots_filled <= slots_total));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_roles_slots_total_check' and conrelid = 'outreach_roles'::regclass) then
    alter table outreach_roles add constraint outreach_roles_slots_total_check CHECK ((slots_total > 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreaches_slots_filled_check' and conrelid = 'outreaches'::regclass) then
    alter table outreaches add constraint outreaches_slots_filled_check CHECK ((slots_filled >= 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreaches_slots_total_check' and conrelid = 'outreaches'::regclass) then
    alter table outreaches add constraint outreaches_slots_total_check CHECK ((slots_total > 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'slots_filled_le_total' and conrelid = 'outreaches'::regclass) then
    alter table outreaches add constraint slots_filled_le_total CHECK ((slots_filled <= slots_total));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'score_events_points_check' and conrelid = 'score_events'::regclass) then
    alter table score_events add constraint score_events_points_check CHECK (((points < (0)::numeric) AND (points >= ('-100'::integer)::numeric)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'score_events_reason_check' and conrelid = 'score_events'::regclass) then
    alter table score_events add constraint score_events_reason_check CHECK ((length(btrim(reason)) > 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vetted_sources_name_check' and conrelid = 'vetted_sources'::regclass) then
    alter table vetted_sources add constraint vetted_sources_name_check CHECK ((length(btrim(name)) > 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vetted_sources_rationale_check' and conrelid = 'vetted_sources'::regclass) then
    alter table vetted_sources add constraint vetted_sources_rationale_check CHECK ((length(btrim(rationale)) > 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vetted_sources_url_check' and conrelid = 'vetted_sources'::regclass) then
    alter table vetted_sources add constraint vetted_sources_url_check CHECK ((length(btrim(url)) > 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'volunteer_profiles_v_score_check' and conrelid = 'volunteer_profiles'::regclass) then
    alter table volunteer_profiles add constraint volunteer_profiles_v_score_check CHECK (((v_score >= (0)::numeric) AND (v_score <= (100)::numeric)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admin_actions_actor_id_fkey' and conrelid = 'admin_actions'::regclass) then
    alter table admin_actions add constraint admin_actions_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'application_days_application_id_fkey' and conrelid = 'application_days'::regclass) then
    alter table application_days add constraint application_days_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'application_days_outreach_day_id_fkey' and conrelid = 'application_days'::regclass) then
    alter table application_days add constraint application_days_outreach_day_id_fkey FOREIGN KEY (outreach_day_id) REFERENCES outreach_days(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'applications_outreach_id_fkey' and conrelid = 'applications'::regclass) then
    alter table applications add constraint applications_outreach_id_fkey FOREIGN KEY (outreach_id) REFERENCES outreaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'applications_outreach_role_id_fkey' and conrelid = 'applications'::regclass) then
    alter table applications add constraint applications_outreach_role_id_fkey FOREIGN KEY (outreach_role_id) REFERENCES outreach_roles(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'applications_volunteer_id_fkey' and conrelid = 'applications'::regclass) then
    alter table applications add constraint applications_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES volunteer_profiles(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_outreach_day_id_fkey' and conrelid = 'attendance'::regclass) then
    alter table attendance add constraint attendance_outreach_day_id_fkey FOREIGN KEY (outreach_day_id) REFERENCES outreach_days(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_outreach_id_fkey' and conrelid = 'attendance'::regclass) then
    alter table attendance add constraint attendance_outreach_id_fkey FOREIGN KEY (outreach_id) REFERENCES outreaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_resolved_by_fkey' and conrelid = 'attendance'::regclass) then
    alter table attendance add constraint attendance_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES organisation_profiles(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_volunteer_id_fkey' and conrelid = 'attendance'::regclass) then
    alter table attendance add constraint attendance_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES volunteer_profiles(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'disputes_outreach_day_id_fkey' and conrelid = 'disputes'::regclass) then
    alter table disputes add constraint disputes_outreach_day_id_fkey FOREIGN KEY (outreach_day_id) REFERENCES outreach_days(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'disputes_outreach_id_fkey' and conrelid = 'disputes'::regclass) then
    alter table disputes add constraint disputes_outreach_id_fkey FOREIGN KEY (outreach_id) REFERENCES outreaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'disputes_resolved_by_fkey' and conrelid = 'disputes'::regclass) then
    alter table disputes add constraint disputes_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'disputes_volunteer_id_fkey' and conrelid = 'disputes'::regclass) then
    alter table disputes add constraint disputes_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES profiles(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_reviews_outreach_id_fkey' and conrelid = 'event_reviews'::regclass) then
    alter table event_reviews add constraint event_reviews_outreach_id_fkey FOREIGN KEY (outreach_id) REFERENCES outreaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_reviews_reviewed_by_fkey' and conrelid = 'event_reviews'::regclass) then
    alter table event_reviews add constraint event_reviews_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES organisation_profiles(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_reviews_volunteer_id_fkey' and conrelid = 'event_reviews'::regclass) then
    alter table event_reviews add constraint event_reviews_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES volunteer_profiles(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_outreach_id_fkey' and conrelid = 'notifications'::regclass) then
    alter table notifications add constraint notifications_outreach_id_fkey FOREIGN KEY (outreach_id) REFERENCES outreaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_user_id_fkey' and conrelid = 'notifications'::regclass) then
    alter table notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisation_documents_organisation_id_fkey' and conrelid = 'organisation_documents'::regclass) then
    alter table organisation_documents add constraint organisation_documents_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES organisation_profiles(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisation_profiles_id_fkey' and conrelid = 'organisation_profiles'::regclass) then
    alter table organisation_profiles add constraint organisation_profiles_id_fkey FOREIGN KEY (id) REFERENCES profiles(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisation_registrations_organisation_id_fkey' and conrelid = 'organisation_registrations'::regclass) then
    alter table organisation_registrations add constraint organisation_registrations_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES organisation_profiles(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_checkin_codes_outreach_id_fkey' and conrelid = 'outreach_checkin_codes'::regclass) then
    alter table outreach_checkin_codes add constraint outreach_checkin_codes_outreach_id_fkey FOREIGN KEY (outreach_id) REFERENCES outreaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_days_outreach_id_fkey' and conrelid = 'outreach_days'::regclass) then
    alter table outreach_days add constraint outreach_days_outreach_id_fkey FOREIGN KEY (outreach_id) REFERENCES outreaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_images_outreach_id_fkey' and conrelid = 'outreach_images'::regclass) then
    alter table outreach_images add constraint outreach_images_outreach_id_fkey FOREIGN KEY (outreach_id) REFERENCES outreaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_roles_outreach_id_fkey' and conrelid = 'outreach_roles'::regclass) then
    alter table outreach_roles add constraint outreach_roles_outreach_id_fkey FOREIGN KEY (outreach_id) REFERENCES outreaches(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreaches_organisation_id_fkey' and conrelid = 'outreaches'::regclass) then
    alter table outreaches add constraint outreaches_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES organisation_profiles(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey' and conrelid = 'profiles'::regclass) then
    alter table profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'score_events_application_id_fkey' and conrelid = 'score_events'::regclass) then
    alter table score_events add constraint score_events_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'score_events_outreach_day_id_fkey' and conrelid = 'score_events'::regclass) then
    alter table score_events add constraint score_events_outreach_day_id_fkey FOREIGN KEY (outreach_day_id) REFERENCES outreach_days(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'score_events_outreach_id_fkey' and conrelid = 'score_events'::regclass) then
    alter table score_events add constraint score_events_outreach_id_fkey FOREIGN KEY (outreach_id) REFERENCES outreaches(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'score_events_volunteer_id_fkey' and conrelid = 'score_events'::regclass) then
    alter table score_events add constraint score_events_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES profiles(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vetted_sources_added_by_fkey' and conrelid = 'vetted_sources'::regclass) then
    alter table vetted_sources add constraint vetted_sources_added_by_fkey FOREIGN KEY (added_by) REFERENCES profiles(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'volunteer_profiles_id_fkey' and conrelid = 'volunteer_profiles'::regclass) then
    alter table volunteer_profiles add constraint volunteer_profiles_id_fkey FOREIGN KEY (id) REFERENCES profiles(id) ON DELETE CASCADE;
  end if;
end $$;

-- Indexes
create index if not exists application_days_application_id_idx ON public.application_days USING btree (application_id);

create index if not exists application_days_live_idx ON public.application_days USING btree (outreach_day_id) WHERE (released_at IS NULL);

create index if not exists application_days_outreach_day_id_idx ON public.application_days USING btree (outreach_day_id);

create index if not exists applications_outreach_role_id_idx ON public.applications USING btree (outreach_role_id);

create index if not exists attendance_outreach_day_id_idx ON public.attendance USING btree (outreach_day_id);

create index if not exists outreach_days_day_idx ON public.outreach_days USING btree (day);

create index if not exists outreach_days_outreach_id_idx ON public.outreach_days USING btree (outreach_id);

create index if not exists outreach_images_outreach_id_idx ON public.outreach_images USING btree (outreach_id, "position");

create index if not exists outreach_roles_outreach_id_idx ON public.outreach_roles USING btree (outreach_id);

create unique index if not exists outreach_roles_unique_category_level ON public.outreach_roles USING btree (outreach_id, category, COALESCE(min_experience_level, 'any'::text));

-- Functions, in their final form
CREATE OR REPLACE FUNCTION public.enforce_volunteer_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Not the volunteer acting on their own row -> nothing to constrain here.
  if new.volunteer_id is distinct from auth.uid() then
    return new;
  end if;

  -- The owning organisation may also be acting; orgs keep full transitions.
  if exists (
    select 1 from public.outreaches o
    where o.id = new.outreach_id
      and o.organisation_id = auth.uid()
  ) then
    return new;
  end if;

  -- A volunteer may only reach 'pending' from a withdrawal of their own.
  -- Coming from 'rejected' (or 'accepted', or 'waitlisted') is refused: those
  -- are the organisation's decisions to revisit, not the applicant's.
  if new.status = 'pending' and old.status is distinct from 'cancelled' then
    raise exception
      'A volunteer may only return an application to pending after withdrawing it (was: %).',
      old.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refuse_outreach_from_unverified_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_state org_verification_state;
  v_moderation moderation_state;
begin
  -- FIRST, and before every other test. Taking an event down is always allowed.
  if tg_op = 'UPDATE'
     and new.status = 'cancelled'
     and old.status is distinct from 'cancelled' then
    return new;
  end if;

  -- Moderation next, and it allows no draft exception: an organisation
  -- awaiting verification is preparing to operate, while a suspended one has
  -- been told to stop.
  select moderation_state into v_moderation from profiles where id = new.organisation_id;
  if v_moderation is distinct from 'active' then
    raise exception
      'This organisation is suspended and cannot create or publish outreaches.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'draft' then
    return new;
  end if;

  select verification_state into v_state
    from organisation_profiles
   where id = new.organisation_id;

  if v_state is distinct from 'verified' then
    raise exception
      'This organisation is not verified, so it cannot publish outreaches yet. Submit verification from Settings.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.stamp_application_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  event_start timestamptz;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select (o.date + coalesce(o.start_time, '00:00'::time)) at time zone 'UTC'
      into event_start
    from outreaches o
    where o.id = new.outreach_id;

    new.cancelled_at := now();

    -- Both edges. `now() < event_start` is the fix: past the start it is a
    -- no-show, not a cancellation, and must not be stamped as one.
    new.late_cancellation :=
      event_start is not null
      and now() >= event_start - interval '24 hours'
      and now() < event_start;
  end if;

  return new;
end;
$function$;

-- Row level security
alter table application_days enable row level security;

alter table outreach_days enable row level security;

alter table outreach_images enable row level security;

alter table outreach_roles enable row level security;

alter table vetted_sources enable row level security;

-- Policies, in their final form
drop policy if exists application_days_select on application_days;

create policy application_days_select on application_days as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (applications a
     JOIN outreaches o ON ((o.id = a.outreach_id)))
  WHERE ((a.id = application_days.application_id) AND ((a.volunteer_id = auth.uid()) OR (o.organisation_id = auth.uid()))))));

drop policy if exists application_days_write_own on application_days;

create policy application_days_write_own on application_days as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM applications a
  WHERE ((a.id = application_days.application_id) AND (a.volunteer_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM applications a
  WHERE ((a.id = application_days.application_id) AND (a.volunteer_id = auth.uid())))));

drop policy if exists applications_insert_own on applications;

create policy applications_insert_own on applications as permissive for insert to authenticated
  with check (((volunteer_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM outreaches o
  WHERE ((o.id = applications.outreach_id) AND (o.status = 'open'::outreach_status)))) AND ((NOT application_role_is_clinical(outreach_id, outreach_role_id)) OR (EXISTS ( SELECT 1
   FROM volunteer_profiles vp
  WHERE ((vp.id = auth.uid()) AND (vp.verification_status = 'verified'::verification_status)))))));

drop policy if exists applications_update_own_cancel on applications;

create policy applications_update_own_cancel on applications as permissive for update to authenticated
  using ((volunteer_id = auth.uid()))
  with check (((volunteer_id = auth.uid()) AND ((status = 'cancelled'::application_status) OR ((status = 'pending'::application_status) AND (EXISTS ( SELECT 1
   FROM outreaches o
  WHERE ((o.id = applications.outreach_id) AND (o.status = 'open'::outreach_status)))) AND ((NOT application_role_is_clinical(outreach_id, outreach_role_id)) OR (EXISTS ( SELECT 1
   FROM volunteer_profiles vp
  WHERE ((vp.id = auth.uid()) AND (vp.verification_status = 'verified'::verification_status)))))))));

drop policy if exists outreach_days_select on outreach_days;

create policy outreach_days_select on outreach_days as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM outreaches o
  WHERE ((o.id = outreach_days.outreach_id) AND ((o.status <> 'draft'::outreach_status) OR (o.organisation_id = auth.uid()))))));

drop policy if exists outreach_days_write on outreach_days;

create policy outreach_days_write on outreach_days as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM outreaches o
  WHERE ((o.id = outreach_days.outreach_id) AND (o.organisation_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM outreaches o
  WHERE ((o.id = outreach_days.outreach_id) AND (o.organisation_id = auth.uid())))));

drop policy if exists outreach_images_select on outreach_images;

create policy outreach_images_select on outreach_images as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM outreaches o
  WHERE ((o.id = outreach_images.outreach_id) AND ((o.status <> 'draft'::outreach_status) OR (o.organisation_id = auth.uid()))))));

drop policy if exists outreach_images_write on outreach_images;

create policy outreach_images_write on outreach_images as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM outreaches o
  WHERE ((o.id = outreach_images.outreach_id) AND (o.organisation_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM outreaches o
  WHERE ((o.id = outreach_images.outreach_id) AND (o.organisation_id = auth.uid())))));

drop policy if exists outreach_roles_delete on outreach_roles;

create policy outreach_roles_delete on outreach_roles as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM outreaches o
  WHERE ((o.id = outreach_roles.outreach_id) AND (o.organisation_id = auth.uid())))));

drop policy if exists outreach_roles_insert on outreach_roles;

create policy outreach_roles_insert on outreach_roles as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM outreaches o
  WHERE ((o.id = outreach_roles.outreach_id) AND (o.organisation_id = auth.uid())))));

drop policy if exists outreach_roles_select on outreach_roles;

create policy outreach_roles_select on outreach_roles as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM outreaches o
  WHERE ((o.id = outreach_roles.outreach_id) AND ((o.status <> 'draft'::outreach_status) OR (o.organisation_id = auth.uid()))))));

drop policy if exists outreach_roles_update on outreach_roles;

create policy outreach_roles_update on outreach_roles as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM outreaches o
  WHERE ((o.id = outreach_roles.outreach_id) AND (o.organisation_id = auth.uid())))));

drop policy if exists vetted_sources_select_admin on vetted_sources;

create policy vetted_sources_select_admin on vetted_sources as permissive for select to authenticated
  using (is_admin());

-- Triggers
drop trigger if exists trg_application_days_belong on application_days;

CREATE TRIGGER trg_application_days_belong BEFORE INSERT OR UPDATE ON public.application_days FOR EACH ROW EXECUTE FUNCTION assert_day_belongs_to_outreach();

drop trigger if exists trg_application_days_stamp_release on application_days;

CREATE TRIGGER trg_application_days_stamp_release BEFORE UPDATE ON public.application_days FOR EACH ROW EXECUTE FUNCTION stamp_application_day_release();

drop trigger if exists trg_applications_role_belongs on applications;

CREATE TRIGGER trg_applications_role_belongs BEFORE INSERT OR UPDATE OF outreach_role_id, outreach_id ON public.applications FOR EACH ROW EXECUTE FUNCTION assert_role_belongs_to_outreach();

drop trigger if exists trg_applications_sync_role_slots on applications;

CREATE TRIGGER trg_applications_sync_role_slots AFTER INSERT OR DELETE OR UPDATE OF status, outreach_role_id ON public.applications FOR EACH ROW EXECUTE FUNCTION sync_role_slots_filled();

drop trigger if exists trg_outreach_days_refuse_committed_delete on outreach_days;

CREATE TRIGGER trg_outreach_days_refuse_committed_delete BEFORE DELETE ON public.outreach_days FOR EACH ROW EXECUTE FUNCTION refuse_committed_day_delete();

drop trigger if exists trg_outreach_days_sync_first on outreach_days;

CREATE TRIGGER trg_outreach_days_sync_first AFTER INSERT OR DELETE OR UPDATE OF day ON public.outreach_days FOR EACH ROW EXECUTE FUNCTION sync_outreach_first_day();

drop trigger if exists trg_outreach_images_cap on outreach_images;

CREATE TRIGGER trg_outreach_images_cap BEFORE INSERT ON public.outreach_images FOR EACH ROW EXECUTE FUNCTION enforce_outreach_image_cap();

-- 20260925b: a role change withdraws verification; 15 skills / 3 specialties.
drop trigger if exists trg_volunteer_profiles_category_reverify on volunteer_profiles;

CREATE TRIGGER trg_volunteer_profiles_category_reverify BEFORE UPDATE OF category ON public.volunteer_profiles FOR EACH ROW EXECUTE FUNCTION reset_verification_on_category_change();

drop trigger if exists trg_volunteer_profiles_list_limits on volunteer_profiles;

CREATE TRIGGER trg_volunteer_profiles_list_limits BEFORE INSERT OR UPDATE OF skill_tags, specialties ON public.volunteer_profiles FOR EACH ROW EXECUTE FUNCTION enforce_volunteer_list_limits();

-- 20260925c: who may claim which skill or specialty. The block between the
-- GENERATED markers is written by lib/claimEligibilitySql.ts; a test fails if
-- it differs from constants/skillEligibility.ts.
alter table volunteer_claim_eligibility enable row level security;

revoke all on volunteer_claim_eligibility from anon, authenticated;

-- BEGIN GENERATED: volunteer_claim_eligibility (lib/claimEligibilitySql.ts, do not edit by hand)
delete from volunteer_claim_eligibility;
insert into volunteer_claim_eligibility (kind, item, category) values
  ('skill', 'Active listening and support', 'allied_health'),
  ('skill', 'Active listening and support', 'doctor'),
  ('skill', 'Active listening and support', 'first_aider'),
  ('skill', 'Active listening and support', 'midwife'),
  ('skill', 'Active listening and support', 'nurse'),
  ('skill', 'Active listening and support', 'other'),
  ('skill', 'Active listening and support', 'pharmacist'),
  ('skill', 'Active listening and support', 'student'),
  ('skill', 'Airway management', 'doctor'),
  ('skill', 'Airway management', 'first_aider'),
  ('skill', 'Airway management', 'midwife'),
  ('skill', 'Airway management', 'nurse'),
  ('skill', 'Airway management', 'student'),
  ('skill', 'Antenatal care', 'doctor'),
  ('skill', 'Antenatal care', 'midwife'),
  ('skill', 'Antenatal care', 'nurse'),
  ('skill', 'Anthropometric measurement', 'allied_health'),
  ('skill', 'Anthropometric measurement', 'doctor'),
  ('skill', 'Anthropometric measurement', 'first_aider'),
  ('skill', 'Anthropometric measurement', 'midwife'),
  ('skill', 'Anthropometric measurement', 'nurse'),
  ('skill', 'Anthropometric measurement', 'other'),
  ('skill', 'Anthropometric measurement', 'pharmacist'),
  ('skill', 'Anthropometric measurement', 'student'),
  ('skill', 'Automated external defibrillator (AED) use', 'allied_health'),
  ('skill', 'Automated external defibrillator (AED) use', 'doctor'),
  ('skill', 'Automated external defibrillator (AED) use', 'first_aider'),
  ('skill', 'Automated external defibrillator (AED) use', 'midwife'),
  ('skill', 'Automated external defibrillator (AED) use', 'nurse'),
  ('skill', 'Automated external defibrillator (AED) use', 'other'),
  ('skill', 'Automated external defibrillator (AED) use', 'pharmacist'),
  ('skill', 'Automated external defibrillator (AED) use', 'student'),
  ('skill', 'Basic Life Support (BLS)', 'allied_health'),
  ('skill', 'Basic Life Support (BLS)', 'doctor'),
  ('skill', 'Basic Life Support (BLS)', 'first_aider'),
  ('skill', 'Basic Life Support (BLS)', 'midwife'),
  ('skill', 'Basic Life Support (BLS)', 'nurse'),
  ('skill', 'Basic Life Support (BLS)', 'other'),
  ('skill', 'Basic Life Support (BLS)', 'pharmacist'),
  ('skill', 'Basic Life Support (BLS)', 'student'),
  ('skill', 'Birth registration support', 'allied_health'),
  ('skill', 'Birth registration support', 'doctor'),
  ('skill', 'Birth registration support', 'first_aider'),
  ('skill', 'Birth registration support', 'midwife'),
  ('skill', 'Birth registration support', 'nurse'),
  ('skill', 'Birth registration support', 'other'),
  ('skill', 'Birth registration support', 'pharmacist'),
  ('skill', 'Birth registration support', 'student'),
  ('skill', 'Blood glucose testing', 'allied_health'),
  ('skill', 'Blood glucose testing', 'doctor'),
  ('skill', 'Blood glucose testing', 'first_aider'),
  ('skill', 'Blood glucose testing', 'midwife'),
  ('skill', 'Blood glucose testing', 'nurse'),
  ('skill', 'Blood glucose testing', 'pharmacist'),
  ('skill', 'Blood glucose testing', 'student'),
  ('skill', 'Blood pressure measurement', 'allied_health'),
  ('skill', 'Blood pressure measurement', 'doctor'),
  ('skill', 'Blood pressure measurement', 'first_aider'),
  ('skill', 'Blood pressure measurement', 'midwife'),
  ('skill', 'Blood pressure measurement', 'nurse'),
  ('skill', 'Blood pressure measurement', 'pharmacist'),
  ('skill', 'Blood pressure measurement', 'student'),
  ('skill', 'Breast self-examination teaching', 'allied_health'),
  ('skill', 'Breast self-examination teaching', 'doctor'),
  ('skill', 'Breast self-examination teaching', 'first_aider'),
  ('skill', 'Breast self-examination teaching', 'midwife'),
  ('skill', 'Breast self-examination teaching', 'nurse'),
  ('skill', 'Breast self-examination teaching', 'other'),
  ('skill', 'Breast self-examination teaching', 'pharmacist'),
  ('skill', 'Breast self-examination teaching', 'student'),
  ('skill', 'Breastfeeding support', 'doctor'),
  ('skill', 'Breastfeeding support', 'midwife'),
  ('skill', 'Breastfeeding support', 'nurse'),
  ('skill', 'Breastfeeding support', 'student'),
  ('skill', 'Burns management', 'allied_health'),
  ('skill', 'Burns management', 'doctor'),
  ('skill', 'Burns management', 'first_aider'),
  ('skill', 'Burns management', 'midwife'),
  ('skill', 'Burns management', 'nurse'),
  ('skill', 'Burns management', 'pharmacist'),
  ('skill', 'Burns management', 'student'),
  ('skill', 'Cardiopulmonary resuscitation (CPR)', 'allied_health'),
  ('skill', 'Cardiopulmonary resuscitation (CPR)', 'doctor'),
  ('skill', 'Cardiopulmonary resuscitation (CPR)', 'first_aider'),
  ('skill', 'Cardiopulmonary resuscitation (CPR)', 'midwife'),
  ('skill', 'Cardiopulmonary resuscitation (CPR)', 'nurse'),
  ('skill', 'Cardiopulmonary resuscitation (CPR)', 'other'),
  ('skill', 'Cardiopulmonary resuscitation (CPR)', 'pharmacist'),
  ('skill', 'Cardiopulmonary resuscitation (CPR)', 'student'),
  ('skill', 'Cataract screening', 'allied_health'),
  ('skill', 'Cataract screening', 'doctor'),
  ('skill', 'Cataract screening', 'nurse'),
  ('skill', 'Cataract screening', 'student'),
  ('skill', 'Cervical screening (visual inspection with acetic acid)', 'doctor'),
  ('skill', 'Cervical screening (visual inspection with acetic acid)', 'midwife'),
  ('skill', 'Cervical screening (visual inspection with acetic acid)', 'nurse'),
  ('skill', 'Child growth monitoring', 'allied_health'),
  ('skill', 'Child growth monitoring', 'doctor'),
  ('skill', 'Child growth monitoring', 'first_aider'),
  ('skill', 'Child growth monitoring', 'midwife'),
  ('skill', 'Child growth monitoring', 'nurse'),
  ('skill', 'Child growth monitoring', 'pharmacist'),
  ('skill', 'Child growth monitoring', 'student'),
  ('skill', 'Cholesterol and lipid testing', 'allied_health'),
  ('skill', 'Cholesterol and lipid testing', 'doctor'),
  ('skill', 'Cholesterol and lipid testing', 'midwife'),
  ('skill', 'Cholesterol and lipid testing', 'nurse'),
  ('skill', 'Cholesterol and lipid testing', 'pharmacist'),
  ('skill', 'Cholesterol and lipid testing', 'student'),
  ('skill', 'Clinical breast examination', 'doctor'),
  ('skill', 'Clinical breast examination', 'midwife'),
  ('skill', 'Clinical breast examination', 'nurse'),
  ('skill', 'Clinical breast examination', 'student'),
  ('skill', 'Community mobilisation', 'allied_health'),
  ('skill', 'Community mobilisation', 'doctor'),
  ('skill', 'Community mobilisation', 'first_aider'),
  ('skill', 'Community mobilisation', 'midwife'),
  ('skill', 'Community mobilisation', 'nurse'),
  ('skill', 'Community mobilisation', 'other'),
  ('skill', 'Community mobilisation', 'pharmacist'),
  ('skill', 'Community mobilisation', 'student'),
  ('skill', 'Crowd and queue management', 'allied_health'),
  ('skill', 'Crowd and queue management', 'doctor'),
  ('skill', 'Crowd and queue management', 'first_aider'),
  ('skill', 'Crowd and queue management', 'midwife'),
  ('skill', 'Crowd and queue management', 'nurse'),
  ('skill', 'Crowd and queue management', 'other'),
  ('skill', 'Crowd and queue management', 'pharmacist'),
  ('skill', 'Crowd and queue management', 'student'),
  ('skill', 'Data entry', 'allied_health'),
  ('skill', 'Data entry', 'doctor'),
  ('skill', 'Data entry', 'first_aider'),
  ('skill', 'Data entry', 'midwife'),
  ('skill', 'Data entry', 'nurse'),
  ('skill', 'Data entry', 'other'),
  ('skill', 'Data entry', 'pharmacist'),
  ('skill', 'Data entry', 'student'),
  ('skill', 'Dental and oral health screening', 'allied_health'),
  ('skill', 'Dental and oral health screening', 'doctor'),
  ('skill', 'Dental and oral health screening', 'nurse'),
  ('skill', 'Dental and oral health screening', 'student'),
  ('skill', 'Deworming administration', 'doctor'),
  ('skill', 'Deworming administration', 'midwife'),
  ('skill', 'Deworming administration', 'nurse'),
  ('skill', 'Deworming administration', 'pharmacist'),
  ('skill', 'Deworming administration', 'student'),
  ('skill', 'Dispensing spectacles', 'allied_health'),
  ('skill', 'Dispensing spectacles', 'doctor'),
  ('skill', 'Dispensing spectacles', 'midwife'),
  ('skill', 'Dispensing spectacles', 'nurse'),
  ('skill', 'Dispensing spectacles', 'pharmacist'),
  ('skill', 'Dispensing spectacles', 'student'),
  ('skill', 'Donor counselling', 'doctor'),
  ('skill', 'Donor counselling', 'midwife'),
  ('skill', 'Donor counselling', 'nurse'),
  ('skill', 'Donor counselling', 'pharmacist'),
  ('skill', 'Donor counselling', 'student'),
  ('skill', 'Donor eligibility screening', 'doctor'),
  ('skill', 'Donor eligibility screening', 'midwife'),
  ('skill', 'Donor eligibility screening', 'nurse'),
  ('skill', 'Donor eligibility screening', 'pharmacist'),
  ('skill', 'Donor eligibility screening', 'student'),
  ('skill', 'Donor registration', 'allied_health'),
  ('skill', 'Donor registration', 'doctor'),
  ('skill', 'Donor registration', 'first_aider'),
  ('skill', 'Donor registration', 'midwife'),
  ('skill', 'Donor registration', 'nurse'),
  ('skill', 'Donor registration', 'other'),
  ('skill', 'Donor registration', 'pharmacist'),
  ('skill', 'Donor registration', 'student'),
  ('skill', 'Dosage calculation', 'doctor'),
  ('skill', 'Dosage calculation', 'midwife'),
  ('skill', 'Dosage calculation', 'nurse'),
  ('skill', 'Dosage calculation', 'pharmacist'),
  ('skill', 'Dosage calculation', 'student'),
  ('skill', 'Drug interaction screening', 'doctor'),
  ('skill', 'Drug interaction screening', 'pharmacist'),
  ('skill', 'Emergency triage', 'doctor'),
  ('skill', 'Emergency triage', 'first_aider'),
  ('skill', 'Emergency triage', 'midwife'),
  ('skill', 'Emergency triage', 'nurse'),
  ('skill', 'Emergency triage', 'student'),
  ('skill', 'Eye health education', 'allied_health'),
  ('skill', 'Eye health education', 'doctor'),
  ('skill', 'Eye health education', 'first_aider'),
  ('skill', 'Eye health education', 'midwife'),
  ('skill', 'Eye health education', 'nurse'),
  ('skill', 'Eye health education', 'other'),
  ('skill', 'Eye health education', 'pharmacist'),
  ('skill', 'Eye health education', 'student'),
  ('skill', 'Family planning counselling', 'doctor'),
  ('skill', 'Family planning counselling', 'midwife'),
  ('skill', 'Family planning counselling', 'nurse'),
  ('skill', 'Family planning counselling', 'pharmacist'),
  ('skill', 'Family planning counselling', 'student'),
  ('skill', 'Haemoglobin testing', 'allied_health'),
  ('skill', 'Haemoglobin testing', 'doctor'),
  ('skill', 'Haemoglobin testing', 'midwife'),
  ('skill', 'Haemoglobin testing', 'nurse'),
  ('skill', 'Haemoglobin testing', 'pharmacist'),
  ('skill', 'Haemoglobin testing', 'student'),
  ('skill', 'Health education', 'allied_health'),
  ('skill', 'Health education', 'doctor'),
  ('skill', 'Health education', 'first_aider'),
  ('skill', 'Health education', 'midwife'),
  ('skill', 'Health education', 'nurse'),
  ('skill', 'Health education', 'other'),
  ('skill', 'Health education', 'pharmacist'),
  ('skill', 'Health education', 'student'),
  ('skill', 'Hepatitis B screening', 'allied_health'),
  ('skill', 'Hepatitis B screening', 'doctor'),
  ('skill', 'Hepatitis B screening', 'midwife'),
  ('skill', 'Hepatitis B screening', 'nurse'),
  ('skill', 'Hepatitis B screening', 'pharmacist'),
  ('skill', 'Hepatitis B screening', 'student'),
  ('skill', 'HIV counselling and testing', 'allied_health'),
  ('skill', 'HIV counselling and testing', 'doctor'),
  ('skill', 'HIV counselling and testing', 'midwife'),
  ('skill', 'HIV counselling and testing', 'nurse'),
  ('skill', 'HIV counselling and testing', 'pharmacist'),
  ('skill', 'HIV counselling and testing', 'student'),
  ('skill', 'HPV sample collection', 'doctor'),
  ('skill', 'HPV sample collection', 'midwife'),
  ('skill', 'HPV sample collection', 'nurse'),
  ('skill', 'Immunisation counselling', 'doctor'),
  ('skill', 'Immunisation counselling', 'midwife'),
  ('skill', 'Immunisation counselling', 'nurse'),
  ('skill', 'Immunisation counselling', 'pharmacist'),
  ('skill', 'Immunisation counselling', 'student'),
  ('skill', 'Infection control', 'allied_health'),
  ('skill', 'Infection control', 'doctor'),
  ('skill', 'Infection control', 'first_aider'),
  ('skill', 'Infection control', 'midwife'),
  ('skill', 'Infection control', 'nurse'),
  ('skill', 'Infection control', 'pharmacist'),
  ('skill', 'Infection control', 'student'),
  ('skill', 'Injection administration', 'doctor'),
  ('skill', 'Injection administration', 'midwife'),
  ('skill', 'Injection administration', 'nurse'),
  ('skill', 'Injection administration', 'pharmacist'),
  ('skill', 'Injection administration', 'student'),
  ('skill', 'Insecticide-treated net distribution', 'allied_health'),
  ('skill', 'Insecticide-treated net distribution', 'doctor'),
  ('skill', 'Insecticide-treated net distribution', 'first_aider'),
  ('skill', 'Insecticide-treated net distribution', 'midwife'),
  ('skill', 'Insecticide-treated net distribution', 'nurse'),
  ('skill', 'Insecticide-treated net distribution', 'other'),
  ('skill', 'Insecticide-treated net distribution', 'pharmacist'),
  ('skill', 'Insecticide-treated net distribution', 'student'),
  ('skill', 'Intraocular pressure measurement', 'allied_health'),
  ('skill', 'Intraocular pressure measurement', 'doctor'),
  ('skill', 'Intraocular pressure measurement', 'nurse'),
  ('skill', 'Intraocular pressure measurement', 'student'),
  ('skill', 'Inventory management', 'allied_health'),
  ('skill', 'Inventory management', 'doctor'),
  ('skill', 'Inventory management', 'first_aider'),
  ('skill', 'Inventory management', 'midwife'),
  ('skill', 'Inventory management', 'nurse'),
  ('skill', 'Inventory management', 'other'),
  ('skill', 'Inventory management', 'pharmacist'),
  ('skill', 'Inventory management', 'student'),
  ('skill', 'Logistics and setup', 'allied_health'),
  ('skill', 'Logistics and setup', 'doctor'),
  ('skill', 'Logistics and setup', 'first_aider'),
  ('skill', 'Logistics and setup', 'midwife'),
  ('skill', 'Logistics and setup', 'nurse'),
  ('skill', 'Logistics and setup', 'other'),
  ('skill', 'Logistics and setup', 'pharmacist'),
  ('skill', 'Logistics and setup', 'student'),
  ('skill', 'Malaria rapid diagnostic testing', 'allied_health'),
  ('skill', 'Malaria rapid diagnostic testing', 'doctor'),
  ('skill', 'Malaria rapid diagnostic testing', 'midwife'),
  ('skill', 'Malaria rapid diagnostic testing', 'nurse'),
  ('skill', 'Malaria rapid diagnostic testing', 'pharmacist'),
  ('skill', 'Malaria rapid diagnostic testing', 'student'),
  ('skill', 'Malnutrition screening (MUAC)', 'allied_health'),
  ('skill', 'Malnutrition screening (MUAC)', 'doctor'),
  ('skill', 'Malnutrition screening (MUAC)', 'first_aider'),
  ('skill', 'Malnutrition screening (MUAC)', 'midwife'),
  ('skill', 'Malnutrition screening (MUAC)', 'nurse'),
  ('skill', 'Malnutrition screening (MUAC)', 'pharmacist'),
  ('skill', 'Malnutrition screening (MUAC)', 'student'),
  ('skill', 'Medication administration', 'doctor'),
  ('skill', 'Medication administration', 'midwife'),
  ('skill', 'Medication administration', 'nurse'),
  ('skill', 'Medication administration', 'pharmacist'),
  ('skill', 'Medication administration', 'student'),
  ('skill', 'Medication dispensing', 'doctor'),
  ('skill', 'Medication dispensing', 'nurse'),
  ('skill', 'Medication dispensing', 'pharmacist'),
  ('skill', 'Medication dispensing', 'student'),
  ('skill', 'Mental health awareness education', 'allied_health'),
  ('skill', 'Mental health awareness education', 'doctor'),
  ('skill', 'Mental health awareness education', 'first_aider'),
  ('skill', 'Mental health awareness education', 'midwife'),
  ('skill', 'Mental health awareness education', 'nurse'),
  ('skill', 'Mental health awareness education', 'other'),
  ('skill', 'Mental health awareness education', 'pharmacist'),
  ('skill', 'Mental health awareness education', 'student'),
  ('skill', 'NHIS registration and renewal', 'allied_health'),
  ('skill', 'NHIS registration and renewal', 'doctor'),
  ('skill', 'NHIS registration and renewal', 'first_aider'),
  ('skill', 'NHIS registration and renewal', 'midwife'),
  ('skill', 'NHIS registration and renewal', 'nurse'),
  ('skill', 'NHIS registration and renewal', 'other'),
  ('skill', 'NHIS registration and renewal', 'pharmacist'),
  ('skill', 'NHIS registration and renewal', 'student'),
  ('skill', 'Nutrition counselling', 'allied_health'),
  ('skill', 'Nutrition counselling', 'doctor'),
  ('skill', 'Nutrition counselling', 'midwife'),
  ('skill', 'Nutrition counselling', 'nurse'),
  ('skill', 'Nutrition counselling', 'student'),
  ('skill', 'Oral health education', 'allied_health'),
  ('skill', 'Oral health education', 'doctor'),
  ('skill', 'Oral health education', 'first_aider'),
  ('skill', 'Oral health education', 'midwife'),
  ('skill', 'Oral health education', 'nurse'),
  ('skill', 'Oral health education', 'other'),
  ('skill', 'Oral health education', 'pharmacist'),
  ('skill', 'Oral health education', 'student'),
  ('skill', 'Patient counselling on medication', 'doctor'),
  ('skill', 'Patient counselling on medication', 'midwife'),
  ('skill', 'Patient counselling on medication', 'nurse'),
  ('skill', 'Patient counselling on medication', 'pharmacist'),
  ('skill', 'Patient counselling on medication', 'student'),
  ('skill', 'Patient history taking', 'allied_health'),
  ('skill', 'Patient history taking', 'doctor'),
  ('skill', 'Patient history taking', 'midwife'),
  ('skill', 'Patient history taking', 'nurse'),
  ('skill', 'Patient history taking', 'pharmacist'),
  ('skill', 'Patient history taking', 'student'),
  ('skill', 'Patient registration', 'allied_health'),
  ('skill', 'Patient registration', 'doctor'),
  ('skill', 'Patient registration', 'first_aider'),
  ('skill', 'Patient registration', 'midwife'),
  ('skill', 'Patient registration', 'nurse'),
  ('skill', 'Patient registration', 'other'),
  ('skill', 'Patient registration', 'pharmacist'),
  ('skill', 'Patient registration', 'student'),
  ('skill', 'Phlebotomy for donation', 'allied_health'),
  ('skill', 'Phlebotomy for donation', 'doctor'),
  ('skill', 'Phlebotomy for donation', 'midwife'),
  ('skill', 'Phlebotomy for donation', 'nurse'),
  ('skill', 'Phlebotomy for donation', 'student'),
  ('skill', 'Physical examination', 'doctor'),
  ('skill', 'Physical examination', 'midwife'),
  ('skill', 'Physical examination', 'nurse'),
  ('skill', 'Physical examination', 'student'),
  ('skill', 'Post-donation care', 'allied_health'),
  ('skill', 'Post-donation care', 'doctor'),
  ('skill', 'Post-donation care', 'first_aider'),
  ('skill', 'Post-donation care', 'midwife'),
  ('skill', 'Post-donation care', 'nurse'),
  ('skill', 'Post-donation care', 'pharmacist'),
  ('skill', 'Post-donation care', 'student'),
  ('skill', 'Post-operative eye care', 'doctor'),
  ('skill', 'Post-operative eye care', 'nurse'),
  ('skill', 'Postnatal care', 'doctor'),
  ('skill', 'Postnatal care', 'midwife'),
  ('skill', 'Postnatal care', 'nurse'),
  ('skill', 'Prescription review', 'doctor'),
  ('skill', 'Prescription review', 'pharmacist'),
  ('skill', 'Prostate specific antigen (PSA) testing', 'allied_health'),
  ('skill', 'Prostate specific antigen (PSA) testing', 'doctor'),
  ('skill', 'Prostate specific antigen (PSA) testing', 'midwife'),
  ('skill', 'Prostate specific antigen (PSA) testing', 'nurse'),
  ('skill', 'Prostate specific antigen (PSA) testing', 'pharmacist'),
  ('skill', 'Prostate specific antigen (PSA) testing', 'student'),
  ('skill', 'Psychological first aid', 'allied_health'),
  ('skill', 'Psychological first aid', 'doctor'),
  ('skill', 'Psychological first aid', 'first_aider'),
  ('skill', 'Psychological first aid', 'midwife'),
  ('skill', 'Psychological first aid', 'nurse'),
  ('skill', 'Psychological first aid', 'other'),
  ('skill', 'Psychological first aid', 'pharmacist'),
  ('skill', 'Psychological first aid', 'student'),
  ('skill', 'Pterygium screening', 'allied_health'),
  ('skill', 'Pterygium screening', 'doctor'),
  ('skill', 'Pterygium screening', 'nurse'),
  ('skill', 'Pterygium screening', 'student'),
  ('skill', 'Pulse oximetry', 'allied_health'),
  ('skill', 'Pulse oximetry', 'doctor'),
  ('skill', 'Pulse oximetry', 'first_aider'),
  ('skill', 'Pulse oximetry', 'midwife'),
  ('skill', 'Pulse oximetry', 'nurse'),
  ('skill', 'Pulse oximetry', 'pharmacist'),
  ('skill', 'Pulse oximetry', 'student'),
  ('skill', 'Record keeping', 'allied_health'),
  ('skill', 'Record keeping', 'doctor'),
  ('skill', 'Record keeping', 'first_aider'),
  ('skill', 'Record keeping', 'midwife'),
  ('skill', 'Record keeping', 'nurse'),
  ('skill', 'Record keeping', 'other'),
  ('skill', 'Record keeping', 'pharmacist'),
  ('skill', 'Record keeping', 'student'),
  ('skill', 'Referral and follow-up coordination', 'allied_health'),
  ('skill', 'Referral and follow-up coordination', 'doctor'),
  ('skill', 'Referral and follow-up coordination', 'first_aider'),
  ('skill', 'Referral and follow-up coordination', 'midwife'),
  ('skill', 'Referral and follow-up coordination', 'nurse'),
  ('skill', 'Referral and follow-up coordination', 'other'),
  ('skill', 'Referral and follow-up coordination', 'pharmacist'),
  ('skill', 'Referral and follow-up coordination', 'student'),
  ('skill', 'Referral to mental health services', 'allied_health'),
  ('skill', 'Referral to mental health services', 'doctor'),
  ('skill', 'Referral to mental health services', 'first_aider'),
  ('skill', 'Referral to mental health services', 'midwife'),
  ('skill', 'Referral to mental health services', 'nurse'),
  ('skill', 'Referral to mental health services', 'other'),
  ('skill', 'Referral to mental health services', 'pharmacist'),
  ('skill', 'Referral to mental health services', 'student'),
  ('skill', 'Refraction and lens prescribing', 'allied_health'),
  ('skill', 'Refraction and lens prescribing', 'doctor'),
  ('skill', 'Refraction and lens prescribing', 'nurse'),
  ('skill', 'Refraction and lens prescribing', 'student'),
  ('skill', 'Shock management', 'doctor'),
  ('skill', 'Shock management', 'first_aider'),
  ('skill', 'Shock management', 'midwife'),
  ('skill', 'Shock management', 'nurse'),
  ('skill', 'Shock management', 'student'),
  ('skill', 'Sickle cell screening', 'allied_health'),
  ('skill', 'Sickle cell screening', 'doctor'),
  ('skill', 'Sickle cell screening', 'midwife'),
  ('skill', 'Sickle cell screening', 'nurse'),
  ('skill', 'Sickle cell screening', 'pharmacist'),
  ('skill', 'Sickle cell screening', 'student'),
  ('skill', 'Skin condition screening', 'doctor'),
  ('skill', 'Skin condition screening', 'nurse'),
  ('skill', 'Skin condition screening', 'student'),
  ('skill', 'Splinting and immobilisation', 'allied_health'),
  ('skill', 'Splinting and immobilisation', 'doctor'),
  ('skill', 'Splinting and immobilisation', 'first_aider'),
  ('skill', 'Splinting and immobilisation', 'midwife'),
  ('skill', 'Splinting and immobilisation', 'nurse'),
  ('skill', 'Splinting and immobilisation', 'pharmacist'),
  ('skill', 'Splinting and immobilisation', 'student'),
  ('skill', 'Stress and coping education', 'allied_health'),
  ('skill', 'Stress and coping education', 'doctor'),
  ('skill', 'Stress and coping education', 'first_aider'),
  ('skill', 'Stress and coping education', 'midwife'),
  ('skill', 'Stress and coping education', 'nurse'),
  ('skill', 'Stress and coping education', 'other'),
  ('skill', 'Stress and coping education', 'pharmacist'),
  ('skill', 'Stress and coping education', 'student'),
  ('skill', 'Substance use awareness', 'allied_health'),
  ('skill', 'Substance use awareness', 'doctor'),
  ('skill', 'Substance use awareness', 'first_aider'),
  ('skill', 'Substance use awareness', 'midwife'),
  ('skill', 'Substance use awareness', 'nurse'),
  ('skill', 'Substance use awareness', 'other'),
  ('skill', 'Substance use awareness', 'pharmacist'),
  ('skill', 'Substance use awareness', 'student'),
  ('skill', 'Temperature measurement', 'allied_health'),
  ('skill', 'Temperature measurement', 'doctor'),
  ('skill', 'Temperature measurement', 'first_aider'),
  ('skill', 'Temperature measurement', 'midwife'),
  ('skill', 'Temperature measurement', 'nurse'),
  ('skill', 'Temperature measurement', 'pharmacist'),
  ('skill', 'Temperature measurement', 'student'),
  ('skill', 'Translation/interpretation', 'allied_health'),
  ('skill', 'Translation/interpretation', 'doctor'),
  ('skill', 'Translation/interpretation', 'first_aider'),
  ('skill', 'Translation/interpretation', 'midwife'),
  ('skill', 'Translation/interpretation', 'nurse'),
  ('skill', 'Translation/interpretation', 'other'),
  ('skill', 'Translation/interpretation', 'pharmacist'),
  ('skill', 'Translation/interpretation', 'student'),
  ('skill', 'Triage', 'doctor'),
  ('skill', 'Triage', 'first_aider'),
  ('skill', 'Triage', 'midwife'),
  ('skill', 'Triage', 'nurse'),
  ('skill', 'Triage', 'student'),
  ('skill', 'Typhoid testing', 'allied_health'),
  ('skill', 'Typhoid testing', 'doctor'),
  ('skill', 'Typhoid testing', 'midwife'),
  ('skill', 'Typhoid testing', 'nurse'),
  ('skill', 'Typhoid testing', 'pharmacist'),
  ('skill', 'Typhoid testing', 'student'),
  ('skill', 'Vaccination administration', 'doctor'),
  ('skill', 'Vaccination administration', 'midwife'),
  ('skill', 'Vaccination administration', 'nurse'),
  ('skill', 'Vaccination administration', 'pharmacist'),
  ('skill', 'Vaccination administration', 'student'),
  ('skill', 'Venipuncture', 'allied_health'),
  ('skill', 'Venipuncture', 'doctor'),
  ('skill', 'Venipuncture', 'midwife'),
  ('skill', 'Venipuncture', 'nurse'),
  ('skill', 'Venipuncture', 'student'),
  ('skill', 'Visual acuity screening', 'allied_health'),
  ('skill', 'Visual acuity screening', 'doctor'),
  ('skill', 'Visual acuity screening', 'first_aider'),
  ('skill', 'Visual acuity screening', 'midwife'),
  ('skill', 'Visual acuity screening', 'nurse'),
  ('skill', 'Visual acuity screening', 'pharmacist'),
  ('skill', 'Visual acuity screening', 'student'),
  ('skill', 'Vital signs monitoring', 'allied_health'),
  ('skill', 'Vital signs monitoring', 'doctor'),
  ('skill', 'Vital signs monitoring', 'first_aider'),
  ('skill', 'Vital signs monitoring', 'midwife'),
  ('skill', 'Vital signs monitoring', 'nurse'),
  ('skill', 'Vital signs monitoring', 'pharmacist'),
  ('skill', 'Vital signs monitoring', 'student'),
  ('skill', 'Vitamin A supplementation', 'doctor'),
  ('skill', 'Vitamin A supplementation', 'midwife'),
  ('skill', 'Vitamin A supplementation', 'nurse'),
  ('skill', 'Vitamin A supplementation', 'pharmacist'),
  ('skill', 'Vitamin A supplementation', 'student'),
  ('skill', 'Wound and bleeding control', 'allied_health'),
  ('skill', 'Wound and bleeding control', 'doctor'),
  ('skill', 'Wound and bleeding control', 'first_aider'),
  ('skill', 'Wound and bleeding control', 'midwife'),
  ('skill', 'Wound and bleeding control', 'nurse'),
  ('skill', 'Wound and bleeding control', 'other'),
  ('skill', 'Wound and bleeding control', 'pharmacist'),
  ('skill', 'Wound and bleeding control', 'student'),
  ('skill', 'Wound dressing', 'doctor'),
  ('skill', 'Wound dressing', 'first_aider'),
  ('skill', 'Wound dressing', 'midwife'),
  ('skill', 'Wound dressing', 'nurse'),
  ('skill', 'Wound dressing', 'student'),
  ('specialty', 'Anaesthesiology', 'doctor'),
  ('specialty', 'Anaesthesiology', 'nurse'),
  ('specialty', 'Cardiology', 'doctor'),
  ('specialty', 'Cardiology', 'nurse'),
  ('specialty', 'Dermatology', 'doctor'),
  ('specialty', 'Dermatology', 'nurse'),
  ('specialty', 'Ear, Nose & Throat (ENT)', 'doctor'),
  ('specialty', 'Ear, Nose & Throat (ENT)', 'nurse'),
  ('specialty', 'Emergency Medicine', 'doctor'),
  ('specialty', 'Emergency Medicine', 'nurse'),
  ('specialty', 'Endocrinology', 'doctor'),
  ('specialty', 'Endocrinology', 'nurse'),
  ('specialty', 'Family Medicine', 'doctor'),
  ('specialty', 'Family Medicine', 'midwife'),
  ('specialty', 'Family Medicine', 'nurse'),
  ('specialty', 'Gastroenterology', 'doctor'),
  ('specialty', 'Gastroenterology', 'nurse'),
  ('specialty', 'Internal Medicine', 'doctor'),
  ('specialty', 'Internal Medicine', 'nurse'),
  ('specialty', 'Neurology', 'doctor'),
  ('specialty', 'Neurology', 'nurse'),
  ('specialty', 'Obstetrics & Gynaecology', 'doctor'),
  ('specialty', 'Obstetrics & Gynaecology', 'midwife'),
  ('specialty', 'Obstetrics & Gynaecology', 'nurse'),
  ('specialty', 'Oncology', 'doctor'),
  ('specialty', 'Oncology', 'nurse'),
  ('specialty', 'Ophthalmology', 'allied_health'),
  ('specialty', 'Ophthalmology', 'doctor'),
  ('specialty', 'Ophthalmology', 'nurse'),
  ('specialty', 'Orthopaedics', 'allied_health'),
  ('specialty', 'Orthopaedics', 'doctor'),
  ('specialty', 'Orthopaedics', 'nurse'),
  ('specialty', 'Pediatrics', 'doctor'),
  ('specialty', 'Pediatrics', 'midwife'),
  ('specialty', 'Pediatrics', 'nurse'),
  ('specialty', 'Psychiatry', 'doctor'),
  ('specialty', 'Psychiatry', 'nurse'),
  ('specialty', 'Radiology', 'allied_health'),
  ('specialty', 'Radiology', 'doctor'),
  ('specialty', 'Radiology', 'nurse'),
  ('specialty', 'Surgery', 'doctor'),
  ('specialty', 'Surgery', 'nurse'),
  ('specialty', 'Urology', 'doctor'),
  ('specialty', 'Urology', 'nurse');
do $$ begin
  if (select count(*) from volunteer_claim_eligibility) <> 564 then
    raise exception 'volunteer_claim_eligibility should hold 564 rows';
  end if;
end $$;
-- END GENERATED: volunteer_claim_eligibility

drop trigger if exists trg_volunteer_profiles_claim_eligibility on volunteer_profiles;

CREATE TRIGGER trg_volunteer_profiles_claim_eligibility BEFORE INSERT OR UPDATE OF skill_tags, specialties ON public.volunteer_profiles FOR EACH ROW EXECUTE FUNCTION enforce_volunteer_claim_eligibility();

drop trigger if exists trg_outreach_roles_sync_role_type on outreach_roles;

CREATE TRIGGER trg_outreach_roles_sync_role_type AFTER INSERT OR DELETE OR UPDATE OF role_type ON public.outreach_roles FOR EACH ROW EXECUTE FUNCTION sync_outreach_role_type();

drop trigger if exists trg_outreach_roles_sync_totals on outreach_roles;

CREATE TRIGGER trg_outreach_roles_sync_totals AFTER INSERT OR DELETE OR UPDATE ON public.outreach_roles FOR EACH ROW EXECUTE FUNCTION sync_outreach_totals_from_roles();

drop trigger if exists trg_outreaches_default_day on outreaches;

CREATE TRIGGER trg_outreaches_default_day AFTER INSERT ON public.outreaches FOR EACH ROW EXECUTE FUNCTION create_default_outreach_day();

drop trigger if exists trg_outreaches_no_uncancel on outreaches;

CREATE TRIGGER trg_outreaches_no_uncancel BEFORE UPDATE OF status ON public.outreaches FOR EACH ROW EXECUTE FUNCTION refuse_uncancelling_outreach();

drop trigger if exists trg_outreaches_refuse_used_delete on outreaches;

CREATE TRIGGER trg_outreaches_refuse_used_delete BEFORE DELETE ON public.outreaches FOR EACH ROW EXECUTE FUNCTION refuse_delete_of_used_outreach();

drop trigger if exists trg_outreaches_sync_single_day on outreaches;

CREATE TRIGGER trg_outreaches_sync_single_day AFTER UPDATE OF date ON public.outreaches FOR EACH ROW EXECUTE FUNCTION sync_single_day_from_outreach();

-- Table and column grants, rebuilt whole for every table a migration changed
revoke all on application_days from anon, authenticated;

grant delete, insert, references, select, trigger, truncate, update on application_days to anon;

grant references, select, trigger, truncate on application_days to authenticated;

grant insert (application_id, outreach_day_id) on application_days to authenticated;

grant update (released_at) on application_days to authenticated;

revoke all on outreach_days from anon, authenticated;

grant delete, insert, references, select, trigger, truncate, update on outreach_days to anon;

grant delete, references, select, trigger, truncate on outreach_days to authenticated;

grant insert (day, end_time, outreach_id, start_time) on outreach_days to authenticated;

grant update (day, end_time, start_time) on outreach_days to authenticated;

revoke all on outreach_images from anon, authenticated;

grant delete, insert, references, select, trigger, truncate, update on outreach_images to anon;

grant delete, references, select, trigger, truncate on outreach_images to authenticated;

grant insert (caption, outreach_id, position, url) on outreach_images to authenticated;

grant update (caption, position) on outreach_images to authenticated;

revoke all on outreach_roles from anon, authenticated;

grant delete, insert, references, select, trigger, truncate, update on outreach_roles to anon;

grant delete, references, select, trigger, truncate on outreach_roles to authenticated;

grant insert (category, min_experience_level, outreach_id, required_skills, role_type, slots_total) on outreach_roles to authenticated;

grant update (category, id, min_experience_level, required_skills, role_type, slots_total) on outreach_roles to authenticated;

revoke all on vetted_sources from anon, authenticated;

grant references, select, trigger, truncate on vetted_sources to authenticated;

-- Who may call which function
revoke execute on function application_role_is_clinical(p_outreach_id uuid, p_role_id uuid) from public, anon, authenticated;

grant execute on function application_role_is_clinical(p_outreach_id uuid, p_role_id uuid) to authenticated;

grant execute on function application_role_is_clinical(p_outreach_id uuid, p_role_id uuid) to anon;

revoke execute on function apply_to_outreach(p_outreach_id uuid, p_type text, p_motivation text, p_outreach_role_id uuid, p_day_ids uuid[]) from public, anon, authenticated;

grant execute on function apply_to_outreach(p_outreach_id uuid, p_type text, p_motivation text, p_outreach_role_id uuid, p_day_ids uuid[]) to authenticated;

grant execute on function apply_to_outreach(p_outreach_id uuid, p_type text, p_motivation text, p_outreach_role_id uuid, p_day_ids uuid[]) to anon;

revoke execute on function assert_day_belongs_to_outreach() from public, anon, authenticated;

grant execute on function assert_day_belongs_to_outreach() to authenticated;

grant execute on function assert_day_belongs_to_outreach() to anon;

revoke execute on function assert_role_belongs_to_outreach() from public, anon, authenticated;

grant execute on function assert_role_belongs_to_outreach() to authenticated;

grant execute on function assert_role_belongs_to_outreach() to anon;

revoke execute on function clear_withdrawn_application_days(p_application_id uuid) from public, anon, authenticated;

grant execute on function clear_withdrawn_application_days(p_application_id uuid) to authenticated;

revoke execute on function count_recent_late_releases(p_volunteer_id uuid, p_window_days integer) from public, anon, authenticated;

grant execute on function count_recent_late_releases(p_volunteer_id uuid, p_window_days integer) to authenticated;

grant execute on function count_recent_late_releases(p_volunteer_id uuid, p_window_days integer) to anon;

revoke execute on function create_default_outreach_day() from public, anon, authenticated;

grant execute on function create_default_outreach_day() to authenticated;

grant execute on function create_default_outreach_day() to anon;

revoke execute on function reset_verification_on_category_change() from public, anon, authenticated;

revoke execute on function enforce_volunteer_list_limits() from public, anon, authenticated;

revoke execute on function enforce_volunteer_claim_eligibility() from public, anon, authenticated;

revoke execute on function enforce_outreach_image_cap() from public, anon, authenticated;

grant execute on function enforce_outreach_image_cap() to authenticated;

grant execute on function enforce_outreach_image_cap() to anon;

revoke execute on function outreaches_needing_resolution() from public, anon, authenticated;

revoke execute on function refuse_committed_day_delete() from public, anon, authenticated;

grant execute on function refuse_committed_day_delete() to authenticated;

grant execute on function refuse_committed_day_delete() to anon;

revoke execute on function refuse_delete_of_used_outreach() from public, anon, authenticated;

grant execute on function refuse_delete_of_used_outreach() to authenticated;

grant execute on function refuse_delete_of_used_outreach() to anon;

revoke execute on function refuse_uncancelling_outreach() from public, anon, authenticated;

grant execute on function refuse_uncancelling_outreach() to authenticated;

grant execute on function refuse_uncancelling_outreach() to anon;

revoke execute on function resolve_unsuccessful_applications(p_outreach_id uuid) from public, anon, authenticated;

revoke execute on function save_outreach(p_outreach_id uuid, p_title text, p_description text, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_region text, p_district text, p_location_name text, p_required_skills text[], p_required_category text, p_role_type outreach_role_type, p_slots_total integer, p_flyer_url text, p_roles jsonb, p_days date[]) from public, anon, authenticated;

grant execute on function save_outreach(p_outreach_id uuid, p_title text, p_description text, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_region text, p_district text, p_location_name text, p_required_skills text[], p_required_category text, p_role_type outreach_role_type, p_slots_total integer, p_flyer_url text, p_roles jsonb, p_days date[]) to authenticated;

grant execute on function save_outreach(p_outreach_id uuid, p_title text, p_description text, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_region text, p_district text, p_location_name text, p_required_skills text[], p_required_category text, p_role_type outreach_role_type, p_slots_total integer, p_flyer_url text, p_roles jsonb, p_days date[]) to anon;

revoke execute on function stamp_application_day_release() from public, anon, authenticated;

grant execute on function stamp_application_day_release() to authenticated;

grant execute on function stamp_application_day_release() to anon;

revoke execute on function sync_outreach_first_day() from public, anon, authenticated;

grant execute on function sync_outreach_first_day() to authenticated;

grant execute on function sync_outreach_first_day() to anon;

revoke execute on function sync_outreach_role_type() from public, anon, authenticated;

grant execute on function sync_outreach_role_type() to authenticated;

grant execute on function sync_outreach_role_type() to anon;

revoke execute on function sync_outreach_totals_from_roles() from public, anon, authenticated;

grant execute on function sync_outreach_totals_from_roles() to authenticated;

grant execute on function sync_outreach_totals_from_roles() to anon;

revoke execute on function sync_role_slots_filled() from public, anon, authenticated;

grant execute on function sync_role_slots_filled() to authenticated;

grant execute on function sync_role_slots_filled() to anon;

revoke execute on function sync_single_day_from_outreach() from public, anon, authenticated;

grant execute on function sync_single_day_from_outreach() to authenticated;

grant execute on function sync_single_day_from_outreach() to anon;

revoke execute on function vscore_day_ratio(p_volunteer_id uuid, p_outreach_id uuid) from public, anon, authenticated;

grant execute on function vscore_day_ratio(p_volunteer_id uuid, p_outreach_id uuid) to authenticated;

grant execute on function vscore_day_ratio(p_volunteer_id uuid, p_outreach_id uuid) to anon;

revoke execute on function vscore_event_outcome(p_attended boolean, p_reliability integer, p_clinical integer) from public, anon, authenticated;

grant execute on function vscore_event_outcome(p_attended boolean, p_reliability integer, p_clinical integer) to authenticated;

grant execute on function vscore_event_outcome(p_attended boolean, p_reliability integer, p_clinical integer) to anon;

revoke execute on function vscore_replay() from public, anon, authenticated;

grant execute on function vscore_replay() to authenticated;

grant execute on function vscore_replay() to anon;

