-- ============================================================
-- Adds 'cancelled' to the outreach_status enum.
--
-- RUN THIS FILE ON ITS OWN, AS THE ONLY THING IN THE EDITOR, AND RUN IT
-- BEFORE 20260815b.
--
-- WHY IT IS A FILE BY ITSELF. Postgres will not let a newly added enum value
-- be USED in the same transaction that added it — the error is
--
--     unsafe use of new value "cancelled" of enum type outreach_status
--
-- and the Supabase editor wraps everything you paste in one transaction. So any
-- statement that compares against, casts to, or defaults to 'cancelled' has to
-- be in a LATER paste than this one. That is the whole reason the lifecycle
-- migration is split in two; it is not tidiness.
--
-- (Function BODIES are exempt — plpgsql resolves literals when the function
-- runs, not when it is created — but relying on that distinction while
-- pasting is how you get a migration that half-applies.)
--
-- WHY 'cancelled' AND NOT 'closed'. An event that is not happening is not the
-- same as one that has stopped recruiting. `closed` reads as "applications
-- closed" and would leave a cancelled event sitting on volunteers' schedules
-- looking live, which is the one thing a cancellation must not do.
-- ============================================================

alter type outreach_status add value if not exists 'cancelled';

-- Confirm it landed. Expect: draft, open, closed, completed, cancelled.
select enumlabel
  from pg_enum
 where enumtypid = 'outreach_status'::regtype
 order by enumsortorder;
