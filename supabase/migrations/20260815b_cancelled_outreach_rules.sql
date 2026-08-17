-- ============================================================
-- The rules that USE the 'cancelled' status.
--
-- RUN 20260815a FIRST, IN ITS OWN PASTE. This file compares against
-- 'cancelled', and Postgres refuses to use an enum value in the same
-- transaction that added it. Then run this one as a single paste; it is
-- idempotent.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Nobody can apply to a cancelled outreach.
--
-- `applications_insert_own` already requires `status = 'open'`, so a cancelled
-- event is refused by that clause alone and needs no change. This is the
-- assertion that it is true, kept as a migration-time check rather than a
-- comment that could quietly stop being accurate.
-- ------------------------------------------------------------
do $$
declare
  policy_definition text;
begin
  select pg_get_expr(pol.polwithcheck, pol.polrelid)
    into policy_definition
    from pg_policy pol
    join pg_class rel on rel.oid = pol.polrelid
   where rel.relname = 'applications'
     and pol.polname = 'applications_insert_own';

  if policy_definition is null or position('open' in policy_definition) = 0 then
    raise exception
      'applications_insert_own no longer restricts inserts to open outreaches — a cancelled event would still accept applications.';
  end if;
end $$;


-- ------------------------------------------------------------
-- 2. A cancelled outreach never reopens by itself.
--
-- The daily lifecycle pass moves `open` outreaches whose date has passed to
-- `closed`. It reads `status = 'open'`, so a cancelled event is already
-- untouched — but the reminder and escalation passes read the same column, and
-- this trigger is what makes the guarantee structural rather than a property of
-- four separate WHERE clauses all happening to agree.
--
-- Cancellation is terminal. The only way out is to create a new outreach, which
-- is honest: the volunteers who were told it was cancelled are not silently
-- re-enrolled in it days later.
-- ------------------------------------------------------------
create or replace function refuse_uncancelling_outreach() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception
      'This outreach was cancelled and cannot be reopened. Create a new one instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_outreaches_no_uncancel on outreaches;
create trigger trg_outreaches_no_uncancel
  before update of status on outreaches
  for each row execute function refuse_uncancelling_outreach();


-- ------------------------------------------------------------
-- 3. Accepted volunteers keep their acceptance.
--
-- Deliberately, there is NO cascade here that touches `applications`.
--
-- The obvious implementation — mark every accepted application 'cancelled'
-- when the event is cancelled — is wrong twice over. `cancelled` on an
-- application means THE VOLUNTEER WITHDREW: it is the status the withdrawal
-- flow writes, it stamps `cancelled_at` and `late_cancellation` through
-- trg_applications_stamp_cancellation, and `late_cancellation` is what the
-- V-Score penalty reads. Cancelling an event would therefore have written a
-- withdrawal into the record of every volunteer who did nothing wrong, and on
-- a short-notice cancellation it would have stamped them as LATE withdrawals
-- and cost them V-Score points for their organiser's decision.
--
-- So the applications are left exactly as they are, and every screen reads the
-- OUTREACH's status to know the event is off. The volunteer's record continues
-- to say, truthfully, that they were accepted onto an event that was then
-- cancelled.
--
-- This assertion fails the migration if a cascade is ever added.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1
      from pg_trigger t
      join pg_class rel on rel.oid = t.tgrelid
     where rel.relname = 'outreaches'
       and not t.tgisinternal
       and pg_get_triggerdef(t.oid) ilike '%application%'
  ) then
    raise exception
      'A trigger on outreaches now touches applications. Cancelling an event must never write a withdrawal onto a volunteer.';
  end if;
end $$;


-- ============================================================
-- 4. Verification
-- ============================================================
select status, count(*) from outreaches group by status order by status;
