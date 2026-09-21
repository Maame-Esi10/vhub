-- ============================================================================
-- APPLY THE TEST VOLUNTEERS TO ONE OUTREACH  --  the oversubscription fixture.
--
-- Run 01_test_volunteers.sql first. Then find-and-replace the outreach title
-- (see the block below) and run this whole file in the Supabase SQL editor.
--
-- WHY IT IS A SEPARATE FILE. Seeding the people and pointing them at an event
-- are different acts with different lifetimes: the ten accounts are worth
-- keeping for weeks, and you will want to aim them at a new outreach every
-- time you test something. Run this as often as you like.
--
-- WHAT IT DELIBERATELY DOES NOT DO: set `match_score`. That column is written
-- by /api/match, and filling it in here with invented numbers would make the
-- ranked list agree with a fiction rather than with the scorer. Open the
-- Applicants screen after running this and let the real matcher rank them;
-- seeing it order these ten correctly IS the test.
--
-- `slots_filled` is likewise untouched: it is derived by trigger from accepted
-- applications, so it stays correct without this file knowing it exists.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- BEFORE YOU RUN THIS: find and replace the title.
--
-- Replace every occurrence of
--
--     Nima Community Eye Screening
--
-- with the EXACT title of your outreach. It appears five times below. A psql
-- variable would be tidier and the Supabase SQL editor does not support one --
-- \set is a psql meta-command and the editor rejects it -- so find-and-replace
-- is genuinely the mechanism here rather than laziness.
--
-- If the title does not match, the verification block at the end stops with a
-- message naming the problem rather than silently doing nothing.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Applications.
--
-- All ten land as `pending`, which is the state oversubscription is about:
-- more people waiting on a decision than there are places. Accepting, rejecting
-- and waitlisting are what you are testing, so this file must not do any of
-- them for you.
--
-- Mixed `type`, because Quick Join and Full Application render differently on
-- the applicant card and both should appear in one list.
-- ---------------------------------------------------------------------------
insert into applications (outreach_id, volunteer_id, type, status)
select o.id, v.volunteer_id, v.type::application_type, 'pending'::application_status
from outreaches o
cross join (values
  ('11111111-0000-4000-8000-000000000001'::uuid, 'full'),
  ('11111111-0000-4000-8000-000000000002'::uuid, 'full'),
  ('11111111-0000-4000-8000-000000000003'::uuid, 'full'),
  ('11111111-0000-4000-8000-000000000004'::uuid, 'full'),
  ('11111111-0000-4000-8000-000000000005'::uuid, 'quick_join'),
  ('11111111-0000-4000-8000-000000000006'::uuid, 'quick_join'),
  ('11111111-0000-4000-8000-000000000007'::uuid, 'full'),
  ('11111111-0000-4000-8000-000000000008'::uuid, 'full'),
  ('11111111-0000-4000-8000-000000000009'::uuid, 'quick_join'),
  ('11111111-0000-4000-8000-000000000010'::uuid, 'full')
) as v(volunteer_id, type)
where o.title = 'Nima Community Eye Screening'
  and not exists (
    select 1 from applications a
    where a.outreach_id = o.id and a.volunteer_id = v.volunteer_id
  );

-- ---------------------------------------------------------------------------
-- 2. Committed days.
--
-- An application with no `application_days` rows means "every day", which is
-- the honest reading of a one-day event. On a MULTI-DAY outreach that would
-- quietly make all ten full-span volunteers and the per-day shortfall card
-- would have nothing to show, so every day of the event is written explicitly
-- for eight of them and only the FIRST day for the two Saturday-only students.
-- ---------------------------------------------------------------------------
insert into application_days (application_id, outreach_day_id)
select a.id, d.id
from applications a
join outreaches o on o.id = a.outreach_id
join outreach_days d on d.outreach_id = o.id
where o.title = 'Nima Community Eye Screening'
  and a.volunteer_id in (
    '11111111-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002',
    '11111111-0000-4000-8000-000000000003','11111111-0000-4000-8000-000000000004',
    '11111111-0000-4000-8000-000000000007','11111111-0000-4000-8000-000000000008',
    '11111111-0000-4000-8000-000000000009','11111111-0000-4000-8000-000000000010'
  )
  and not exists (
    select 1 from application_days ad
    where ad.application_id = a.id and ad.outreach_day_id = d.id
  );

-- The two students commit to the first day only.
insert into application_days (application_id, outreach_day_id)
select a.id, d.id
from applications a
join outreaches o on o.id = a.outreach_id
join lateral (
  select id from outreach_days where outreach_id = o.id order by day asc limit 1
) d on true
where o.title = 'Nima Community Eye Screening'
  and a.volunteer_id in (
    '11111111-0000-4000-8000-000000000005','11111111-0000-4000-8000-000000000006'
  )
  and not exists (
    select 1 from application_days ad
    where ad.application_id = a.id and ad.outreach_day_id = d.id
  );

-- ---------------------------------------------------------------------------
-- 3. Verification. READ THE RESULT.
-- ---------------------------------------------------------------------------
do $$
declare
  target uuid;
  slots int;
  applied int;
begin
  select id, slots_total into target, slots
  from outreaches where title = 'Nima Community Eye Screening' limit 1;

  if target is null then
    raise exception
      'FAILED: no outreach titled "Nima Community Eye Screening". Edit the title at the top of this file to match one of yours exactly.';
  end if;

  select count(*) into applied
  from applications a
  join profiles p on p.id = a.volunteer_id
  where a.outreach_id = target and p.email like '%@seed.vhub.test';

  if applied <> 10 then
    raise exception 'FAILED: expected 10 seeded applications, found %. Did 01_test_volunteers.sql run?', applied;
  end if;

  -- Not an error, but the reason this fixture exists: with more slots than
  -- applicants nothing about oversubscription can be observed.
  if slots >= 10 then
    raise notice
      'NOTE: this outreach has % slots and 10 applicants, so it is NOT oversubscribed. Reduce slots_total to about 4 to exercise the waitlist and Accept-top-N.',
      slots;
  else
    raise notice 'OK: 10 applicants against % slots. Open Applicant Vetting to rank and decide.', slots;
  end if;
end $$;

select p.full_name, v.category, v.experience_level, v.v_score,
       a.type, a.status, a.match_score
from applications a
join profiles p on p.id = a.volunteer_id
join volunteer_profiles v on v.id = a.volunteer_id
join outreaches o on o.id = a.outreach_id
where o.title = 'Nima Community Eye Screening'
  and p.email like '%@seed.vhub.test'
order by v.v_score desc;
