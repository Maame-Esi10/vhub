-- ============================================================================
-- Correction to 20260916_outreach_location.sql: the venue photo stores a URL,
-- not a public_id.
--
-- WHY THE FIRST VERSION WAS WRONG. It reasoned that a public_id is stable while
-- a delivery URL carries a transformation and a version, so storing the id
-- avoids a data migration if the size or format ever changes. That is true, and
-- it is the right rule for the assets it was copied from -- credential
-- documents and organisation documents, which are PRIVATE and are only ever
-- read back through /api/document-url, a server that knows the cloud name.
--
-- It does not work for a PUBLIC image. Rendering a public_id means building a
-- delivery URL, which needs the Cloudinary cloud name, and the app only ever
-- learns that from the signature endpoint at upload time. A client rendering a
-- feed would have to hard-code it. So the venue photo follows the convention
-- this app already has for public images -- `outreaches.flyer_url`,
-- `outreach_images.url`, `profiles.avatar_url` -- all of which store the URL.
--
-- Caught before any row existed, so nothing has to be backfilled.
--
-- RENAMING PRESERVES COLUMN PRIVILEGES: an ACL is attached to the column by
-- attnum, not by name, so the grants from the first migration survive. The
-- verification block below asserts that rather than trusting it.
--
-- Run the whole file in the Supabase SQL editor. Idempotent. No begin/commit.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'outreaches'
      and column_name = 'location_image_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'outreaches'
      and column_name = 'location_image_url'
  ) then
    alter table outreaches rename column location_image_id to location_image_url;
  end if;
end $$;

-- Belt and braces: if the first migration was never run, create the column
-- outright so this file stands alone.
alter table outreaches add column if not exists location_image_url text;

-- ----------------------------------------------------------------------------
-- Verification. Read the result.
-- ----------------------------------------------------------------------------

do $$
declare
  missing_update int;
  missing_insert int;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'outreaches'
      and column_name = 'location_image_id'
  ) then
    raise exception 'FAILED: the old location_image_id column is still present';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'outreaches'
      and column_name = 'location_image_url'
  ) then
    raise exception 'FAILED: location_image_url does not exist';
  end if;

  -- The claim this migration rests on: a rename carries the column's grants.
  select count(*) into missing_update
  from (values ('location_image_url'), ('location_lat'), ('location_lng')) as want(col)
  where not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'outreaches'
      and grantee = 'authenticated' and privilege_type = 'UPDATE' and column_name = want.col
  );

  select count(*) into missing_insert
  from (values ('location_image_url'), ('location_lat'), ('location_lng')) as want(col)
  where not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'outreaches'
      and grantee = 'authenticated' and privilege_type = 'INSERT' and column_name = want.col
  );

  if missing_update <> 0 or missing_insert <> 0 then
    raise exception
      'FAILED: % column(s) missing UPDATE, % missing INSERT. Re-grant them.',
      missing_update, missing_insert;
  end if;

  raise notice 'OK: renamed to location_image_url, and all three grants survived.';
end $$;
