-- ============================================================
-- The late-cancellation window needs two edges.
--
-- THE BUG. `stamp_application_cancellation()` decided:
--
--   new.late_cancellation := event_start is not null
--                            and now() >= event_start - interval '24 hours';
--
-- That is a half-line, not a window. For any event in the PAST, `now()` is
-- far beyond `event_start - 24 hours`, so the condition is trivially true and
-- a withdrawal from an event that already happened was stamped as a late
-- cancellation.
--
-- The identical one-sided comparison existed client-side in
-- `isLateCancellationWindow` (components/ui/dateUtils.ts), which is what told
-- a volunteer that an event five days gone "starts within 24 hours". Both are
-- now bounded at both ends.
--
-- WHY IT MATTERED EVEN THOUGH NOTHING BROKE YET. No V-Score damage has
-- occurred: nothing in the app currently calls the penalty endpoint, so the
-- flag has been inert. But /api/vscore cross-checks a requested penalty
-- against `applications.late_cancellation` before applying it, so the moment
-- penalties are wired a wrongly-stamped row would produce a -8 that should
-- never have existed. Fixing it while it is inert costs nothing; fixing it
-- afterwards means auditing scores.
--
-- THE RULE. A late cancellation is BOTH within 24 hours of the start AND
-- before the start. Cancelling after the event has begun is not a late
-- cancellation at all — it is a no-show, and the attendance and review path
-- owns that at -15. Classifying it as a -8 cancellation would let someone
-- convert a no-show into the lighter penalty by tapping Withdraw afterwards.
--
-- Idempotent: safe to re-run. Fold into supabase/schema.sql.
-- ============================================================

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

    -- Both edges. `now() < event_start` is the fix: past the start it is a
    -- no-show, not a cancellation, and must not be stamped as one.
    new.late_cancellation :=
      event_start is not null
      and now() >= event_start - interval '24 hours'
      and now() < event_start;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- The trigger definition itself is unchanged; recreated only so a re-run of
-- this file leaves a consistent state.
drop trigger if exists trg_applications_stamp_cancellation on applications;
create trigger trg_applications_stamp_cancellation
  before update of status on applications
  for each row execute function stamp_application_cancellation();


-- ============================================================
-- Repair pass — existing rows stamped by the old rule.
--
-- Re-derives late_cancellation for every already-cancelled application from
-- the timestamp that was actually recorded, using the corrected window. Rows
-- cancelled at or after their event's start are corrected to false, because
-- under the new rule that was never a cancellation.
--
-- One statement, therefore atomic. Run the SELECT below first to see what it
-- would change.
-- ============================================================

-- Dry run: which rows are currently mis-stamped?
select
  a.id,
  a.outreach_id,
  o.date,
  o.start_time,
  a.cancelled_at,
  a.late_cancellation as stamped_now,
  (
    a.cancelled_at >= (o.date + coalesce(o.start_time, '00:00'::time)) at time zone 'UTC' - interval '24 hours'
    and a.cancelled_at < (o.date + coalesce(o.start_time, '00:00'::time)) at time zone 'UTC'
  ) as should_be
from applications a
join outreaches o on o.id = a.outreach_id
where a.cancelled_at is not null
  and a.late_cancellation is distinct from (
    a.cancelled_at >= (o.date + coalesce(o.start_time, '00:00'::time)) at time zone 'UTC' - interval '24 hours'
    and a.cancelled_at < (o.date + coalesce(o.start_time, '00:00'::time)) at time zone 'UTC'
  );


-- The repair itself. Run after reading the dry run above.
update applications a
   set late_cancellation = (
     a.cancelled_at >= (o.date + coalesce(o.start_time, '00:00'::time)) at time zone 'UTC' - interval '24 hours'
     and a.cancelled_at < (o.date + coalesce(o.start_time, '00:00'::time)) at time zone 'UTC'
   )
  from outreaches o
 where o.id = a.outreach_id
   and a.cancelled_at is not null;
