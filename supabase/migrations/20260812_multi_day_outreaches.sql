-- ============================================================
-- Multi-day outreaches — days, commitments, and per-day attendance.
--
-- NOT YET RUN. Review before executing. Land this AFTER the multi-role
-- screens, so the two slot models are not both in flight at once.
--
-- THE MODEL. A volunteer commits to SPECIFIC DAYS when they apply, and is
-- measured only against those days. A student who commits to 4 Saturdays and
-- attends all 4 has full reliability — they did exactly what they promised.
-- Someone who commits to 20 days and attends 5 has not. Days never committed
-- to are irrelevant: no penalty, no absence, not counted.
--
-- This is why `application_days` exists as a table rather than a count. Days
-- committed is the unit the entire accountability system counts against, so it
-- has to be a first-class row, not a number someone typed.
--
-- SINGLE-DAY IS THE n=1 CASE. Every outreach gets exactly one `outreach_days`
-- row. There is no branching and no "is multi-day" flag — the same lesson as
-- the multi-role mode flag: a boolean that must agree with the existence of
-- rows will eventually disagree with it.
-- ============================================================


-- ============================================================
-- 1. The days an outreach runs
-- ============================================================

create table if not exists outreach_days (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid not null references outreaches(id) on delete cascade,
  day date not null,
  -- Null inherits the outreach's own start/end times, so a campaign with the
  -- same hours every day states them once.
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  constraint outreach_days_unique unique (outreach_id, day)
);

create index if not exists outreach_days_outreach_id_idx on outreach_days(outreach_id);
create index if not exists outreach_days_day_idx on outreach_days(day);


-- ------------------------------------------------------------
-- BACKFILL: one day per existing outreach, from its own date.
-- Must run BEFORE the attendance constraint swap in section 4.
-- ------------------------------------------------------------
insert into outreach_days (outreach_id, day, start_time, end_time)
select o.id, o.date, o.start_time, o.end_time
  from outreaches o
 where not exists (select 1 from outreach_days d where d.outreach_id = o.id)
on conflict (outreach_id, day) do nothing;


-- ------------------------------------------------------------
-- outreaches.date stays the FIRST day, maintained by trigger.
--
-- Every existing query depends on it: the feed's date bound and ordering, the
-- reminder window, the under-subscription stages, the lifecycle close. Keeping
-- it authoritative for "when does this start" means none of them change.
-- ------------------------------------------------------------
create or replace function sync_outreach_first_day() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  affected_outreach uuid := coalesce(new.outreach_id, old.outreach_id);
begin
  update outreaches o
     set date = (select min(d.day) from outreach_days d where d.outreach_id = o.id)
   where o.id = affected_outreach
     and exists (select 1 from outreach_days where outreach_id = affected_outreach);
  return null;
end $$;

drop trigger if exists trg_outreach_days_sync_first on outreach_days;
create trigger trg_outreach_days_sync_first
  after insert or update of day or delete on outreach_days
  for each row execute function sync_outreach_first_day();


-- ============================================================
-- 2. The commitment — which days a volunteer promised
-- ============================================================

create table if not exists application_days (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  outreach_day_id uuid not null references outreach_days(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint application_days_unique unique (application_id, outreach_day_id)
);

create index if not exists application_days_application_id_idx on application_days(application_id);
create index if not exists application_days_outreach_day_id_idx on application_days(outreach_day_id);


-- Backfill: an existing application commits to its outreach's only day.
insert into application_days (application_id, outreach_day_id)
select a.id, d.id
  from applications a
  join outreach_days d on d.outreach_id = a.outreach_id
 where not exists (select 1 from application_days ad where ad.application_id = a.id)
on conflict (application_id, outreach_day_id) do nothing;


-- ------------------------------------------------------------
-- A committed day must belong to the outreach being applied to.
-- Same class of hole as the multi-role role/outreach mismatch.
-- ------------------------------------------------------------
create or replace function assert_day_belongs_to_outreach() returns trigger
language plpgsql security definer set search_path = public as $$
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
end $$;

drop trigger if exists trg_application_days_belong on application_days;
create trigger trg_application_days_belong
  before insert or update on application_days
  for each row execute function assert_day_belongs_to_outreach();


-- ============================================================
-- 3. RLS
-- ============================================================

alter table outreach_days enable row level security;

drop policy if exists outreach_days_select on outreach_days;
create policy outreach_days_select on outreach_days
  for select to authenticated
  using (exists (
    select 1 from outreaches o
     where o.id = outreach_days.outreach_id
       and (o.status <> 'draft' or o.organisation_id = auth.uid())
  ));

drop policy if exists outreach_days_write on outreach_days;
create policy outreach_days_write on outreach_days
  for all to authenticated
  using (exists (
    select 1 from outreaches o
     where o.id = outreach_days.outreach_id and o.organisation_id = auth.uid()
  ))
  with check (exists (
    select 1 from outreaches o
     where o.id = outreach_days.outreach_id and o.organisation_id = auth.uid()
  ));

alter table application_days enable row level security;

-- Visible to the volunteer who made the commitment and to the organisation
-- running the event — the same pair `applications_select_own_or_org` allows.
drop policy if exists application_days_select on application_days;
create policy application_days_select on application_days
  for select to authenticated
  using (exists (
    select 1 from applications a
      join outreaches o on o.id = a.outreach_id
     where a.id = application_days.application_id
       and (a.volunteer_id = auth.uid() or o.organisation_id = auth.uid())
  ));

-- Only the applying volunteer writes their own commitment.
drop policy if exists application_days_write_own on application_days;
create policy application_days_write_own on application_days
  for all to authenticated
  using (exists (
    select 1 from applications a
     where a.id = application_days.application_id and a.volunteer_id = auth.uid()
  ))
  with check (exists (
    select 1 from applications a
     where a.id = application_days.application_id and a.volunteer_id = auth.uid()
  ));


-- ============================================================
-- 4. Per-day attendance — THE DESTRUCTIVE STEP
--
-- `attendance` currently holds one row per (outreach, volunteer), so a single
-- scan covers the whole event. On a month-long campaign that would record
-- someone present for the entire month for scanning once on day one, which
-- defeats the accountability system this project exists to provide.
--
-- ORDER IS CRITICAL AND IS GUARDED. The backfill must populate
-- outreach_day_id for every existing row BEFORE the old unique constraint is
-- dropped and the new one added. The guard raises — aborting the transaction —
-- if any row is still NULL, so a partial backfill cannot silently destroy the
-- uniqueness that protects this table.
-- ============================================================

begin;

alter table attendance
  add column if not exists outreach_day_id uuid references outreach_days(id) on delete cascade;

-- Every existing attendance row belongs to its outreach's only day.
update attendance a
   set outreach_day_id = d.id
  from outreach_days d
 where d.outreach_id = a.outreach_id
   and a.outreach_day_id is null;

-- The guard. Same shape as the district migration's proof step.
do $$
declare
  orphaned int;
begin
  select count(*) into orphaned from attendance where outreach_day_id is null;
  if orphaned > 0 then
    raise exception
      'Backfill left % attendance row(s) with no day — refusing to swap the unique constraint.',
      orphaned;
  end if;
end $$;

alter table attendance alter column outreach_day_id set not null;

alter table attendance drop constraint if exists attendance_outreach_id_volunteer_id_key;

alter table attendance
  add constraint attendance_unique_day unique (outreach_id, volunteer_id, outreach_day_id);

create index if not exists attendance_outreach_day_id_idx on attendance(outreach_day_id);

commit;


-- ============================================================
-- 5. Verification — every count should line up
-- ============================================================

select
  (select count(*) from outreaches)                            as outreaches,
  (select count(*) from outreach_days)                         as outreach_days,
  (select count(*) from applications)                          as applications,
  (select count(*) from application_days)                      as application_days,
  (select count(*) from attendance)                            as attendance_rows,
  (select count(*) from attendance where outreach_day_id is null) as attendance_without_day;

-- Expected on the current data: outreach_days = outreaches (one each),
-- application_days = applications (one each), attendance_without_day = 0.
