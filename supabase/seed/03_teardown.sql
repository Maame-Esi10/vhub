-- ============================================================================
-- REMOVE EVERY SEEDED TEST ACCOUNT.
--
-- Run the whole file in the Supabase SQL editor. Safe to run at any time, and
-- safe to run when nothing is seeded.
--
-- WHAT MAKES THIS SAFE TO RUN. It matches on `@seed.vhub.test`, a reserved
-- TLD that can never be issued to anybody, so there is no address a real user
-- could hold that this would match. It deletes from `auth.users` and lets the
-- cascades do the rest: profiles references auth.users on delete cascade, and
-- everything else hangs off profiles the same way.
--
-- WHY DELETING IS CORRECT HERE AND WRONG FOR A REAL ACCOUNT. Closing a real
-- account ANONYMISES and revokes rather than deleting, because deleting
-- cascades through that person's outreaches into OTHER people's attendance and
-- reviews, and every V-Score derived from them silently drifts. These ten have
-- no history anybody else depends on: they exist only to be ranked. If you
-- have accepted one and reviewed it, the review goes too, which is exactly
-- what you want from a test fixture and exactly what you must never do to a
-- real volunteer. See CLAUDE.md, account closure.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. What is about to go. Read this before the delete below.
-- ---------------------------------------------------------------------------
select
  (select count(*) from auth.users where email like '%@seed.vhub.test') as seeded_accounts,
  (select count(*) from applications a
     join profiles p on p.id = a.volunteer_id
     where p.email like '%@seed.vhub.test') as their_applications,
  (select count(*) from event_reviews r
     join profiles p on p.id = r.volunteer_id
     where p.email like '%@seed.vhub.test') as their_reviews;

-- ---------------------------------------------------------------------------
-- 2. The delete. One statement; the cascades carry it through every table.
-- ---------------------------------------------------------------------------
delete from auth.users where email like '%@seed.vhub.test';

-- ---------------------------------------------------------------------------
-- 3. Verification. READ THE RESULT.
--
-- `slots_filled` is checked too: it is trigger-derived from accepted
-- applications, so removing an accepted seeded volunteer must bring it back
-- down. If it did not, the trigger is not firing on delete, which would be a
-- real bug worth knowing about and is exactly the kind of thing a teardown is
-- well placed to notice.
-- ---------------------------------------------------------------------------
do $$
declare
  remaining int;
  orphaned_profiles int;
  bad_counts int;
begin
  select count(*) into remaining from auth.users where email like '%@seed.vhub.test';
  select count(*) into orphaned_profiles from profiles where email like '%@seed.vhub.test';

  select count(*) into bad_counts
  from outreaches o
  where o.slots_filled <> (
    select count(*) from applications a
    where a.outreach_id = o.id and a.status = 'accepted'
  );

  if remaining <> 0 then
    raise exception 'FAILED: % seeded auth users survived the delete', remaining;
  end if;
  if orphaned_profiles <> 0 then
    raise exception 'FAILED: % seeded profiles survived, so the cascade did not fire', orphaned_profiles;
  end if;
  if bad_counts <> 0 then
    raise exception
      'FAILED: % outreach(es) now have slots_filled disagreeing with their accepted applications. The recount trigger did not fire on delete.',
      bad_counts;
  end if;

  raise notice 'OK: every seeded test account removed and no slot count left stale.';
end $$;
