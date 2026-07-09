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

drop policy if exists "profiles_select_authenticated" on profiles;
create policy "profiles_select_authenticated"
  on profiles for select
  to authenticated
  using (true);

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
  license_number text,
  license_verified boolean not null default false,
  skill_tags text[],
  experience_level experience_level,
  availability_days text[],
  bio text,
  v_score numeric not null default 70 check (v_score >= 0 and v_score <= 100),
  events_attended int not null default 0,
  declaration_signed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_volunteer_profiles_updated_at on volunteer_profiles;
create trigger trg_volunteer_profiles_updated_at
  before update on volunteer_profiles
  for each row execute function set_updated_at();

alter table volunteer_profiles enable row level security;

drop policy if exists "volunteer_profiles_select_authenticated" on volunteer_profiles;
create policy "volunteer_profiles_select_authenticated"
  on volunteer_profiles for select
  to authenticated
  using (true);

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

drop policy if exists "applications_insert_own" on applications;
create policy "applications_insert_own"
  on applications for insert
  to authenticated
  with check (volunteer_id = auth.uid());

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
-- Column-level write protection for v_score and match_score.
-- RLS row policies above allow owners to UPDATE their volunteer_profiles /
-- applications rows, but these two specific columns must remain writable
-- only by the serverless API's service-role key. REVOKE at the column level
-- since RLS alone cannot restrict individual columns within an allowed row.
-- ============================================================
revoke update (v_score) on volunteer_profiles from authenticated;
revoke update (match_score) on applications from authenticated;

-- late_cancellation directly drives the V-Score penalty (-8 late vs -2
-- on-time cancellation per CLAUDE.md); cancelled_at is the timestamp used to
-- derive it. A volunteer must not be able to set late_cancellation=false to
-- dodge the bigger penalty, so both columns are service-role write-only.
revoke update (late_cancellation, cancelled_at) on applications from authenticated;

-- license_verified and events_attended must only be set by an
-- organisation/admin verification flow or the serverless /api/vscore
-- pipeline — never directly by the volunteer who owns the row.
revoke update (license_verified, events_attended) on volunteer_profiles from authenticated;
