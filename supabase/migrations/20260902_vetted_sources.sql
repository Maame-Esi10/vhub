-- ============================================================
-- Admin phase, package J — vetted listing sources. SURFACE ONLY.
--
-- ONE PASTE. One table, admin-scoped, nothing else.
--
-- WHAT THIS IS, AND WHAT IT IS DELIBERATELY NOT. The owner's section 10 asks
-- for a whitelist of sources whose public outreach listings V-HUB would trust:
-- a name, a URL or domain, what kind of body it is, and why it was approved.
--
-- IT DOES NOT INGEST ANYTHING. Nothing reads this table, no listing is pulled
-- from any of these sources, and no outreach is created from one. The feature
-- behind it — populating a quiet feed from public listings — is DEFERRED and
-- stays deferred; this is the record of which sources would be acceptable when
-- and if that day comes, kept now while the reasoning is fresh rather than
-- reconstructed later from memory.
--
-- That is why there is no `last_fetched_at`, no `active` flag and no schedule.
-- Columns that exist for a feature that does not are how a schema starts
-- lying: a `last_fetched_at` that is forever null reads as a broken fetcher
-- rather than as an absent one.
-- ============================================================

create table if not exists vetted_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  -- A URL or a bare domain, whichever the admin actually has. Not validated as
  -- a URL: "the district health directorate's noticeboard" has no scheme, and
  -- refusing it would push a real source out of the record.
  url text not null check (length(btrim(url)) > 0),
  -- Free text rather than an enum, for the same reason organisation
  -- registrations are: the kinds are open-ended (ministry, teaching hospital,
  -- NGO umbrella, professional council, university) and a fixed list would
  -- need a migration to admit the next one.
  source_type text,
  -- WHY it was approved. The whole point of the table: a whitelist without
  -- reasons is a list somebody has to take on trust, and the person who
  -- approved each entry will not always be here to ask.
  rationale text not null check (length(btrim(rationale)) > 0),
  added_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (url)
);

alter table vetted_sources enable row level security;

-- Admins only, and only to read. Nothing else has any reason to see this: it
-- is an internal editorial record, not a directory volunteers browse.
drop policy if exists "vetted_sources_select_admin" on vetted_sources;
create policy "vetted_sources_select_admin"
  on vetted_sources for select
  to authenticated
  using (is_admin());

revoke insert, update, delete on vetted_sources from authenticated;
revoke all on vetted_sources from anon;


-- ============================================================
-- Verification — run this after
--
-- Expected:
--   sources_table     1
--   client_can_write  0
--   sources           0
-- ============================================================

select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'vetted_sources') as sources_table,
  (select count(*) from information_schema.table_privileges
    where table_name = 'vetted_sources' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) as client_can_write,
  (select count(*) from vetted_sources) as sources;
