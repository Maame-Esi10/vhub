-- ============================================================
-- profiles is the ONLY table whose INSERT was never column-listed.
--
-- ONE PASTE, safe to re-run. Run it after 20260908.
--
-- ============================================================
-- WHAT WENT WRONG, AND WHERE
--
-- 20260908 added `profiles.closed_at` and claimed it "protects itself by
-- construction rather than by a revoke", on the reasoning that `profiles` is
-- granted as "revoke the whole table, then grant back the named columns", so a
-- column added later is not in the list and is not writable.
--
-- That is TRUE OF UPDATE and FALSE OF INSERT. The grant block at the bottom of
-- schema.sql does `revoke update on profiles` and then names six columns -- but
-- it never revokes INSERT, because the insert path is what lets useSignUp and
-- useAuthGuard create the row at signup. Supabase grants `authenticated` a
-- TABLE-LEVEL insert on everything in `public` by default, and a table-level
-- grant covers every column, including ones added years later.
--
-- 20260908's own verification caught it: client_write_grants came back 1 where
-- it asserted 0. The check was right and the comment above it was wrong.
--
-- **`profiles` is the only table in the schema with this gap.**
-- volunteer_profiles, organisation_profiles, outreaches, applications and
-- disputes all do `revoke insert ... grant insert (columns)`. This one was
-- missed, and every column added to `profiles` since has been silently
-- insertable.
--
-- ============================================================
-- HOW BAD IT ACTUALLY IS -- narrower than the number suggests
--
-- `profiles_insert_own` still binds the row to the caller: its with-check is
-- `auth.uid() = id and role <> 'admin'`. So the two attacks worth caring about
-- were never available:
--
--   * closing SOMEBODY ELSE'S account -- impossible, the insert must carry the
--     caller's own id, and the row would collide with the primary key anyway;
--   * REOPENING a closed account -- impossible, clearing `closed_at` needs
--     UPDATE, and UPDATE is correctly column-listed without it.
--
-- What WAS available: a brand-new user could include `closed_at`,
-- `moderation_state`, `moderation_reason` or `moderated_at` in the single
-- insert that creates their own profile at signup. Setting `closed_at` on
-- yourself at birth is self-harm rather than an attack, and pre-setting
-- `moderation_state` buys nothing (an admin's later suspension simply
-- overwrites it). Nothing was exposed and nothing needs repairing -- but a
-- column list is the difference between "no attack exists today" and "no
-- attack can exist", and the next server-only column added to this table would
-- have inherited the same hole silently.
-- ============================================================


-- ============================================================
-- 1. The column list
--
-- EXACTLY the four columns the client actually inserts, verified against both
-- insert paths in the app -- they are the only two:
--
--   hooks/useSignUp.ts          .insert({ id, role, full_name, email })
--   hooks/useAuthGuard.ts       .insert({ id, role, full_name, email })
--                               (bootstrapProfileFromMetadata, the
--                                email-confirmation recovery path)
--
-- `phone`, `region`, `district` and `avatar_url` are deliberately NOT here.
-- They are written later by UPDATE, which already grants them, and nothing
-- inserts them. A grant list should describe what the app does, not what it
-- might.
--
-- `role` MUST stay, and it is not a weakening: it is set once at signup and is
-- absent from the UPDATE list, which is what makes it immutable afterwards.
-- `profiles_insert_own`'s with-check carries `and role <> 'admin'`, so the one
-- value that would matter cannot be inserted.
--
-- NOW EXCLUDED, and this is the point of the file: closed_at, moderation_state,
-- moderation_reason, moderated_at, created_at, updated_at.
-- ============================================================

revoke insert on profiles from authenticated;
grant insert (
  id,
  role,
  full_name,
  email
) on profiles to authenticated;

-- Symmetry with how every other table in this schema treats `anon`. RLS
-- already refuses these (auth.uid() is null, so `auth.uid() = id` matches
-- nothing), but a revoke turns a stray attempt into `permission denied for
-- table profiles` rather than a silent empty result. SELECT is deliberately
-- untouched -- nothing here changes what is readable.
revoke insert, update, delete on profiles from anon;


-- ============================================================
-- 2. Verification -- run this after, and read the numbers
--
-- Expected:
--   closed_at_writable      0   the column 20260908 was meant to protect
--   moderation_writable     0   the three moderation columns, same gap
--   signup_columns_granted  4   id, role, full_name, email -- SIGNUP DEPENDS
--                               ON THIS BEING 4. If it is lower, registration
--                               is broken and this file's column list is wrong.
--   anon_write_grants       0   anon has no insert, update or delete
--   profiles_still_readable 1   the select policy is untouched
-- ============================================================

select
  (select count(*) from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'closed_at' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE'))                  as closed_at_writable,
  (select count(*) from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('moderation_state', 'moderation_reason', 'moderated_at')
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE'))                  as moderation_writable,
  (select count(*) from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('id', 'role', 'full_name', 'email')
      and grantee = 'authenticated'
      and privilege_type = 'INSERT')                               as signup_columns_granted,
  (select count(*) from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and grantee = 'anon'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE'))        as anon_write_grants,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and cmd = 'SELECT')                                          as profiles_still_readable;
