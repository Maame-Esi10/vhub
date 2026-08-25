-- ============================================================
-- Admin phase, package A — PASTE 2 OF 2. Run 20260825a first.
--
-- Three things, in this order, and the middle one is the important one:
--
--   1. is_admin() — the role test, written once so no policy ever spells it
--      out again.
--   2. The escalation path that paste 1 opens, closed. See section 2; this
--      is not optional and must not be split off into a later package.
--   3. admin_actions — the audit trail, built BEFORE the first admin feature
--      rather than after it. An admin decision shipped without the row that
--      records it is a decision with no evidence behind it, and history
--      cannot be backfilled.
--
-- Idempotent: every create is `or replace` / `if not exists`, so a re-run is
-- safe. Run it as ONE paste; it contains no transaction control of its own.
-- ============================================================


-- ============================================================
-- 1. is_admin()
--
-- security definer, because a policy that has to read `profiles` to decide
-- who may read `profiles` is a recursion cycle (SQLSTATE 42P17) — the same
-- trap already documented for is_related_via_application(), and the same
-- cure: Postgres never inlines a security definer body.
--
-- The default argument is auth.uid(), so a policy just writes is_admin().
-- Passing an explicit uid is for server-side callers checking somebody else.
--
-- search_path is pinned: without it, a caller could put a fake `profiles`
-- table in pg_temp and a security definer function would read that instead.
-- ============================================================

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

-- Same reasoning as is_related_via_application: this is exposed as
-- rpc/is_admin and returns a single boolean about a role that is already
-- visible on any profile row the caller can read. Not a new disclosure.
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;


-- ============================================================
-- 2. THE HOLE PASTE 1 OPENS, AND ITS CLOSURE
--
-- profiles.role is described everywhere in this project as "immutable after
-- signup", and that is true of UPDATE: `role` is absent from the client's
-- UPDATE grant list, so a PATCH is refused with 42501 before RLS is even
-- consulted. That lock is untouched here and still holds.
--
-- INSERT is a different story, and it is the one that matters now. The
-- insert path is deliberately unrestricted — useSignUp and useAuthGuard's
-- bootstrap both create the profiles row FROM THE CLIENT — and
-- profiles_insert_own only ever checked `auth.uid() = id`. The role in that
-- insert has always been the client's to choose. Until paste 1 the worst
-- available choice was 'organisation', which is a role anyone can register
-- as anyway. From paste 1 onwards 'admin' is a legal value of the enum, and
-- a crafted signup — register, ignore the app, POST /rest/v1/profiles with
-- role='admin' — would have been a working privilege escalation.
--
-- Nothing in the app does this and nothing could by accident; the app only
-- ever sends 'volunteer' or 'organisation'. It is a hole in the API surface,
-- not in a screen.
--
-- So the with-check gains one clause. Admins are created by the statement at
-- the bottom of this file, running as postgres, which bypasses RLS entirely
-- — which is exactly the "creation is database-only" rule the plan asks for,
-- now enforced by the database rather than by convention.
-- ============================================================

drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id and role <> 'admin');


-- ============================================================
-- 3. admin_actions — the audit trail
--
-- One row per admin decision: who, when, what they touched, what they did,
-- and why. Written ONLY by the serverless API on the service-role key, the
-- same posture as v_score and verification_status.
--
-- actor_id is nullable and `on delete set null` ON PURPOSE. An audit row has
-- to outlive the account that wrote it — cascading would let deleting an
-- admin erase the record of everything they had decided. actor_email is a
-- snapshot taken at write time, so a row whose actor is gone still names a
-- person.
--
-- target_type is a CHECK rather than an enum, deliberately: later packages
-- add target kinds, and extending a check constraint is a plain drop-and-add
-- inside one transaction, whereas extending an enum is the two-paste dance
-- this migration had to be split for. The list starts wide enough to cover
-- packages C through J.
--
-- `action` is free text, not a constraint. Every package adds verbs, they are
-- read by humans rather than branched on, and a constraint listing them would
-- need editing on every package for no protection.
--
-- reason may be null (some actions are not decisions — viewing a document,
-- adding a source) but may never be blank: a written reason that is one space
-- is worse than none, because it looks answered.
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
    'policy'
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

-- "Everything ever done to this organisation / this volunteer" — the history
-- strip that packages C, D, F and G all need on a detail screen.
create index if not exists idx_admin_actions_target
  on admin_actions (target_type, target_id, created_at desc);

alter table admin_actions enable row level security;

-- Readable by admins and nobody else. There is deliberately NO insert, update
-- or delete policy: the service role bypasses RLS, so the only writer is the
-- API, and a client write is refused twice over (no policy, and the revoke
-- below).
drop policy if exists "admin_actions_select_admin" on admin_actions;
create policy "admin_actions_select_admin"
  on admin_actions for select
  to authenticated
  using (is_admin());

-- Supabase grants `authenticated` table-level privileges on everything in
-- public by default, so the absence of a policy is not on its own the whole
-- lock. Revoked as a whole table with nothing granted back — the same
-- treatment as attendance and outreach_checkin_codes — and it then fails with
-- the clearer 42501 "permission denied for table" rather than an RLS
-- violation.
revoke insert, update, delete on admin_actions from authenticated;
revoke all on admin_actions from anon;


-- ============================================================
-- 4. Append-only, enforced against the API too
--
-- RLS and grants stop clients. They do not stop the service role, which
-- bypasses both — and the service role is precisely what writes this table.
-- An audit trail the API can quietly rewrite is not evidence of anything, so
-- the refusal is a trigger, which applies to every role.
--
-- A correction to an audit row is a NEW row saying what was corrected. That
-- is what an audit trail is.
--
-- postgres/supabase_admin are exempt for one honest reason: anyone holding
-- that role can drop this trigger in a second statement anyway, so refusing
-- them would buy no safety and would cost a drop-and-recreate every time test
-- rows are cleared during a device round.
-- ============================================================

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
-- 5. Verification — run this after, and read the numbers
--
-- Expected on a first run:
--   admin_enum_value          1   ('admin' is a legal role)
--   is_admin_present          1
--   audit_table_present       1
--   append_only_trigger       1
--   client_can_write_audit    0   (insert + update + delete grants, summed)
--   role_in_update_grant      0   (role still not client-updatable)
--   insert_policy_bars_admin  1   (the with-check names 'admin')
--   admin_accounts            0   (nobody is an admin yet — see section 6)
-- ============================================================

select
  (select count(*) from pg_enum e
     join pg_type t on t.oid = e.enumtypid
    where t.typname = 'profile_role' and e.enumlabel = 'admin') as admin_enum_value,
  (select count(*) from pg_proc where proname = 'is_admin') as is_admin_present,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'admin_actions') as audit_table_present,
  (select count(*) from pg_trigger
    where tgname = 'trg_admin_actions_append_only') as append_only_trigger,
  (select count(*) from information_schema.table_privileges
    where table_name = 'admin_actions' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) as client_can_write_audit,
  (select count(*) from information_schema.column_privileges
    where table_name = 'profiles' and grantee = 'authenticated'
      and privilege_type = 'UPDATE' and column_name = 'role') as role_in_update_grant,
  (select count(*) from pg_policies
    where tablename = 'profiles' and policyname = 'profiles_insert_own'
      and with_check like '%admin%') as insert_policy_bars_admin,
  (select count(*) from profiles where role = 'admin') as admin_accounts;


-- ============================================================
-- 6. Creating an admin — database only, and there is no other way
--
-- Register through the app as a normal volunteer or organisation, then run
-- ONE statement here with the email you registered with. It runs as postgres,
-- which bypasses both RLS and the column grants, and it is the only path that
-- exists: no invite flow, no promotion screen, and no "Sign up as Admin" on
-- the welcome screen.
--
-- Kept commented so a re-run of this file never silently promotes anybody.
-- ============================================================

-- update profiles set role = 'admin' where email = 'you@example.com';
