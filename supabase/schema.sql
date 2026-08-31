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
  create type volunteer_category as enum ('doctor', 'nurse', 'midwife', 'pharmacist', 'student', 'first_aider', 'other');
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
      or (
        status = 'pending'
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
  -- Moderation first, and it allows no draft exception: an organisation
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
  where p.role = 'organisation';

revoke all on public_organisation_profiles from anon;
grant select on public_organisation_profiles to authenticated;

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
  contact_phone
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
  flyer_url
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
  website,
  contact_email,
  contact_phone
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
  flyer_url
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
