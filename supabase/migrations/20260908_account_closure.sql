-- ============================================================
-- Account closure — the column, and hiding a closed account from the places
-- that treat a profile as a live person.
--
-- ONE PASTE, and safe to re-run. No table is created, nothing is dropped
-- except two views that are immediately recreated, and no existing row
-- changes meaning.
--
-- APPROVED BY THE OWNER, 2026-08-31.
--
-- ============================================================
-- WHAT CLOSURE IS, AND WHY IT IS NOT A DELETE
--
-- `constants/policy.ts` promises two things about closing an account, and they
-- have to hold together:
--
--   "You can ask V-HUB to close your account, and closing it removes your
--    profile."
--
--   "Records of events you actually took part in -- that you attended, and
--    reviews written about that work -- are kept, because an organisation's
--    record of who worked at its clinic is its record too, not only yours."
--
-- Every table hangs off `profiles` with `on delete cascade`, so DELETING a
-- profile row would destroy the second promise entirely. For an organisation it
-- is worse than a broken promise: deleting it cascades through its outreaches
-- into OTHER people's attendance, reviews and disputes. Since a V-Score is now
-- derived by replaying `event_reviews`, every volunteer who ever worked for
-- that organisation would silently drift back toward 70 with a smaller
-- events_attended, and nothing on any screen would explain the drop.
--
-- So closure ANONYMISES AND REVOKES. The person is removed, the record of work
-- is kept, the private evidence is destroyed, and the login is banned. Nothing
-- is deleted, which is also why the sixteen existing cascades are deliberately
-- left alone: they defend a path the app no longer takes, and rewriting them
-- would be risk for no gain.
--
-- WARNING, worth knowing even though the app never does it: deleting a user
-- from the Supabase dashboard DOES take that path, and will silently rewrite
-- the V-Scores of everyone who worked with them.
-- ============================================================


-- ============================================================
-- 1. The column
--
-- SERVER-ONLY, and it protects itself by construction rather than by a revoke.
-- `profiles` is granted as "revoke the whole table, then grant back the named
-- columns" (see the bottom of supabase/schema.sql), so a column added later is
-- not in that list and is not client-writable. That is the intended state here
-- and the verification below asserts it:
--
--   a client that could SET it could close somebody else's account;
--   a client that could CLEAR it could reopen its own.
--
-- Nullable, and null means "open". A boolean would have answered "is it
-- closed?" and nothing else; the timestamp also answers "when", which is what a
-- support question about a closed account actually asks.
-- ============================================================

alter table profiles
  add column if not exists closed_at timestamptz;

comment on column profiles.closed_at is
  'When the account holder closed this account. Null means open. Closure ANONYMISES rather than deletes: the profile fields are blanked, private evidence is destroyed and the login is banned, but outreaches, applications, attendance, reviews and score events are KEPT -- they are the record of other people''s work too. Server-only; absent from every grant list on purpose.';


-- ============================================================
-- 2. A closed account disappears from the public profile views
--
-- Both views are `security_invoker = false` (they run as the definer and
-- bypass RLS), so this filter is the only thing standing between a closed
-- account and every profile screen in the app.
--
-- The column lists are UNCHANGED -- only the where clause gains a condition.
-- Recreated in full rather than altered because Postgres cannot add a where
-- clause to an existing view.
--
-- A closed organisation therefore stops resolving on the public profile screen,
-- and that is correct: there is nothing left to show and nobody to contact. The
-- volunteer's own history is unaffected, because their feedback and schedule
-- name the OUTREACH, not the organisation's profile.
-- ============================================================

drop view if exists public_volunteer_profiles;
create view public_volunteer_profiles
with (security_invoker = false) as
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.region,
    p.district,
    p.created_at,
    vp.category,
    vp.skill_tags,
    vp.specialties,
    vp.experience_level,
    vp.availability_slots,
    vp.bio,
    vp.v_score,
    vp.events_attended,
    vp.verification_status
  from profiles p
  join volunteer_profiles vp on vp.id = p.id
  where p.role = 'volunteer'
    and p.closed_at is null;

revoke all on public_volunteer_profiles from anon;
grant select on public_volunteer_profiles to authenticated;

drop view if exists public_organisation_profiles;
create view public_organisation_profiles
with (security_invoker = false) as
  select
    p.id,
    p.avatar_url,
    p.region,
    p.district,
    p.created_at,
    op.org_name,
    op.org_type,
    op.description,
    op.website,
    op.verified,
    -- Safe to publish here, unlike profiles.phone/email: these are the org's
    -- own advertised enquiry details, not a person's private contact info.
    -- The prohibition above still stands for p.phone and p.email.
    op.contact_email,
    op.contact_phone,
    -- Whether this organisation's profile shows a gallery from its past
    -- events. Default true; see 20260817_outreach_gallery.sql.
    op.show_gallery
  from profiles p
  join organisation_profiles op on op.id = p.id
  where p.role = 'organisation'
    and p.closed_at is null;

revoke all on public_organisation_profiles from anon;
grant select on public_organisation_profiles to authenticated;


-- ============================================================
-- 3. Verification — run this after, and read the numbers
--
-- Expected:
--   column_present            1   profiles.closed_at exists
--   client_write_grants       0   authenticated cannot INSERT or UPDATE it
--   volunteer_view_filtered   1   the volunteer view excludes closed accounts
--   organisation_view_filtered 1  the organisation view does too
--   already_closed            0   nobody is closed yet, which is expected today
-- ============================================================

select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'closed_at')                              as column_present,
  (select count(*) from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'closed_at' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE'))                 as client_write_grants,
  (select count(*) from pg_views
    where schemaname = 'public' and viewname = 'public_volunteer_profiles'
      and definition like '%closed_at%')                          as volunteer_view_filtered,
  (select count(*) from pg_views
    where schemaname = 'public' and viewname = 'public_organisation_profiles'
      and definition like '%closed_at%')                          as organisation_view_filtered,
  (select count(*) from profiles where closed_at is not null)     as already_closed;
