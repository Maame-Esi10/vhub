-- ============================================================================
-- Outreach location: a photo of the venue, and its coordinates.
--
-- WHY (owner-approved 2026-09-16). "Korle Bu Teaching Hospital" is a name, not
-- a place you can find. A volunteer travelling to an outreach they have never
-- been to has a district, a venue name, and nothing else -- no picture of what
-- they are looking for and no way to hand the address to a map.
--
-- DELIBERATELY NOT AN EMBEDDED MAP. react-native-maps is a new dependency AND
-- a native rebuild, and it defaults to Google Maps on Android. expo-location is
-- already installed, so the organisation captures coordinates with one tap and
-- the volunteer opens them in whichever map app their phone already has. That
-- does the job better than a map rendered inside VHub, and costs nothing.
--
-- Run this whole file in the Supabase SQL editor. It is idempotent: every
-- statement is `if not exists` or an idempotent grant, so re-running is safe.
-- No `begin`/`commit` -- the editor wraps a paste in its own transaction, and
-- a nested one errors out. See CLAUDE.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The columns.
-- ----------------------------------------------------------------------------

-- The Cloudinary public_id of the venue photo, NOT a URL.
--
-- The same choice credential documents made, for a different reason. There the
-- point was privacy; here it is that a public_id is stable while a delivery URL
-- carries a transformation and a version in it, so storing the URL means every
-- future change of size or format is a data migration. This one is PUBLIC
-- delivery, like the flyer and the gallery: it is a picture of a building,
-- shown to volunteers on screens with no session behind the image request.
alter table outreaches add column if not exists location_image_id text;

-- Where the venue is, for handing to a map app. Nullable and always optional:
-- an organisation that will not grant location permission, or is filling the
-- form from an office across the country, must still be able to publish.
--
-- `numeric` rather than `double precision` for the same reason v_score is:
-- exactness over range. These are degrees, they never need an exponent, and
-- numeric compares and rounds predictably.
alter table outreaches add column if not exists location_lat numeric;
alter table outreaches add column if not exists location_lng numeric;

-- Both or neither. A latitude with no longitude is not a partial answer, it is
-- a corrupt one, and it would reach a map app as a point in the Gulf of Guinea.
alter table outreaches drop constraint if exists outreaches_location_pair;
alter table outreaches add constraint outreaches_location_pair
  check ((location_lat is null) = (location_lng is null));

-- Real coordinates only. Catches a transposed pair (Ghana's longitude is within
-- latitude's range, so transposition is silent without this) and anything that
-- arrived as metres rather than degrees.
alter table outreaches drop constraint if exists outreaches_location_range;
alter table outreaches add constraint outreaches_location_range
  check (
    (location_lat is null or (location_lat >= -90 and location_lat <= 90))
    and (location_lng is null or (location_lng >= -180 and location_lng <= 180))
  );

-- ----------------------------------------------------------------------------
-- 2. The grants.
--
-- CLAUDE.md, and the reason this section exists at all: RLS decides WHICH ROWS
-- a client may touch and cannot restrict WHICH COLUMNS. `outreaches` therefore
-- carries column-level INSERT and UPDATE lists, and a new column the client
-- must write has to be added to BOTH or the write fails with
-- `permission denied for table outreaches` (SQLSTATE 42501).
--
-- These three are organisation-authored content, like flyer_url beside them --
-- not derived, not server-only, nothing hangs off them. They go in both lists.
--
-- The lists are restated in full rather than amended, because `grant` on a
-- column list is additive and there is no way to read the current list back
-- and diff it. Restating is what keeps this file and schema.sql in step.
-- ----------------------------------------------------------------------------

revoke update on outreaches from authenticated;
grant update (
  title,
  description,
  date,
  start_time,
  end_time,
  region,
  district,
  location_name,
  required_skills,
  required_category,
  role_type,
  slots_total,
  status,
  flyer_url,
  location_image_id,
  location_lat,
  location_lng
) on outreaches to authenticated;

revoke insert on outreaches from authenticated;
grant insert (
  organisation_id,
  title,
  description,
  date,
  start_time,
  end_time,
  region,
  district,
  location_name,
  required_skills,
  required_category,
  role_type,
  slots_total,
  status,
  flyer_url,
  location_image_id,
  location_lat,
  location_lng
) on outreaches to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Verification. Run this after the above and read the result.
--
-- ASSERT, DO NOT ASSUME (owner's standing instruction, 2026-08-31): a confident
-- comment has been wrong before and only the check caught it.
-- ----------------------------------------------------------------------------

do $$
declare
  missing_cols int;
  missing_update int;
  missing_insert int;
begin
  select count(*) into missing_cols
  from (values ('location_image_id'), ('location_lat'), ('location_lng')) as want(col)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'outreaches' and column_name = want.col
  );
  if missing_cols <> 0 then
    raise exception 'FAILED: % of the 3 columns are missing', missing_cols;
  end if;

  select count(*) into missing_update
  from (values ('location_image_id'), ('location_lat'), ('location_lng')) as want(col)
  where not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'outreaches'
      and grantee = 'authenticated' and privilege_type = 'UPDATE' and column_name = want.col
  );

  select count(*) into missing_insert
  from (values ('location_image_id'), ('location_lat'), ('location_lng')) as want(col)
  where not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'outreaches'
      and grantee = 'authenticated' and privilege_type = 'INSERT' and column_name = want.col
  );

  if missing_update <> 0 or missing_insert <> 0 then
    raise exception 'FAILED: % column(s) missing UPDATE, % missing INSERT', missing_update, missing_insert;
  end if;

  -- The flyer must still be writable: this file restates the grant lists, so a
  -- typo here would silently revoke a column that was working yesterday.
  if not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'outreaches'
      and grantee = 'authenticated' and privilege_type = 'UPDATE' and column_name = 'flyer_url'
  ) then
    raise exception 'FAILED: restating the UPDATE grant dropped flyer_url';
  end if;

  raise notice 'OK: 3 columns added, both grant lists intact, flyer_url still writable.';
end $$;
