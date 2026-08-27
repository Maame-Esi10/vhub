-- ============================================================
-- Admin phase, package G — disputes.
--
-- ONE PASTE. New enum TYPES are created here and used in the same script,
-- which is allowed; only `alter type ... add value` is not.
--
-- WHAT A VOLUNTEER CAN DISPUTE. Two things, and only two, because they are the
-- two that cost them something they cannot otherwise get back:
--
--   1. Being marked absent when they say they were there.
--   2. A review they believe is unfair.
--
-- THE V-SCORE IS NOT TOUCHED BY ANY OF THIS. Upholding a dispute records the
-- correction and tells both parties; it does not recompute a score. Making the
-- V-Score derivable and replayable is a separate change to something already
-- built, working and tested, and it is its own approval gate — see
-- docs/ADMIN_PHASE_PLAN.md. Nothing here depends on how the score is stored,
-- which is exactly why disputes can ship first.
-- ============================================================

do $$ begin
  create type dispute_type as enum ('attendance', 'review');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispute_status as enum ('open', 'upheld', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;


-- ============================================================
-- 1. The table
--
-- `statement` is the volunteer's own account, in their words, and it is
-- required. A dispute with no statement is a complaint an admin cannot judge.
--
-- `resolution` is the admin's written reason, and it is what both parties are
-- shown. `resolved_by` can go null if that admin's account is ever deleted —
-- the dispute outlives them, the same rule as the audit trail.
--
-- outreach_day_id is nullable and only meaningful for an attendance dispute:
-- attendance is per day, so "I was marked absent" has to name WHICH day or an
-- admin cannot look up the evidence.
-- ============================================================

create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references profiles(id) on delete cascade,
  outreach_id uuid not null references outreaches(id) on delete cascade,
  type dispute_type not null,
  /** Which day was disputed. Attendance is per day; a dispute that does not say which is unjudgeable. */
  outreach_day_id uuid references outreach_days(id) on delete set null,
  statement text not null check (length(btrim(statement)) > 0),
  status dispute_status not null default 'open',
  resolution text,
  resolved_by uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ONE OPEN DISPUTE OF EACH KIND PER EVENT. A volunteer may dispute attendance
-- and the review of the same outreach separately — they are different
-- complaints — but re-filing the same one while it is still open is noise a
-- queue does not need. A partial unique index rather than a constraint,
-- because a resolved dispute must not block a later, genuinely new one.
create unique index if not exists disputes_one_open_per_kind
  on disputes (volunteer_id, outreach_id, type)
  where status = 'open';

create index if not exists idx_disputes_open
  on disputes (status, created_at);

alter table disputes enable row level security;

-- Three parties can see a dispute, and each for a different reason: the
-- volunteer raised it, the organisation is the subject of it, and an admin
-- decides it. Nobody else.
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

-- The volunteer raises their own. Deliberately a client insert rather than an
-- endpoint: nothing here needs a secret, and the columns that matter
-- (`status`, `resolution`, `resolved_by`) are withheld by the grant list
-- below, so the worst a crafted call can do is file a dispute the caller was
-- always entitled to file.
drop policy if exists "disputes_insert_own" on disputes;
create policy "disputes_insert_own"
  on disputes for insert
  to authenticated
  with check (volunteer_id = auth.uid());

-- Withdrawing is the only client-side change. `status` is NOT in the update
-- grant list, so this policy alone cannot move it — the two together allow
-- exactly nothing until the grant below is read alongside.
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
-- `withdrawn_at` does not exist: withdrawing sets the statement aside by
-- deleting nothing and changing nothing an admin relies on. The volunteer may
-- edit their own statement while it is still open, which is the honest
-- affordance — "I explained that badly" is a real thing to want.
grant update (statement) on disputes to authenticated;


-- ============================================================
-- 2. The evidence an admin has to be able to read
--
-- An attendance dispute is judged on the record: did they scan, what did the
-- silent location check return, and what did the organisation mark? All three
-- live in tables scoped to "the volunteer or their organisation", and an admin
-- is neither. Without these clauses the dispute screen would show a statement
-- and nothing to weigh it against.
-- ============================================================

drop policy if exists "attendance_select_own_or_org" on attendance;
create policy "attendance_select_own_or_org"
  on attendance for select
  to authenticated
  using (
    volunteer_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from outreaches o
      where o.id = attendance.outreach_id and o.organisation_id = auth.uid()
    )
  );

drop policy if exists "event_reviews_select_org_or_volunteer" on event_reviews;
create policy "event_reviews_select_org_or_volunteer"
  on event_reviews for select
  to authenticated
  using (
    volunteer_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from outreaches o
      where o.id = event_reviews.outreach_id and o.organisation_id = auth.uid()
    )
  );


-- ============================================================
-- 3. Verification — run this after, and read the numbers
--
-- Expected on a first run:
--   disputes_table        1
--   one_open_index        1
--   client_can_resolve    0   (status/resolution are not client-writable)
--   admin_reads_attendance 1
--   admin_reads_reviews    1
--   open_disputes         0
-- ============================================================

select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'disputes') as disputes_table,
  (select count(*) from pg_indexes
    where tablename = 'disputes' and indexname = 'disputes_one_open_per_kind') as one_open_index,
  (select count(*) from information_schema.column_privileges
    where table_name = 'disputes' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE')
      and column_name in ('status', 'resolution', 'resolved_by', 'resolved_at')) as client_can_resolve,
  (select count(*) from pg_policies
    where tablename = 'attendance' and policyname = 'attendance_select_own_or_org'
      and qual like '%is_admin%') as admin_reads_attendance,
  (select count(*) from pg_policies
    where tablename = 'event_reviews' and policyname = 'event_reviews_select_org_or_volunteer'
      and qual like '%is_admin%') as admin_reads_reviews,
  (select count(*) from disputes where status = 'open') as open_disputes;
