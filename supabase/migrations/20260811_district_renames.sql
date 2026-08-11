-- ============================================================
-- Ghana district renames — constants and stored values, one transaction.
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
-- Both halves therefore happen together, in one transaction, or neither does.
--
-- SCOPE. Thirteen changes: one abolished assembly and twelve corrections
-- (status suffixes, spellings, a naming variant). Audited 2026-08-11 against
-- the official 261-MMDA list; see docs/REPORT_NOTES.md.
--
-- ORDER OF OPERATIONS. Run the SELECT in section 1 FIRST and read the counts.
-- If a row count is not what you expect, stop — do not run section 2.
-- ============================================================


-- ============================================================
-- 1. DRY RUN — how many rows does each rename touch?
--
-- Run this ON ITS OWN first. It writes nothing.
-- ============================================================

with renames(old_name, new_name) as (
  values
    -- Abolished 2018, split into Abuakwa North Municipal and Abuakwa South
    -- Municipal (both already valid options). Anyone still holding this is
    -- holding a district that no longer exists.
    ('East Akim Municipal',          'Abuakwa South Municipal'),

    -- Status suffix corrections.
    ('Asante Akim North Municipal',  'Asante Akim North'),
    ('Obuasi East',                  'Obuasi East Municipal'),
    ('Assin North Municipal',        'Assin North'),
    ('Jasikan',                      'Jasikan Municipal'),
    ('Krachi West',                  'Krachi West Municipal'),

    -- Spelling corrections.
    ('Mfantseman Municipal',         'Mfantsiman Municipal'),
    ('Bunkpurugu Nyakpanduri',       'Bunkpurugu Nyankpanduri'),

    -- Naming-variant corrections (the official names drop the "Wassa" prefix
    -- for Central and West, but keep it for Wassa Amenfi East).
    ('Wassa Amenfi Central',         'Amenfi Central'),
    ('Wassa Amenfi West',            'Amenfi West Municipal'),

    -- Hyphenation, aligned to the official list.
    ('Twifo Atti-Morkwa',            'Twifo Atti Morkwa'),
    ('Yunyoo-Nasuan',                'Yunyoo Nasuan'),
    ('Sawla-Tuna-Kalba',             'Sawla Tuna Kalba'),
    ('Nadowli-Kaleo',                'Nadowli Kaleo'),
    ('Prestea Huni-Valley Municipal','Prestea Huni Valley Municipal'),
    ('Tarkwa-Nsuaem Municipal',      'Tarkwa Nsuaem Municipal')
)
select
  r.old_name,
  r.new_name,
  (select count(*) from profiles   p where p.district = r.old_name) as profiles_affected,
  (select count(*) from outreaches o where o.district = r.old_name) as outreaches_affected
from renames r
where (select count(*) from profiles   p where p.district = r.old_name) > 0
   or (select count(*) from outreaches o where o.district = r.old_name) > 0
order by r.old_name;

-- Expected on a small test dataset: zero or very few rows. Every rename with
-- no affected rows is a pure constants change and carries no risk at all.


-- ============================================================
-- 2. THE MIGRATION — run only after reading section 1's output.
--
-- Wrapped in an explicit transaction: a partial rename would leave some rows
-- pointing at a name the constants no longer list, which is precisely the
-- orphaning this migration exists to prevent.
-- ============================================================

begin;

create temporary table district_renames(old_name text primary key, new_name text not null)
  on commit drop;

insert into district_renames(old_name, new_name) values
  ('East Akim Municipal',          'Abuakwa South Municipal'),
  ('Asante Akim North Municipal',  'Asante Akim North'),
  ('Obuasi East',                  'Obuasi East Municipal'),
  ('Assin North Municipal',        'Assin North'),
  ('Jasikan',                      'Jasikan Municipal'),
  ('Krachi West',                  'Krachi West Municipal'),
  ('Mfantseman Municipal',         'Mfantsiman Municipal'),
  ('Bunkpurugu Nyakpanduri',       'Bunkpurugu Nyankpanduri'),
  ('Wassa Amenfi Central',         'Amenfi Central'),
  ('Wassa Amenfi West',            'Amenfi West Municipal'),
  ('Twifo Atti-Morkwa',            'Twifo Atti Morkwa'),
  ('Yunyoo-Nasuan',                'Yunyoo Nasuan'),
  ('Sawla-Tuna-Kalba',             'Sawla Tuna Kalba'),
  ('Nadowli-Kaleo',                'Nadowli Kaleo'),
  ('Prestea Huni-Valley Municipal','Prestea Huni Valley Municipal'),
  ('Tarkwa-Nsuaem Municipal',      'Tarkwa Nsuaem Municipal');

-- profiles.district is client-writable, so no grant work is needed; this runs
-- as the service role in the SQL editor regardless.
update profiles p
   set district = r.new_name
  from district_renames r
 where p.district = r.old_name;

update outreaches o
   set district = r.new_name
  from district_renames r
 where o.district = r.old_name;

-- Proof that nothing was left behind: this must return zero rows.
-- If it returns anything, the transaction is rolled back below.
do $$
declare
  orphaned int;
begin
  select count(*) into orphaned
    from (
      select p.district from profiles p join district_renames r on p.district = r.old_name
      union all
      select o.district from outreaches o join district_renames r on o.district = r.old_name
    ) leftovers;

  if orphaned > 0 then
    raise exception 'District rename left % row(s) on an old name — rolling back.', orphaned;
  end if;
end $$;

commit;


-- ============================================================
-- 3. AFTERWARDS
--
-- constants/ghana-locations.ts must be updated in the SAME deployment: apply
-- the sixteen renames above, delete the now-unused 'East Akim Municipal'
-- entry, and the file drops from 262 entries to the official 261.
--
-- Ship the constants change and this migration together. Constants first
-- leaves stored values orphaned; migration first leaves rows pointing at names
-- the picker does not yet offer. Neither gap is visible in the UI, which is
-- exactly why they must not be separated.
-- ============================================================
