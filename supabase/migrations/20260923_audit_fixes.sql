-- ============================================================================
-- Fixes from the full audit of 2026-09-23. Three independent changes.
--
--  1. A review can only be filed against somebody who HELD A PLACE.
--  2. An outreach can always be moved to `cancelled`, whatever the
--     organisation's standing.
--  3. `organisation_profiles` stops publishing its verification evidence to
--     every signed-in user.
--
-- Run the whole file in the Supabase SQL editor. Idempotent. No begin/commit --
-- the editor wraps a paste in one transaction already.
--
-- CHANGE 3 MUST LAND WITH THE APP CODE OF THE SAME COMMIT. It narrows which
-- columns a client may SELECT, and four hooks are repointed at a new view in
-- the same change. Paste this, then reload the app (restart Metro if it is
-- running); do not paste it against an older bundle.
-- ============================================================================


-- ============================================================
-- 1. A review needs an accepted application.
--
-- WHAT WAS WRONG. `event_reviews_insert_org` checked one thing: that the
-- caller owns the outreach being reviewed. Nothing required that the volunteer
-- had ever applied to it, been accepted for it, or attended it.
--
-- WHY THAT IS SERIOUS. `public_volunteer_profiles` is granted to every
-- signed-in user and carries `id`, so any organisation can read the id of every
-- volunteer on the platform. `vscore_replay` counts every `event_reviews` row
-- for a volunteer with no check that an application exists, and a review filed
-- with `attended = false` floors that event's outcome to 0. One fabricated
-- review takes a new volunteer from 70 to 49; it is repeatable once per
-- (outreach, volunteer) pair, on as many outreaches as an organisation cares to
-- create. The endpoint was fixed in the same commit, but the endpoint is not
-- the only door: a client holding an organisation session can reach PostgREST
-- directly with the shipped anon key, which is what this policy is for.
--
-- WHY `accepted` AND NOT MERELY "APPLIED". That is exactly the set the
-- organisation's own review screen offers -- it filters applications to
-- `accepted` before showing anybody -- so this refuses nothing a legitimate
-- reviewer can reach.
--
-- The UPDATE policy is deliberately NOT changed. It can only reach a row that
-- already exists, and a row can now only exist if this check passed.
-- ============================================================
drop policy if exists "event_reviews_insert_org" on event_reviews;
create policy "event_reviews_insert_org"
  on event_reviews for insert
  to authenticated
  with check (
    reviewed_by = auth.uid()
    and exists (
      select 1 from outreaches o
      where o.id = event_reviews.outreach_id
        and o.organisation_id = auth.uid()
    )
    and exists (
      select 1 from applications a
      where a.outreach_id = event_reviews.outreach_id
        and a.volunteer_id = event_reviews.volunteer_id
        and a.status = 'accepted'
    )
  );


-- ============================================================
-- 2. Cancelling is always allowed.
--
-- WHAT WAS WRONG. This trigger's first test raises whenever the owning
-- organisation's `moderation_state` is not `active`, before the
-- status-unchanged exit and before the draft exception. A trigger fires for the
-- service role too -- it is RLS the service key bypasses, never triggers -- so
-- when /api/moderation marked an organisation suspended and then asked
-- `stopOrganisation` to cancel its outreaches, every one of those cancellations
-- was refused. The endpoint went on to push and email every accepted,
-- waitlisted and pending volunteer to say the event would not take place, while
-- the event stayed `open` in the feed and open to new applications.
--
-- The ordering in /api/moderation was fixed in the same commit (stop first,
-- then mark), and that alone closes the reported bug. This is the other half:
-- CANCELLING IS A STOP, NOT A PUBLICATION. Refusing it is refusing to let
-- somebody take down an event they are no longer allowed to run, which is
-- backwards. The same applies to an organisation whose verification was
-- withdrawn: it must still be able to cancel what it already published.
--
-- Only the transition INTO `cancelled` is exempted. Everything else -- creating,
-- publishing, reopening -- goes through the checks below unchanged. RLS still
-- decides which rows the caller may touch at all.
-- ============================================================
create or replace function refuse_outreach_from_unverified_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state org_verification_state;
  v_moderation moderation_state;
begin
  -- FIRST, and before every other test. Taking an event down is always allowed.
  if tg_op = 'UPDATE'
     and new.status = 'cancelled'
     and old.status is distinct from 'cancelled' then
    return new;
  end if;

  -- Moderation next, and it allows no draft exception: an organisation
  -- awaiting verification is preparing to operate, while a suspended one has
  -- been told to stop.
  select moderation_state into v_moderation from profiles where id = new.organisation_id;
  if v_moderation is distinct from 'active' then
    raise exception
      'This organisation is suspended and cannot create or publish outreaches.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'draft' then
    return new;
  end if;

  select verification_state into v_state
    from organisation_profiles
   where id = new.organisation_id;

  if v_state is distinct from 'verified' then
    raise exception
      'This organisation is not verified, so it cannot publish outreaches yet. Submit verification from Settings.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


-- ============================================================
-- 3. Verification evidence stops being world-readable.
--
-- WHAT WAS WRONG. `organisation_profiles_select_authenticated` is
-- `using (true)`, and the comment above it justified that by listing the
-- table's contents as "org_name, org_type, description, website, verified".
-- That stopped being true when organisation verification shipped
-- (20260827_organisation_verification.sql). The table now also holds
-- `official_email`, `physical_address`, `contact_person`, `verification_state`,
-- `verification_reason`, `verification_decided_at`, `verification_submitted_at`
-- and `document_consent_at`. No migration revisited the policy, so any
-- volunteer -- or any rival organisation -- could read an organisation's street
-- address, its named contact, and THE VERBATIM REASON AN ADMIN WROTE WHEN
-- REJECTING IT, with one request.
--
-- The schema already contradicted itself on this: `organisation_registrations`
-- is locked to `organisation_id = auth.uid() or is_admin()` on the stated
-- grounds that "a registration number is not a public fact", and a physical
-- address and a rejection reason are less public than a registration number.
--
-- WHY THE ROW POLICY IS NOT THE FIX, though it looks like the obvious one.
-- Narrowing it to `id = auth.uid() or is_admin()` WOULD BREAK THE VOLUNTEER
-- FEED. `useOutreaches` and `useApplications` both EMBED this table into their
-- outreach reads (`organisation:organisation_profiles (id, org_name, org_type,
-- verified)`) so that a card can name the organisation running the event. Those
-- four columns are genuinely public and the embed depends on the broad policy.
-- A row-scoped policy would return null for every outreach a volunteer does not
-- own, which is all of them.
--
-- SO THE SPLIT IS BY COLUMN, WHICH RLS CANNOT EXPRESS. Column privileges can:
-- `authenticated` keeps SELECT on the public columns only, and the private ones
-- come back through a view that carries its own row test. The view is
-- `security_invoker = false`, so it runs with its owner's rights and the column
-- grants below do not apply to it -- its WHERE clause is the whole access rule,
-- the same arrangement `public_volunteer_profiles` already uses.
-- ============================================================

drop view if exists organisation_private_profiles;
create view organisation_private_profiles
with (security_invoker = false) as
  select op.*
    from organisation_profiles op
   where op.id = auth.uid()
      or is_admin();

revoke all on organisation_private_profiles from anon;
grant select on organisation_private_profiles to authenticated;

-- The public half. `verified` stays here and `verification_state` does not,
-- deliberately: the boolean is the badge every volunteer is meant to see, while
-- the state distinguishes rejected / suspended / banned / documents_submitted,
-- which is the organisation's business and the admin's.
revoke select on organisation_profiles from authenticated;
grant select (
  id,
  org_name,
  org_type,
  description,
  website,
  contact_email,
  contact_phone,
  verified,
  show_gallery,
  created_at,
  updated_at
) on organisation_profiles to authenticated;


-- ============================================================
-- Verification. Asserts the outcome rather than trusting it; raises and names
-- the check that failed. Silence means every change landed.
-- ============================================================
do $$
declare
  v_count int;
begin
  -- 1. The review policy names `applications`.
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'event_reviews'
     and policyname = 'event_reviews_insert_org'
     and with_check like '%applications%'
     and with_check like '%accepted%';
  if v_count <> 1 then
    raise exception
      'event_reviews_insert_org does not require an accepted application (found %)', v_count;
  end if;

  -- 2. The trigger function exempts a move to cancelled.
  if pg_get_functiondef('refuse_outreach_from_unverified_org()'::regprocedure)
       not like '%new.status = ''cancelled''%' then
    raise exception 'refuse_outreach_from_unverified_org still refuses a cancellation';
  end if;

  -- 3a. The private view exists and is definer-rights.
  select count(*) into v_count
    from pg_views where schemaname = 'public' and viewname = 'organisation_private_profiles';
  if v_count <> 1 then
    raise exception 'organisation_private_profiles view is missing';
  end if;

  -- 3b. authenticated can no longer read the evidence columns.
  select count(*) into v_count
    from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = 'organisation_profiles'
     and grantee = 'authenticated'
     and privilege_type = 'SELECT'
     and column_name in (
       'official_email', 'physical_address', 'contact_person',
       'verification_state', 'verification_reason',
       'verification_decided_at', 'verification_submitted_at',
       'document_consent_at'
     );
  if v_count <> 0 then
    raise exception
      'authenticated can still SELECT % verification-evidence column(s) on organisation_profiles', v_count;
  end if;

  -- 3c. ...but still reads the four columns the volunteer feed embeds.
  select count(*) into v_count
    from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = 'organisation_profiles'
     and grantee = 'authenticated'
     and privilege_type = 'SELECT'
     and column_name in ('id', 'org_name', 'org_type', 'verified');
  if v_count <> 4 then
    raise exception
      'the volunteer feed embed would break: authenticated can SELECT only % of its 4 columns', v_count;
  end if;

  raise notice 'All three audit fixes verified.';
end $$;
