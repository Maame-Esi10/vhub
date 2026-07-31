-- V-HUB migration: 2026-07-29 (FOLLOW-UP HARDENING -- not required to fix the
-- "permission denied for volunteer_profiles" bug; run
-- 20260729_grant_volunteer_profiles_update_id.sql for that.)
--
-- Closes a privilege-escalation chain found while auditing the above bug.
--
-- THE HOLE
-- `supabase/schema.sql`'s "Column-level write protection" section applies the
-- revoke-table-then-grant-columns pattern to volunteer_profiles, applications
-- and outreaches on UPDATE -- but never to `profiles` or
-- `organisation_profiles`. Both therefore keep Supabase's DEFAULT table-level
-- UPDATE grant to `authenticated`, which covers every column. RLS does not
-- help: profiles_update_own and organisation_profiles_update_own check only
-- row ownership (auth.uid() = id), never which columns changed.
--
-- Concretely, with nothing but the shipped publishable key and a real session
-- JWT (curl/PostgREST, no app UI involved), a volunteer could:
--   1. update profiles set role = 'organisation'   -- own row, permitted
--   2. insert into organisation_profiles (id, org_name) ...
--      (organisation_profiles_insert_own checks auth.uid() = id and does NOT
--      check profiles.role)
--   3. update organisation_profiles set verified = true
--      -- self-assigned trust badge; note schema.sql ALREADY blocks this on
--      -- INSERT and its comment calls it out by name, so the UPDATE path is
--      -- an oversight, not a deliberate exception
--   4. create outreaches, review volunteers (moving real V-Scores), and read
--      the applicant PII that profiles_select_authenticated /
--      volunteer_profiles_select_authenticated expose to "the organisation".
--
-- Not reachable through the shipped app -- there is no organisation-profile
-- edit screen yet, and nothing writes profiles.role after signup. This closes
-- the capability, not an active exploit.
--
-- THE FIX -- same mechanism already used elsewhere in schema.sql: revoke the
-- table-level privilege, grant back only the columns a client legitimately
-- writes. Omitting a column from the grant list is what protects it; there is
-- no need for a trigger.
--
-- NOTE ON `id` IN THESE GRANT LISTS -- this is the trap that caused the bug
-- this migration follows. `hooks/useAuthGuard.ts`'s
-- repairMissingOrganisationProfile does
--   .upsert({ id, org_name }, { onConflict: 'id' })
-- and PostgREST compiles every upsert into
--   INSERT ... ON CONFLICT (id) DO UPDATE SET id = excluded.id, ...
-- so `id` lands in the UPDATE SET clause and MUST be granted, or that repair
-- path starts failing with the same 42501 we just fixed on
-- volunteer_profiles. `profiles` is never upserted (only .insert() at signup
-- and .update({region, district}) at onboarding), so it does not need `id`.
--
-- Idempotent: safe to paste into the Supabase SQL editor any number of times.
--
-- Owner-approved 2026-07-31 and folded into supabase/schema.sql's
-- "Column-level write protection" section, so a fresh install of that file
-- already includes these grants; this migration exists to bring the EXISTING
-- live project up to date. Run it AFTER
-- 20260729_grant_volunteer_profiles_update_id.sql.
-- ============================================================

-- profiles: everything a user may edit about themselves. `role` is
-- deliberately ABSENT -- it is set once at signup (the INSERT path is
-- unrestricted, which is what lets useSignUp/useAuthGuard create the row) and
-- must never change afterwards, because it decides which tab group the app
-- routes to and which branch of every RLS policy in this schema applies.
-- `id` absent: profiles is never upserted. created_at absent: DB-managed.
revoke update on profiles from authenticated;
grant update (
  full_name,
  phone,
  email,
  region,
  district,
  avatar_url
) on profiles to authenticated;

-- organisation_profiles: `verified` is deliberately ABSENT -- it is the trust
-- badge shown to volunteers deciding whether an outreach is legitimate, and
-- must only ever be set by an admin/service-role review, exactly as the
-- INSERT grant list in schema.sql already enforces. `id` present: required
-- by repairMissingOrganisationProfile's upsert, see the note above. Safe
-- because organisation_profiles_update_own's using/with check both bind the
-- row to auth.uid() = id, so a caller can only ever write their own uid back.
revoke update on organisation_profiles from authenticated;
grant update (
  id,
  org_name,
  org_type,
  description,
  website
) on organisation_profiles to authenticated;
