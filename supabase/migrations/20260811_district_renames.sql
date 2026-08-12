-- ============================================================
-- Ghana district renames — constants and stored values together.
--
-- WHY THIS IS A MIGRATION AND NOT A CONSTANT EDIT.
--
-- District names are STORED VALUES. `profiles.district` and
-- `outreaches.district` hold them verbatim, and the matcher's location
-- component (lib/matching/layer1.ts) compares them by EXACT STRING EQUALITY:
-- same district scores 1.0, same region 0.5, otherwise 0.
--
-- So renaming a name in constants/ghana-locations.ts alone does two invisible
-- things to every row still holding the old spelling:
--   1. the district picker renders blank, because the stored value is no
--      longer an option in the list; and
--   2. the volunteer silently loses the full 20 location points against
--      events in their own district — no error, no warning, just a worse
--      match score forever.
--
-- NO TEMPORARY TABLE. An earlier draft built one and failed in the Supabase
-- SQL editor with `42P01: relation "district_renames" does not exist`. The
-- editor pools connections, so a temp table created by one statement is not
-- visible to the next — it is session-scoped and the next statement can land
-- on a different backend. Every section below is therefore ONE self-contained
-- statement with the rename list inlined as a CTE. A single statement is also
-- implicitly atomic, which is exactly the guarantee this needs.
--
-- Nothing is created, so there is no RLS prompt and NOTHING TO DROP AFTERWARDS.
--
-- ORDER: run section 1, read the counts, then run section 2, then section 3.
-- ============================================================


-- ============================================================
-- SECTION 1 — DRY RUN. Writes nothing. Run this first.
-- ============================================================

with renames(old_name, new_name) as (
  values
    ('East Akim Municipal',           'Abuakwa South Municipal'),
    ('Asante Akim North Municipal',   'Asante Akim North'),
    ('Obuasi East',                   'Obuasi East Municipal'),
    ('Assin North Municipal',         'Assin North'),
    ('Jasikan',                       'Jasikan Municipal'),
    ('Krachi West',                   'Krachi West Municipal'),
    ('Mfantseman Municipal',          'Mfantsiman Municipal'),
    ('Bunkpurugu Nyakpanduri',        'Bunkpurugu Nyankpanduri'),
    ('Wassa Amenfi Central',          'Amenfi Central'),
    ('Wassa Amenfi West',             'Amenfi West Municipal'),
    ('Twifo Atti-Morkwa',             'Twifo Atti Morkwa'),
    ('Yunyoo-Nasuan',                 'Yunyoo Nasuan'),
    ('Sawla-Tuna-Kalba',              'Sawla Tuna Kalba'),
    ('Nadowli-Kaleo',                 'Nadowli Kaleo'),
    ('Prestea Huni-Valley Municipal', 'Prestea Huni Valley Municipal'),
    ('Tarkwa-Nsuaem Municipal',       'Tarkwa Nsuaem Municipal')
)
select
  r.old_name,
  r.new_name,
  (select count(*) from profiles   p where p.district = r.old_name) as profiles_affected,
  (select count(*) from outreaches o where o.district = r.old_name) as outreaches_affected
from renames r
order by
  (select count(*) from profiles   p where p.district = r.old_name) +
  (select count(*) from outreaches o where o.district = r.old_name) desc,
  r.old_name;

-- Every row with 0 and 0 is a pure constants change and carries no risk.
-- Only rows with a non-zero count are actually rewritten by section 2.


-- ============================================================
-- SECTION 2 — THE RENAME. One statement, therefore atomic.
--
-- Both UPDATEs are data-modifying CTEs of a single statement, so they commit
-- together or not at all. They see the same snapshot and touch different
-- tables, so they cannot interfere with each other.
-- ============================================================

with renames(old_name, new_name) as (
  values
    ('East Akim Municipal',           'Abuakwa South Municipal'),
    ('Asante Akim North Municipal',   'Asante Akim North'),
    ('Obuasi East',                   'Obuasi East Municipal'),
    ('Assin North Municipal',         'Assin North'),
    ('Jasikan',                       'Jasikan Municipal'),
    ('Krachi West',                   'Krachi West Municipal'),
    ('Mfantseman Municipal',          'Mfantsiman Municipal'),
    ('Bunkpurugu Nyakpanduri',        'Bunkpurugu Nyankpanduri'),
    ('Wassa Amenfi Central',          'Amenfi Central'),
    ('Wassa Amenfi West',             'Amenfi West Municipal'),
    ('Twifo Atti-Morkwa',             'Twifo Atti Morkwa'),
    ('Yunyoo-Nasuan',                 'Yunyoo Nasuan'),
    ('Sawla-Tuna-Kalba',              'Sawla Tuna Kalba'),
    ('Nadowli-Kaleo',                 'Nadowli Kaleo'),
    ('Prestea Huni-Valley Municipal', 'Prestea Huni Valley Municipal'),
    ('Tarkwa-Nsuaem Municipal',       'Tarkwa Nsuaem Municipal')
),
updated_profiles as (
  update profiles p
     set district = r.new_name
    from renames r
   where p.district = r.old_name
  returning p.id
),
updated_outreaches as (
  update outreaches o
     set district = r.new_name
    from renames r
   where o.district = r.old_name
  returning o.id
)
select
  (select count(*) from updated_profiles)   as profiles_updated,
  (select count(*) from updated_outreaches) as outreaches_updated;


-- ============================================================
-- SECTION 3 — PROOF. Must return ZERO rows.
--
-- Any row here is a stored district still on an abolished or misspelled name,
-- which is the orphaning this migration exists to prevent.
-- ============================================================

with renames(old_name) as (
  values
    ('East Akim Municipal'),
    ('Asante Akim North Municipal'),
    ('Obuasi East'),
    ('Assin North Municipal'),
    ('Jasikan'),
    ('Krachi West'),
    ('Mfantseman Municipal'),
    ('Bunkpurugu Nyakpanduri'),
    ('Wassa Amenfi Central'),
    ('Wassa Amenfi West'),
    ('Twifo Atti-Morkwa'),
    ('Yunyoo-Nasuan'),
    ('Sawla-Tuna-Kalba'),
    ('Nadowli-Kaleo'),
    ('Prestea Huni-Valley Municipal'),
    ('Tarkwa-Nsuaem Municipal')
)
select 'profiles' as source_table, p.district, count(*) as rows_left
  from profiles p join renames r on p.district = r.old_name
 group by p.district
union all
select 'outreaches', o.district, count(*)
  from outreaches o join renames r on o.district = r.old_name
 group by o.district;


-- ============================================================
-- AFTERWARDS
--
-- Nothing to drop — no objects were created.
--
-- constants/ghana-locations.ts is updated in the SAME push as this migration
-- runs: the sixteen renames applied, and the abolished 'East Akim Municipal'
-- entry deleted, taking the file from 262 entries to the official 261.
--
-- Constants first would leave stored values orphaned; migration first would
-- leave rows pointing at names the picker does not yet offer. Neither gap is
-- visible in the UI, which is exactly why they must not be separated.
-- ============================================================
