-- ============================================================
-- Admin phase, package C — organisation verification.
--
-- ONE PASTE. It creates a BRAND NEW enum type rather than adding a value to an
-- existing one, and a type created inside a transaction may be used inside that
-- same transaction — the "unsafe use of new value" rule only bites on
-- `alter type ... add value`. So the two-paste dance does not apply here.
--
-- WHAT THIS IS FOR. Volunteers judge whether an outreach is real by the
-- organisation behind it. Until now `organisation_profiles.verified` was a
-- boolean nobody could set from anywhere in the app: it was service-role-only
-- with no service-role writer, so it was permanently false for everybody. This
-- gives it a process, evidence, and a human decision behind it.
--
-- DELIBERATELY LIGHTWEIGHT. No type-specific certificate rules, no external
-- registry checks — Ghana has no public API to check against. An admin reads
-- what was submitted and makes a reasonable judgement.
-- ============================================================


-- ============================================================
-- 1. The state
--
-- A boolean cannot express "we looked and said no", "we are waiting", or "this
-- account is suspended", and those are all states an organisation can be in.
--
-- `suspended` and `banned` are in the enum from the start even though nothing
-- sets them until package F (moderation). Adding them later would mean another
-- alter-type-add-value migration, with its own separate paste, for values whose
-- meaning is already decided. The states are ordered by how far through the
-- process they are, not alphabetically.
-- ============================================================

do $$ begin
  create type org_verification_state as enum (
    'unverified',           -- nothing submitted yet
    'documents_submitted',  -- waiting on an admin
    'verified',             -- an admin read it and approved
    'rejected',             -- an admin read it and declined; may resubmit
    'suspended',            -- reversible moderation stop (package F)
    'banned'                -- permanent (package F)
  );
exception when duplicate_object then null; end $$;


-- ============================================================
-- 2. What an organisation submits
--
-- The four contact facts, plus the state and the admin's written reason.
--
-- `official_email` is asked for separately from `contact_email` on purpose:
-- contact_email is the public enquiries address volunteers write to, and it may
-- legitimately be a Gmail. The official one is evidence — an address on the
-- organisation's own domain is a weak but real signal that the domain and the
-- organisation are connected. Neither replaces the other.
--
-- `verification_reason` holds the reason for the LAST decision, which is what
-- the organisation needs to see so it can fix and resubmit. The full history
-- of every decision lives in admin_actions and is never overwritten.
-- ============================================================

alter table organisation_profiles
  add column if not exists official_email text,
  add column if not exists physical_address text,
  add column if not exists contact_person text,
  add column if not exists verification_state org_verification_state not null default 'unverified',
  add column if not exists verification_reason text,
  add column if not exists verification_decided_at timestamptz,
  add column if not exists verification_submitted_at timestamptz;

comment on column organisation_profiles.official_email is
  'An address on the organisation''s own domain, asked for as verification evidence. NOT the same as contact_email, which is the public enquiries address and may be a free webmail account.';


-- ============================================================
-- 3. `verified` becomes DERIVED, and can never disagree again
--
-- Owner's decision, 2026-08-21: derive it and keep it, rather than replacing
-- it. Eight places read the boolean — two screens, a public profile, the
-- discovery view, the match endpoint and two type files — and deriving keeps
-- every one of them working untouched while `verification_state` becomes the
-- truth. Replacing would mean editing all eight at once and risking a miss.
--
-- A STORED GENERATED COLUMN, not a trigger. The reasoning is the one CLAUDE.md
-- already gives about the multi-role flag: a boolean that must agree with
-- something else will eventually disagree with it, unless the database is the
-- one computing it. A trigger is more forgiving and can be bypassed; generated
-- cannot drift.
--
-- THE CONSEQUENCE TO DESIGN AROUND: nothing may ever write `verified` again.
-- Postgres rejects a write to a generated column outright. Today the column is
-- service-role-only and has no writer at all, so nothing breaks — and every
-- future approval is one write to one column with one meaning.
--
-- The view has to go first: a column cannot be dropped while a view selects it.
-- ============================================================

drop view if exists public_organisation_profiles;

alter table organisation_profiles drop column if exists verified;
alter table organisation_profiles
  add column verified boolean
  generated always as (verification_state = 'verified') stored;

-- Recreated exactly as it was, plus the two new public-facing facts. It still
-- selects op.verified and needs no other change.
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
    op.contact_email,
    op.contact_phone,
    op.show_gallery
  from profiles p
  join organisation_profiles op on op.id = p.id
  where p.role = 'organisation';

revoke all on public_organisation_profiles from anon;
grant select on public_organisation_profiles to authenticated;


-- ============================================================
-- 4. Registration numbers — MANY per organisation, not four columns
--
-- The brief names four example schemes and says the form must accept others.
-- Four columns would mean a migration every time a new scheme appears, and
-- would force every organisation into the same four shapes.
--
-- No uniqueness across organisations: two branches of one NGO can legitimately
-- quote the same parent registration, and enforcing otherwise would reject the
-- honest case to catch a dishonest one an admin will see anyway.
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

-- The organisation sees its own; an admin sees all. Nobody else — a
-- registration number is not a public fact about an organisation, and
-- volunteers judge legitimacy by the verified badge rather than by reading
-- numbers they cannot check.
drop policy if exists "organisation_registrations_select" on organisation_registrations;
create policy "organisation_registrations_select"
  on organisation_registrations for select
  to authenticated
  using (organisation_id = auth.uid() or is_admin());

-- Written only by /api/organisation-verification on the service-role key, so
-- the submission arrives as one consistent set rather than a half-written one.
revoke insert, update, delete on organisation_registrations from authenticated;
revoke all on organisation_registrations from anon;


-- ============================================================
-- 5. Organisation documents — private, exactly like credentials
--
-- Stores the Cloudinary PUBLIC_ID and never a URL, for the reason package B
-- established: a stored URL is a permanent fetchable address, and that is the
-- thing that leaks. Read through /api/document-url, which authorises first and
-- mints a link that expires.
-- ============================================================

create table if not exists organisation_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation_profiles(id) on delete cascade,
  /** Cloudinary public_id of an `authenticated` raw asset. NEVER a URL. */
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
-- 6. THE BLOCK, AND IT IS REAL
--
-- "Only verified organisations may post outreaches" is enforced at the
-- database, not with a disabled button — the same standard the clinical gate
-- is held to. A disabled button is a suggestion; this is the rule.
--
-- It covers INSERT and it covers publishing, because those are two different
-- ways to put an event in front of volunteers. An unverified organisation may
-- still write and keep DRAFTS: nothing about a draft is visible to anyone else,
-- and refusing them outright would mean an organisation waiting on review
-- cannot prepare anything, which serves nobody.
--
-- `suspended` and `banned` fall out of this for free — neither equals
-- 'verified' — which is most of package F's outreach rule already in place.
-- ============================================================

create or replace function refuse_outreach_from_unverified_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state org_verification_state;
begin
  -- Only the transitions that expose an event to volunteers are checked. An
  -- UPDATE that leaves status alone (editing a draft, or an already-open event
  -- of a since-suspended org) is none of this trigger's business.
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
-- 7. Verification — run this after, and read the numbers
--
-- Expected on a first run:
--   state_column           1
--   verified_is_generated  1   (the boolean is derived and unwritable)
--   registrations_table    1
--   documents_table        1
--   block_trigger          1
--   view_present           1
--   verified_orgs          0   (nobody has been approved yet)
--   orgs_awaiting          0   (nobody has submitted yet)
--
-- NOTE: verified_orgs = 0 means every existing organisation has just lost the
-- ability to publish. That is the intended effect and the whole point of the
-- package — approve yours through the admin queue.
-- ============================================================

select
  (select count(*) from information_schema.columns
    where table_name = 'organisation_profiles' and column_name = 'verification_state') as state_column,
  (select count(*) from information_schema.columns
    where table_name = 'organisation_profiles' and column_name = 'verified'
      and is_generated = 'ALWAYS') as verified_is_generated,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'organisation_registrations') as registrations_table,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'organisation_documents') as documents_table,
  (select count(*) from pg_trigger
    where tgname = 'trg_outreaches_require_verified_org') as block_trigger,
  (select count(*) from information_schema.views
    where table_schema = 'public' and table_name = 'public_organisation_profiles') as view_present,
  (select count(*) from organisation_profiles where verification_state = 'verified') as verified_orgs,
  (select count(*) from organisation_profiles where verification_state = 'documents_submitted') as orgs_awaiting;
