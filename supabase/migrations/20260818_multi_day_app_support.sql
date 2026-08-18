-- ============================================================
-- Multi-day, part 2: making the app able to USE the tables part 1 created.
--
-- RUN IT AS ONE PASTE. No transaction control of its own — the Supabase SQL
-- editor wraps the whole file in one transaction, and every statement here is
-- idempotent (`create or replace`, `if not exists`, `on conflict do nothing`),
-- so a re-run is safe.
--
-- WHY THIS EXISTS. 20260812_multi_day_outreaches.sql created outreach_days,
-- application_days and per-day attendance, and backfilled the rows that existed
-- on 2026-08-15. Nothing has maintained them since, because no app code writes
-- them. Three consequences, in order of severity:
--
--   1. CHECK-IN IS BROKEN RIGHT NOW. `attendance.outreach_day_id` is NOT NULL
--      and the unique constraint is now (outreach_id, volunteer_id,
--      outreach_day_id). /api/checkin still upserts without a day and still
--      names the OLD two-column conflict target, so every scan and every
--      organiser attendance decision fails — the insert violates NOT NULL, and
--      the ON CONFLICT clause no longer matches any constraint (42P10).
--   2. Every outreach created since 2026-08-15 has NO outreach_days row at all,
--      so there is no day for attendance to point at even once (1) is fixed.
--   3. Every application made since then has no application_days row, so
--      `days_committed` — the denominator the whole accountability model counts
--      against — is zero.
--
-- (2) and (3) are fixed here, in the database, by making the invariant
-- structural rather than something client code has to remember. (1) is fixed in
-- api/src/app/api/checkin/route.ts, which needs the day this file guarantees.
-- ============================================================


-- ============================================================
-- 1. Day-level times mean "override", so equal copies must become NULL
--
-- `outreach_days.start_time` / `end_time` are NULL to inherit the outreach's
-- own hours — that is how "a campaign with the same hours every day states them
-- once" works. The part-1 backfill nonetheless COPIED the outreach's times into
-- every day row, because at that moment a copy and an inheritance were
-- indistinguishable.
--
-- They stop being indistinguishable the moment an organisation edits the
-- event's hours: the copy would sit there as a stale override and quietly win
-- over the new value, so the outreach would say 9am and the day would say 8am.
-- Nulling the copies is provably lossless — they are equal to the parent's
-- values by construction — and it restores one meaning for the column.
-- ============================================================

update outreach_days d
   set start_time = null,
       end_time   = null
  from outreaches o
 where o.id = d.outreach_id
   and d.start_time is not distinct from o.start_time
   and d.end_time   is not distinct from o.end_time
   and (d.start_time is not null or d.end_time is not null);


-- ============================================================
-- 2. Every outreach has at least one day, from the moment it exists
--
-- Not left to the client. "Insert the outreach, then insert its first day" is
-- two round trips and therefore two transactions, and a failure between them
-- would produce exactly the dayless outreach that breaks check-in. A trigger
-- cannot be forgotten and cannot half-run.
--
-- The wizard adds days 2..n afterwards; `outreaches.date` is then re-derived as
-- min(day) by trg_outreach_days_sync_first, so the first day stays the first
-- day however they arrive.
-- ============================================================

create or replace function create_default_outreach_day() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Times deliberately left NULL: see section 1. The day inherits the
  -- outreach's hours rather than freezing a copy of them.
  insert into outreach_days (outreach_id, day)
  values (new.id, new.date)
  on conflict (outreach_id, day) do nothing;
  return null;
end $$;

drop trigger if exists trg_outreaches_default_day on outreaches;
create trigger trg_outreaches_default_day
  after insert on outreaches
  for each row execute function create_default_outreach_day();


-- ============================================================
-- 3. Moving a single-day outreach's date moves its day
--
-- Without this, editing the date of an ordinary one-day outreach leaves the
-- `outreach_days` row on the OLD date. Nothing would look wrong on any screen
-- that reads `outreaches.date`, but attendance and every commitment would be
-- filed against a day that is no longer when the event happens.
--
-- Only when there is exactly ONE day. With several, the day list is the
-- organisation's explicit choice and `outreaches.date` is derived from it, so
-- rewriting the set from a single scalar would destroy information.
--
-- THE `is distinct from` GUARDS ARE WHAT STOP AN INFINITE LOOP, not tidiness.
-- This trigger writes outreach_days; trg_outreach_days_sync_first then writes
-- outreaches.date; that write re-fires this trigger. Each guard makes the
-- second pass update ZERO rows, so no trigger fires a third time.
-- ============================================================

create or replace function sync_outreach_first_day() returns trigger
language plpgsql security definer set search_path = public as $$
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
end $$;

create or replace function sync_single_day_from_outreach() returns trigger
language plpgsql security definer set search_path = public as $$
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
end $$;

drop trigger if exists trg_outreaches_sync_single_day on outreaches;
create trigger trg_outreaches_sync_single_day
  after update of date on outreaches
  for each row execute function sync_single_day_from_outreach();


-- ============================================================
-- 4. A day volunteers have committed to cannot be deleted
--
-- `application_days.outreach_day_id` cascades on delete, so removing a day from
-- an event would silently erase every promise made against it. Those rows are
-- the evidence a V-Score is derived from — the same reason
-- trg_outreaches_refuse_used_delete already refuses to delete an outreach
-- anyone has touched.
--
-- This is not a trap for an organisation whose day 3 was rained off. They do
-- not need to delete it: an unresolved day simply does not count, exactly as an
-- unrated review moves nothing. Keeping the day and resolving nobody on it
-- costs no volunteer anything.
-- ============================================================

create or replace function refuse_committed_day_delete() returns trigger
language plpgsql security definer set search_path = public as $$
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
end $$;

drop trigger if exists trg_outreach_days_refuse_committed_delete on outreach_days;
create trigger trg_outreach_days_refuse_committed_delete
  before delete on outreach_days
  for each row execute function refuse_committed_day_delete();

-- The outreach itself is still deletable when nobody has touched it: deleting
-- an outreach cascades to its days, and by then trg_outreaches_refuse_used_delete
-- has already established there are no applications, so no commitments exist.


-- ============================================================
-- 5. save_outreach() learns about days
--
-- Same contract as p_roles: NULL leaves the days alone (the common save, where
-- only the details changed), an ARRAY replaces the set wholesale.
--
-- THREE RULES, EACH PROTECTING A COMMITMENT:
--
--   1. Days that survive the edit are LEFT ALONE rather than deleted and
--      re-inserted. Their ids are what application_days points at, and
--      re-creating an identical day would cascade every commitment on it into
--      nothing.
--   2. A ONE-DAY OUTREACH MOVING TO ONE DIFFERENT DAY IS A RESCHEDULE, and the
--      row is moved in place. Rescheduling an event people have applied to has
--      always been allowed, and it must stay allowed — treating it as "remove
--      day A, add day B" would hit the commitment refusal and lock every
--      organisation out of changing their own date.
--   3. Anything else is a genuine change to the SET of days, where removing a
--      day volunteers promised is refused by trg_outreach_days_refuse_committed_delete.
--
-- `outreaches.date` is derived from p_days rather than taken from p_date when
-- days are given, so the two can never disagree — a client that sent a date
-- outside its own day list would otherwise produce an outreach whose first day
-- is not its date.
-- ============================================================

create or replace function save_outreach(
  p_outreach_id      uuid,
  p_title            text,
  p_description      text,
  p_date             date,
  p_start_time       time,
  p_end_time         time,
  p_region           text,
  p_district         text,
  p_location_name    text,
  p_required_skills  text[],
  p_required_category text,
  p_role_type        outreach_role_type,
  p_slots_total      int,
  p_flyer_url        text,
  p_roles            jsonb,
  -- NULL means "do not touch the days". An array of ISO date strings replaces
  -- the set; it must contain at least one, because an outreach with no days has
  -- no date and nothing to attend.
  p_days             date[] default null
) returns outreaches
language plpgsql
security invoker
set search_path = public
as $$
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
$$;

grant execute on function save_outreach(
  uuid, text, text, date, time, time, text, text, text, text[], text,
  outreach_role_type, int, text, jsonb, date[]
) to authenticated;

-- The 15-argument version is dropped so that a stale client cannot keep calling
-- an overload that silently ignores days. PostgREST resolves overloads by the
-- argument names it is given, so leaving both would mean an old build's saves
-- appearing to work while the day set never moved.
drop function if exists save_outreach(
  uuid, text, text, date, time, time, text, text, text, text[], text,
  outreach_role_type, int, text, jsonb
);


-- ============================================================
-- 6. apply_to_outreach() — the application AND its day commitment, atomically
--
-- The commitment is not decoration on an application; it is the denominator
-- everything is later measured against. Writing the application in one request
-- and its days in a second means every failure between them produces an
-- application committed to NOTHING, which reads as "attended 0 of 0 days" and
-- is unfixable from the volunteer's side because the row already exists.
--
-- A function body is a transaction, so both land or neither does. SECURITY
-- INVOKER: this buys atomicity, not privilege — applications_insert_own, the
-- per-role verification gate and every column GRANT still apply exactly as they
-- do to the direct insert this replaces.
-- ============================================================

create or replace function apply_to_outreach(
  p_outreach_id      uuid,
  p_type             text,
  p_motivation       text,
  p_outreach_role_id uuid,
  -- NULL or empty means every day of the outreach, which is the honest reading
  -- of a one-day event and of a quick join that was never asked to choose.
  p_day_ids          uuid[] default null
) returns applications
language plpgsql
security invoker
set search_path = public
as $$
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
    insert into applications (
      outreach_id, volunteer_id, type, motivation, outreach_role_id
    ) values (
      p_outreach_id, auth.uid(), p_type::application_type, p_motivation, p_outreach_role_id
    )
    returning * into saved;
  end if;

  -- The commitment is replaced wholesale, which is what makes re-applying (and
  -- later, changing which days you can make) mean what it says.
  delete from application_days where application_id = saved.id;

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

  -- Zero days is never a valid commitment. It can only happen if the caller
  -- passed ids belonging to another outreach, which the belongs-to trigger
  -- would have refused anyway — this names it instead of leaving an
  -- application that promises nothing.
  if not exists (select 1 from application_days where application_id = saved.id) then
    raise exception 'Choose at least one day you can attend.'
      using errcode = 'check_violation';
  end if;

  return saved;
end;
$$;

grant execute on function apply_to_outreach(uuid, text, text, uuid, uuid[]) to authenticated;


-- ============================================================
-- 7. Column privileges
--
-- Part 1 left both tables on Supabase's default table-level grants. RLS already
-- decides which ROWS each side may touch, but it cannot restrict columns, so
-- the same "revoke the table, grant back the columns" treatment every other
-- table here gets is applied now.
--
-- outreach_days: an organisation sets which days and (later) their hours.
-- `outreach_id` is absent from UPDATE for the same reason it is absent on
-- outreach_images — a day may be re-timed, never moved to another event.
--
-- application_days: INSERT and DELETE only, no UPDATE at all. Changing your
-- commitment means withdrawing that day and adding another, which is two rows
-- with two timestamps; letting a row be re-pointed would rewrite history in
-- place.
-- ============================================================

revoke insert, update on outreach_days from authenticated;
grant insert (outreach_id, day, start_time, end_time) on outreach_days to authenticated;
grant update (day, start_time, end_time) on outreach_days to authenticated;

revoke insert, update on application_days from authenticated;
grant insert (application_id, outreach_day_id) on application_days to authenticated;


-- ============================================================
-- 8. Repair the rows created since part 1 ran
--
-- Sections 2 and 6 make the invariants structural from here on. These two
-- statements fix what was created in the gap between 2026-08-15 and this
-- migration: outreaches with no day, and applications with no commitment.
--
-- This is a REPAIR, not a backfill of the kind part 1 forbade. Part 1's warning
-- was about never converting existing single-day outreaches into multi-day mode
-- — nothing here adds a SECOND day to anything. Every outreach gets its own
-- date as its one day, and every application commits to every day its outreach
-- actually has, which for all of them is one.
-- ============================================================

insert into outreach_days (outreach_id, day)
select o.id, o.date
  from outreaches o
 where not exists (select 1 from outreach_days d where d.outreach_id = o.id)
on conflict (outreach_id, day) do nothing;

insert into application_days (application_id, outreach_day_id)
select a.id, d.id
  from applications a
  join outreach_days d on d.outreach_id = a.outreach_id
 where not exists (select 1 from application_days ad where ad.application_id = a.id)
on conflict (application_id, outreach_day_id) do nothing;


-- ============================================================
-- 9. Verification
--
-- outreaches_without_days and applications_without_days must both be 0.
-- days_per_outreach_max tells you how many days the busiest event has — it
-- should be 1 until somebody actually creates a multi-day outreach.
-- ============================================================

select
  (select count(*) from outreaches o
    where not exists (select 1 from outreach_days d where d.outreach_id = o.id))
                                                          as outreaches_without_days,
  (select count(*) from applications a
    where not exists (select 1 from application_days ad where ad.application_id = a.id))
                                                          as applications_without_days,
  (select coalesce(max(c), 0) from (
     select count(*) c from outreach_days group by outreach_id
   ) t)                                                   as days_per_outreach_max,
  (select count(*) from attendance where outreach_day_id is null)
                                                          as attendance_without_day;
