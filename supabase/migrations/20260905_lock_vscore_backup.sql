-- ============================================================
-- Lock down v_score_recompute_backup.
--
-- ONE PASTE. Small, and it should be run soon rather than batched with
-- anything else.
--
-- ============================================================
-- WHAT WAS WRONG
--
-- `20260903b` created `v_score_recompute_backup` to preserve what every
-- volunteer's V-Score was before the recompute — and created it like an
-- ordinary working table: **no row-level security, no policy, and no revoke.**
-- Every other table this project has added since `profiles` does all three.
-- This one was written as a piece of migration scaffolding rather than as a
-- table holding people's data, and it is both.
--
-- WHY THAT MATTERS. Supabase grants the `anon` and `authenticated` roles access
-- to tables created in the `public` schema by default. Row-level security is
-- what normally takes that back and hands out only the rows a caller owns. With
-- RLS never enabled, the default grant stood: any signed-in user could read the
-- whole table — every volunteer's user id, their previous V-Score, their
-- current one, and the date it changed.
--
-- **Nothing was exposed in practice.** The verification after `20260903b`
-- returned `backup_rows 1`: there is one volunteer profile on the platform and
-- it is the owner's own test account. This is a hole closed before it held
-- anybody else's data, not a breach — but it would have grown silently with
-- every volunteer who registered.
--
-- WHY IT WAS MISSED. The table was reasoned about as a backup — a thing for the
-- migration's own safety — rather than as a place reputation data lives. The
-- lesson is the one the schema already encodes everywhere else: whether a table
-- needs RLS is decided by WHAT IS IN IT, never by what it is for.
--
-- ============================================================
-- WHAT THIS DOES NOT DO
--
-- It does not drop the table and it does not touch a single row. The backup is
-- the only record of what the running total said before 2026-08-27, and if a
-- volunteer ever asks why their score changed on that date, this is where the
-- answer is. It stays; it simply stops being world-readable.
-- ============================================================


-- ============================================================
-- 1. Row-level security, and no policy for anybody but an admin
--
-- Enabling RLS with no policy denies every client outright, whatever the
-- grants say. That is already the correct answer for this table: it is a
-- migration artefact, and the service role bypasses RLS entirely, so
-- /api/vscore and any future repair script keep working untouched.
--
-- The ONE policy is an admin read. An admin is the person who would ever have
-- to answer "why did my score change on the 27th", and without it they would
-- have to be handed the answer out of the SQL editor by the owner.
--
-- The volunteer themselves is deliberately NOT given a read. The row holds a
-- `previous_score` that no longer means anything — it is the output of a model
-- the platform has stopped using — and showing somebody a superseded score
-- with no context invites exactly the wrong conclusion about it.
-- ============================================================

alter table v_score_recompute_backup enable row level security;

drop policy if exists "v_score_recompute_backup_select_admin" on v_score_recompute_backup;
create policy "v_score_recompute_backup_select_admin"
  on v_score_recompute_backup for select
  to authenticated
  using (is_admin());


-- ============================================================
-- 2. The grants, taken back explicitly
--
-- Belt to the braces above. RLS already denies the writes and the reads; these
-- revokes make a stray attempt fail as `permission denied for table`
-- (SQLSTATE 42501) rather than as an empty result set, which is the difference
-- between noticing a bug and not.
-- ============================================================

revoke all on v_score_recompute_backup from anon;
revoke insert, update, delete on v_score_recompute_backup from authenticated;
grant select on v_score_recompute_backup to authenticated;

comment on table v_score_recompute_backup is
  'What every volunteer''s v_score and events_attended were immediately before the 2026-08-27 recompute (20260903b). The only record of the pre-derivation running total. Read-only, admins only; the service role bypasses RLS for repair work. Never delete it without deciding that question can go unanswered.';


-- ============================================================
-- 3. Verification — run this after, and read the numbers
--
-- EVERY FIGURE IS A COUNT. Expected value on the right.
--
--   rls_enabled          1   row-level security is on
--   select_policies      1   exactly one, the admin read
--   client_write_grants  0   authenticated cannot insert, update or delete
--   anon_grants          0   anon has nothing at all
--   rows_preserved       ?   unchanged from the backup_rows you saw before
-- ============================================================

select
  (select count(*) from pg_tables
    where schemaname = 'public' and tablename = 'v_score_recompute_backup'
      and rowsecurity) as rls_enabled,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'v_score_recompute_backup') as select_policies,
  (select count(*) from information_schema.table_privileges
    where table_name = 'v_score_recompute_backup' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) as client_write_grants,
  (select count(*) from information_schema.table_privileges
    where table_name = 'v_score_recompute_backup' and grantee = 'anon') as anon_grants,
  (select count(*) from v_score_recompute_backup) as rows_preserved;
