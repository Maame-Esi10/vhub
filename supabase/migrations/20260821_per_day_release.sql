-- ============================================================
-- Per-day release — a volunteer may drop FUTURE days they committed to.
--
-- APPROVED BY THE OWNER, 2026-08-21. Her rule, which this implements exactly:
-- a volunteer can drop future days; days already attended stay recorded and
-- untouched; dropping a future day REDUCES the committed count rather than
-- counting as a failure, so days-attended over days-committed stays honest;
-- dropping within 24 hours of that day is a late cancellation under the
-- existing rule; dropping every remaining day is the same as withdrawing.
--
-- RUN IT AS ONE PASTE. The file contains no transaction control of its own, so
-- the Supabase editor's own transaction wraps the whole thing. It is also
-- idempotent — every add is `if not exists` and every create is `or replace` —
-- so a re-run is safe.
--
-- RELEASING IS NOT DELETING, and that is the central decision here. The row
-- stays and carries WHEN the release happened and whether it was late, because
-- those two facts are the evidence the accountability system reads. A deleted
-- row cannot tell you whether someone gave three weeks' notice or vanished the
-- night before, and cannot be told apart from a day never promised at all.
--
-- THIS ALSO CLOSES A HOLE THAT IS OPEN TODAY. When the day tables were locked
-- down on 2026-08-18, INSERT and UPDATE on `application_days` were revoked and
-- granted back column by column — but DELETE never was, and
-- `application_days_write_own` is a `for all` policy. So a crafted client call
-- can already erase a commitment outright: no timestamp, no lateness, and the
-- day silently gone from the organiser's roster. No screen does this, so it has
-- never happened. Section 4 revokes it.
-- ============================================================


-- ============================================================
-- 1. The two columns
--
-- `released_at` NULL means "still committed", which is the state every existing
-- row is in and therefore needs no backfill.
--
-- `late_release` is server-derived and never client-written — the same
-- treatment as `applications.late_cancellation`, and for the same reason: a
-- value a volunteer could set is not evidence about that volunteer.
-- ============================================================

alter table application_days
  add column if not exists released_at timestamptz,
  add column if not exists late_release boolean not null default false;

-- Every roster read is "who is still on this day", so the index covers exactly
-- that rather than the whole table.
create index if not exists application_days_live_idx
  on application_days (outreach_day_id)
  where released_at is null;


-- ============================================================
-- 2. The rules, enforced where they cannot be bypassed
--
-- LATENESS IS JUDGED AGAINST THAT DAY, never the event's first day. Dropping
-- day 9 of a campaign is a decision about day 9, and measuring it against day 1
-- would mark every late-campaign release "late" forever.
--
-- A DAY THAT HAS ALREADY STARTED CANNOT BE RELEASED. That is not a
-- cancellation, it is a no-show, and the attendance and review path owns it at
-- -15. Without this refusal a volunteer could convert a no-show into the
-- lighter penalty by tapping "release" afterwards — the identical hole that was
-- closed for whole-application withdrawal on 2026-08-12.
--
-- RELEASING THE LAST DAY STILL AHEAD IS WITHDRAWING, and must go through the
-- withdrawal path so the organisation is told and the waitlist is offered the
-- place. But only while the event has not begun: somebody who attended days 1
-- and 2 and then drops 3 and 4 has NOT withdrawn — they took part — and
-- cancelling their application would erase an attended event from their record.
-- ============================================================

create or replace function stamp_application_day_release() returns trigger
language plpgsql security definer set search_path = public as $$
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
$$;

drop trigger if exists trg_application_days_stamp_release on application_days;
create trigger trg_application_days_stamp_release
  before update on application_days
  for each row execute function stamp_application_day_release();


-- ============================================================
-- 3. Counting late releases, for the escalating warning
--
-- The owner's rule: a first late release costs nothing but warns; repetition
-- earns a deduction. The SIZE of that deduction is a V-Score formula change and
-- is deliberately NOT implemented anywhere in this file — it is gated and
-- awaiting her approval. This function only COUNTS, so the app can warn
-- honestly and so the number is ready the moment she signs off on it.
--
-- Counted over a rolling window rather than for all time: a volunteer who was
-- unreliable last year and dependable since is dependable, and a lifetime
-- counter can never be worked off.
-- ============================================================

create or replace function count_recent_late_releases(
  p_volunteer_id uuid,
  p_window_days int default 90
) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
    from application_days ad
    join applications a on a.id = ad.application_id
   where a.volunteer_id = p_volunteer_id
     and ad.late_release
     and ad.released_at is not null
     and ad.released_at >= now() - make_interval(days => p_window_days);
$$;

grant execute on function count_recent_late_releases(uuid, int) to authenticated;


-- ============================================================
-- 4. Privileges
--
-- The volunteer may set `released_at` on their own rows and nothing else. RLS
-- (`application_days_write_own`) already restricts WHICH rows; this restricts
-- WHICH COLUMNS, which RLS cannot do.
--
-- `late_release` is omitted on purpose. A client that could set it could
-- declare its own lateness.
--
-- The DELETE revoke is the fix described at the top of this file. Expressed as
-- a plain revoke because DELETE is a table-level privilege with no column form.
-- ============================================================

revoke delete on application_days from authenticated;
grant update (released_at) on application_days to authenticated;


-- ============================================================
-- 5. Verification — run this after, and read the numbers
--
-- Expected on a first run:
--   released_rows      0   (nothing has been released yet)
--   can_set_released   1   (the volunteer can ask for a release)
--   can_set_late       0   (and cannot declare it late themselves)
--   can_still_delete   0   (the hole is closed)
--   trigger_present    1
-- ============================================================

select
  (select count(*) from application_days where released_at is not null) as released_rows,
  (select count(*) from information_schema.column_privileges
     where table_name = 'application_days' and grantee = 'authenticated'
       and privilege_type = 'UPDATE' and column_name = 'released_at') as can_set_released,
  (select count(*) from information_schema.column_privileges
     where table_name = 'application_days' and grantee = 'authenticated'
       and privilege_type = 'UPDATE' and column_name = 'late_release') as can_set_late,
  (select count(*) from information_schema.table_privileges
     where table_name = 'application_days' and grantee = 'authenticated'
       and privilege_type = 'DELETE') as can_still_delete,
  (select count(*) from pg_trigger
     where tgname = 'trg_application_days_stamp_release') as trigger_present;
