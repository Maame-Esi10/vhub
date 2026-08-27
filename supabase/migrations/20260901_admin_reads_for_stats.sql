-- ============================================================
-- Admin phase, package I — the reads the statistics need.
--
-- ONE PASTE. No new tables, no enums; two SELECT policies gain a clause.
--
-- WHY THIS IS NEEDED AT ALL. Every question the stats screen asks is a count
-- ACROSS the platform — how many outreaches are open, what fraction of places
-- are filled, how many no-shows this month. Both tables are row-scoped:
-- `outreaches` to "open, or mine", `applications` to "mine, or my
-- organisation's". An admin owns nothing and applies to nothing, so every count
-- would silently come back as a count of the handful of open outreaches rather
-- than an error. SILENTLY is the problem: a statistics screen that quietly
-- undercounts is worse than one that fails, because nobody checks a number that
-- looks plausible.
--
-- The alternative was to compute the statistics in the serverless API on the
-- service-role key. It was rejected because it is more moving parts for no more
-- safety: an admin can already read every profile, every credential and every
-- dispute, so aggregate counts of public-ish event data disclose nothing they
-- could not already assemble. The endpoint would exist only to bypass a policy
-- we can simply state correctly.
-- ============================================================

drop policy if exists "outreaches_select_open_or_own" on outreaches;
create policy "outreaches_select_open_or_own"
  on outreaches for select
  to authenticated
  -- The first two clauses are the existing rule, restated VERBATIM. A
  -- non-draft outreach is visible to everyone (that is what makes the feed and
  -- the public organisation profile work); a draft is visible to its owner.
  -- Only `or is_admin()` is new.
  using (
    status <> 'draft'
    or organisation_id = auth.uid()
    or is_admin()
  );

drop policy if exists "applications_select_own_or_org" on applications;
create policy "applications_select_own_or_org"
  on applications for select
  to authenticated
  using (
    volunteer_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from outreaches o
      where o.id = applications.outreach_id
        and o.organisation_id = auth.uid()
    )
  );


-- ============================================================
-- Verification — run this after
--
-- Expected:
--   admin_reads_outreaches   1
--   admin_reads_applications 1
--   outreaches_total             (however many exist)
-- ============================================================

select
  (select count(*) from pg_policies
    where tablename = 'outreaches' and policyname = 'outreaches_select_open_or_own'
      and qual like '%is_admin%') as admin_reads_outreaches,
  (select count(*) from pg_policies
    where tablename = 'applications' and policyname = 'applications_select_own_or_org'
      and qual like '%is_admin%') as admin_reads_applications,
  (select count(*) from outreaches) as outreaches_total;
