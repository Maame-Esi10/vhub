-- V-HUB Supabase schema
-- Backend is Supabase ONLY (Postgres + Auth + RLS). Never Firebase.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DO blocks for enums.
-- Paste directly into the Supabase SQL editor.

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- Enums
-- ============================================================
do $$ begin
  create type profile_role as enum ('volunteer', 'organisation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type volunteer_category as enum ('nurse', 'pharmacy_student', 'first_aider', 'doctor', 'midwife', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type experience_level as enum ('beginner', 'intermediate', 'experienced');
exception when duplicate_object then null; end $$;

do $$ begin
  create type outreach_role_type as enum ('clinical', 'support');
exception when duplicate_object then null; end $$;

do $$ begin
  create type outreach_status as enum ('draft', 'open', 'closed', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_type as enum ('quick_join', 'full');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_status as enum ('pending', 'accepted', 'rejected', 'waitlisted', 'cancelled');
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
drop policy if exists "profiles_select_authenticated" on profiles;
create policy "profiles_select_authenticated"
  on profiles for select
  to authenticated
  using (
    auth.uid() = id
    or exists (
      select 1 from applications a
      join outreaches o on o.id = a.outreach_id
      where a.volunteer_id = profiles.id
        and o.organisation_id = auth.uid()
    )
    or exists (
      select 1 from applications a
      join outreaches o on o.id = a.outreach_id
      where o.organisation_id = profiles.id
        and a.volunteer_id = auth.uid()
    )
  );

drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);

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
drop policy if exists "volunteer_profiles_select_authenticated" on volunteer_profiles;
create policy "volunteer_profiles_select_authenticated"
  on volunteer_profiles for select
  to authenticated
  using (
    auth.uid() = id
    or exists (
      select 1 from applications a
      join outreaches o on o.id = a.outreach_id
      where a.volunteer_id = volunteer_profiles.id
        and o.organisation_id = auth.uid()
    )
    or exists (
      select 1 from applications a
      join outreaches o on o.id = a.outreach_id
      where o.organisation_id = volunteer_profiles.id
        and a.volunteer_id = auth.uid()
    )
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
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_organisation_profiles_updated_at on organisation_profiles;
create trigger trg_organisation_profiles_updated_at
  before update on organisation_profiles
  for each row execute function set_updated_at();

alter table organisation_profiles enable row level security;

-- Deliberately broad (using (true)), unlike profiles_select_authenticated
-- above: organisation_profiles holds no PII (org_name, org_type,
-- description, website, verified -- phone/email live on profiles, which IS
-- locked down). Volunteers need to browse organisation info before applying
-- to their outreaches (Figma "Organization Public Profile" flow), so do not
-- tighten this to a row-scoped policy.
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slots_filled_le_total check (slots_filled <= slots_total)
);

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
  using (status <> 'draft' or organisation_id = auth.uid());

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
create policy "applications_insert_own"
  on applications for insert
  to authenticated
  with check (
    volunteer_id = auth.uid()
    and exists (
      select 1 from outreaches o
      where o.id = applications.outreach_id
        and o.status = 'open'
        and (
          o.role_type is distinct from 'clinical'
          or exists (
            select 1 from volunteer_profiles vp
            where vp.id = auth.uid()
              and vp.verification_status = 'verified'
          )
        )
    )
  );

-- Volunteers may only update their own row, and only to cancel it (status ->
-- 'cancelled'); they may never set status to accepted/rejected/waitlisted
-- themselves. Orgs may manage full status transitions on applications to
-- their own outreaches (pending/accepted/rejected/waitlisted).
drop policy if exists "applications_update_own_or_org" on applications;

drop policy if exists "applications_update_own_cancel" on applications;
create policy "applications_update_own_cancel"
  on applications for update
  to authenticated
  using (volunteer_id = auth.uid())
  with check (
    volunteer_id = auth.uid()
    and status = 'cancelled'
  );

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
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outreach_id, volunteer_id)
);

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
    or exists (
      select 1 from outreaches o
      where o.id = event_reviews.outreach_id
        and o.organisation_id = auth.uid()
    )
  );

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
  where p.role = 'volunteer';

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
    op.verified
  from profiles p
  join organisation_profiles op on op.id = p.id
  where p.role = 'organisation';

revoke all on public_organisation_profiles from anon;
grant select on public_organisation_profiles to authenticated;

-- ============================================================
-- Column-level write protection.
--
-- RLS row policies above decide WHICH rows a user may update; they cannot
-- restrict which columns within an allowed row. Several columns must stay
-- writable only by the serverless API's service-role key (which bypasses all
-- of this):
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
-- ============================================================

revoke update on volunteer_profiles from authenticated;
grant update (
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
grant update (status, cancellation_reason) on applications to authenticated;

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
  status
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

revoke insert on organisation_profiles from authenticated;
grant insert (
  id,
  org_name,
  org_type,
  description,
  website
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
  status
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
  motivation
) on applications to authenticated;
