-- ============================================================
-- Admin phase, package F — moderation.
--
-- ONE PASTE. It creates a new enum TYPE (allowed inside a transaction — only
-- `alter type ... add value` is not) and uses it in the same script.
--
-- GOVERNING PRINCIPLE, and everything below follows from it: SUSPENSION STOPS
-- FUTURE ACTIVITY AND NEVER REWRITES THE PAST. Attendance that happened
-- happened. Reviews that were written stay written. A V-Score keeps meaning
-- what it meant. What stops is what has not happened yet.
--
-- ============================================================
-- A DEPARTURE FROM THE PLAN, ARGUED
--
-- `docs/ADMIN_PHASE_PLAN.md` puts `suspended` and `banned` inside
-- `org_verification_state`, and package C duly added them there. Using them
-- would be a mistake, and this migration does not.
--
-- Suspending a VERIFIED organisation would overwrite the very column that
-- records that we checked their documents. Unsuspending could then not restore
-- it: the reinstating admin would have to guess whether this organisation had
-- been verified before, or we would have to store the previous value in a
-- second column — which is the "a value that must agree with something else
-- will eventually disagree with it" problem the same plan warns about two
-- sections earlier.
--
-- They are two independent facts. "We checked their registration" and "they are
-- currently allowed to operate" can each be true or false without the other.
-- So moderation is its own column, on `profiles`, which also means ONE
-- implementation covering volunteers and organisations instead of two.
--
-- The two enum values stay in `org_verification_state`, unused. Postgres cannot
-- remove an enum value, and an unused one costs nothing.
-- ============================================================

do $$ begin
  create type moderation_state as enum (
    'active',      -- normal. Everyone starts here.
    'suspended',   -- reversible stop. The default moderation action.
    'banned'       -- permanent.
  );
exception when duplicate_object then null; end $$;


-- ============================================================
-- 1. The columns, on `profiles` so one implementation covers both roles
--
-- Server-only: absent from the UPDATE grant list, so a client cannot lift its
-- own suspension. That is the same posture as `role` and for the same reason.
--
-- `moderation_reason` is the reason for the CURRENT state and is cleared on
-- reinstatement. The history of every moderation decision is in admin_actions
-- and is never overwritten.
-- ============================================================

alter table profiles
  add column if not exists moderation_state moderation_state not null default 'active',
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz;

comment on column profiles.moderation_state is
  'Whether this account may do anything NEW. Deliberately separate from organisation verification: "we checked their documents" and "they are currently allowed to operate" are independent facts, and folding them together would make a suspension erase a verification that could not then be restored.';


-- ============================================================
-- 2. A suspended or banned ORGANISATION cannot publish
--
-- The verification trigger from package C already refuses an unverified
-- organisation. It has to refuse a suspended one too, and this is why
-- moderation being a separate column needs a deliberate second check rather
-- than getting one for free.
--
-- Drafts stay allowed for the unverified case, as before. They are NOT allowed
-- for a suspended one: an organisation waiting on review is preparing to
-- operate, while a suspended one has been told to stop.
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
  select moderation_state into v_moderation from profiles where id = new.organisation_id;

  if v_moderation is distinct from 'active' then
    raise exception
      'This organisation is suspended and cannot create or publish outreaches.'
      using errcode = 'check_violation';
  end if;

  -- Everything below is the verification rule, unchanged from package C.
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
-- 3. A suspended or banned VOLUNTEER cannot apply
--
-- Their existing applications are withdrawn by /api/moderation, which also
-- hands the freed places to the waitlist. This trigger stops NEW ones, which
-- the endpoint cannot do because it does not run when a volunteer applies.
--
-- Deliberately only on INSERT. An UPDATE by a suspended volunteer is them
-- CANCELLING something, and a suspended person must always be able to withdraw
-- — refusing that would trap them in commitments they have been barred from
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
-- 4. The grant list, restated
--
-- `profiles`' UPDATE grant is restated in full here rather than added to,
-- because "revoke the table, grant back the columns" is how this file expresses
-- column protection everywhere else, and a bare `grant update (col)` on top of
-- a previous revoke would be easy to misread as widening. None of the three
-- moderation columns appears: a client that could clear its own suspension
-- would make moderation advisory.
-- ============================================================

revoke update on profiles from authenticated;
grant update (
  full_name,
  phone,
  email,
  region,
  district,
  avatar_url
) on profiles to authenticated;


-- ============================================================
-- 5. Verification — run this after, and read the numbers
--
-- Expected on a first run:
--   moderation_column     1
--   client_can_moderate   0
--   org_trigger           1
--   application_trigger   1
--   suspended_accounts    0
-- ============================================================

select
  (select count(*) from information_schema.columns
    where table_name = 'profiles' and column_name = 'moderation_state') as moderation_column,
  (select count(*) from information_schema.column_privileges
    where table_name = 'profiles' and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
      and column_name in ('moderation_state', 'moderation_reason', 'moderated_at')) as client_can_moderate,
  (select count(*) from pg_trigger
    where tgname = 'trg_outreaches_require_verified_org') as org_trigger,
  (select count(*) from pg_trigger
    where tgname = 'trg_applications_refuse_suspended') as application_trigger,
  (select count(*) from profiles where moderation_state <> 'active') as suspended_accounts;
