-- ============================================================
-- Attendance (section 3) + richer reviews (section 4)
-- Owner decisions, 2026-08-05. See docs/REPORT_NOTES.md.
-- ============================================================
--
-- PARTLY SUPERSEDED by 20260807_checkin_code_isolation.sql. The
-- `outreaches.checkin_code` column added in section 1 below was NOT private:
-- outreaches rows are readable by every authenticated user and RLS cannot
-- restrict columns, so any volunteer could read the secret and check in
-- without attending. It has moved to its own table. Run this file first, then
-- that one; everything else here still stands.
--
-- Run this whole file in the Supabase SQL editor. It is idempotent.
--
-- Two features land together because they share one flow: an organiser marks
-- who turned up, then reviews the people who did. Attendance is what makes the
-- no-show penalty real; reviews are what make the V-Score move.


-- ------------------------------------------------------------
-- 1. Venue anchor + check-in code on outreaches
-- ------------------------------------------------------------
--
-- checkin_code is the secret inside the QR. The QR encodes
-- (outreach_id, checkin_code), so possessing an outreach id is not enough to
-- check in -- a volunteer must have actually seen the code the organiser is
-- displaying. It is NOT exposed to volunteers by any policy below; only the
-- owning organisation can read it, and the check-in endpoint verifies it on
-- the service-role key.
--
-- venue_latitude/longitude are the ANCHOR the silent location check compares
-- against. They are captured from the ORGANISER's device by an explicit
-- "I'm at the venue" confirmation -- deliberately, so that no map picker, no
-- geocoding service and no venue-coordinate infrastructure is needed. The
-- organiser's physical presence IS the location reference.
--
-- The anchor must come from the ORGANISER and never from a volunteer's scan.
-- A volunteer's coordinates written here would be exactly the stored location
-- that the attendance table's shape exists to forbid, and the first scanner is
-- unverifiable by construction -- so anchoring on first scan would let one
-- person with a photo of the QR set the venue to their living room and get
-- every genuine attendee flagged.
--
-- venue_anchored_at is what makes a bad anchor harmless: an anchor is only
-- honoured on the event's OWN DAY (see isVenueAnchorUsable in
-- lib/attendance.ts), so an organiser who opens the QR screen at home the
-- night before does not poison the event. A stale anchor is discarded, every
-- scan resolves to 'unavailable', and everyone is still marked PRESENT. The
-- failure mode is losing a verification signal, never inventing a
-- contradiction.
--
-- Note the asymmetry, which is the privacy design: the VENUE's coordinates are
-- stored (it is a published public event, not a person), while the VOLUNTEER's
-- coordinates are never stored anywhere at all -- see the attendance table.
alter table outreaches
  add column if not exists checkin_code uuid not null default gen_random_uuid(),
  add column if not exists venue_latitude double precision,
  add column if not exists venue_longitude double precision,
  add column if not exists venue_anchored_at timestamptz;

comment on column outreaches.checkin_code is
  'Secret embedded in the check-in QR. Service-role and owning org only; never sent to volunteers.';
comment on column outreaches.venue_latitude is
  'Venue anchor captured from the organiser''s device at QR display time. Compared against a volunteer''s scan location, which is never stored.';


-- ------------------------------------------------------------
-- 2. attendance
-- ------------------------------------------------------------
--
-- One row per (outreach, volunteer). Created by the check-in endpoint on a
-- scan, or by the organiser resolving someone who never scanned.
--
-- PRIVACY, load-bearing: this table stores the VERDICT of the location check
-- and nothing else. There is deliberately no latitude, no longitude, no
-- accuracy, no timestamped position -- not "we don't query them", but "they
-- do not exist here". The volunteer's coordinates are read once, in memory, at
-- the moment they choose to scan, compared against the venue anchor, and
-- discarded. There is no movement record to leak, subpoena, or accidentally
-- join against, and that guarantee is enforced by the shape of the table
-- rather than by anyone's discipline.
--
-- Do not add coordinate columns here. If a future feature needs them, that is
-- a decision to re-take explicitly, not a column to slip in.
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid not null references outreaches(id) on delete cascade,
  volunteer_id uuid not null references volunteer_profiles(id) on delete cascade,

  -- Set when the volunteer scanned. Null means they never did, which is what
  -- puts them in the organiser's "action needed" list.
  checked_in_at timestamptz,
  check_in_method text check (check_in_method in ('qr_scan', 'organiser')),

  -- The silent location check's verdict at scan time:
  --   not_checked -- no scan happened (organiser-entered row)
  --   confirmed   -- scan location agreed with the venue anchor
  --   unavailable -- location denied, unavailable, too imprecise, or the
  --                  organiser never anchored the venue. Counts as PRESENT.
  --                  Uneven phone and data access is a fact of the target
  --                  context; an honest volunteer must never be penalised for
  --                  a device limitation or poor signal.
  --   mismatch    -- scan location clearly contradicted the venue. This is the
  --                  only value that escalates, and it exists to close the
  --                  shared-code hole (a photo of the QR sent to someone at
  --                  home).
  location_check text not null default 'not_checked'
    check (location_check in ('not_checked', 'confirmed', 'unavailable', 'mismatch')),

  -- The organiser's final word. NULL = not yet resolved. The organisation
  -- ALWAYS has the final override on any volunteer, present or absent: no
  -- automated signal ever overrules a human who was physically at the event.
  organiser_status text check (organiser_status in ('present', 'absent')),
  organiser_note text,
  resolved_by uuid references organisation_profiles(id) on delete set null,
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outreach_id, volunteer_id)
);

drop trigger if exists trg_attendance_updated_at on attendance;
create trigger trg_attendance_updated_at
  before update on attendance
  for each row execute function set_updated_at();

create index if not exists idx_attendance_outreach_id on attendance (outreach_id);
create index if not exists idx_attendance_volunteer_id on attendance (volunteer_id);

-- The effective answer to "did they attend?", in one place so no screen
-- re-derives it and drifts.
--
-- DEFAULT PRESENT. An unresolved row with no scan still reads as present,
-- because the organiser only actively flags the real no-shows -- effort scales
-- with the number of ABSENCES, not the number of volunteers, and a
-- well-attended 20-person event needs no review work at all. Absence is only
-- ever an explicit human judgement.
create or replace function attendance_is_present(a attendance)
returns boolean
language sql
immutable
as $$
  select case
    when a.organiser_status is not null then a.organiser_status = 'present'
    else true
  end;
$$;

alter table attendance enable row level security;

-- A volunteer sees their own attendance; the owning organisation sees every
-- row for its own outreaches.
drop policy if exists "attendance_select_own_or_org" on attendance;
create policy "attendance_select_own_or_org"
  on attendance for select
  to authenticated
  using (
    volunteer_id = auth.uid()
    or exists (
      select 1 from outreaches o
      where o.id = attendance.outreach_id
        and o.organisation_id = auth.uid()
    )
  );

-- No insert/update/delete policy exists for `authenticated`, deliberately.
-- EVERY write goes through the serverless API on the service-role key, for two
-- reasons that cannot be enforced client-side:
--   1. A check-in must be verified against outreaches.checkin_code, which the
--      volunteer must not be able to read. Were the client to write this table
--      directly, marking yourself present at an event you never attended would
--      be a single PATCH.
--   2. Resolving someone as absent applies the -15 no-show penalty to
--      volunteer_profiles.v_score, which is already service-role-only.
-- Service-role bypasses RLS entirely, so it needs no policy here.


-- ------------------------------------------------------------
-- 3. Reviews: remark chips
-- ------------------------------------------------------------
--
-- Standardised, tappable remarks so an organiser can give real feedback
-- without typing prose -- the same friction argument as exception-based
-- attendance. Stored as slugs (constants/review-remarks.ts is the vocabulary);
-- display labels live in the app so wording can change without a migration.
--
-- `notes` (already present) stays the free-text escape hatch, always optional,
-- and never blocks submission.
alter table event_reviews
  add column if not exists remark_chips text[] not null default '{}';

comment on column event_reviews.remark_chips is
  'Slugs from constants/review-remarks.ts. Shown in full to the volunteer; aggregated by frequency for organisations.';


-- ------------------------------------------------------------
-- 4. volunteer_review_summary
-- ------------------------------------------------------------
--
-- What an ORGANISATION sees about a volunteer: an aggregate, never the
-- individual reviews.
--
-- This is a fairness decision, not a convenience one. Aggregation gives the
-- organisation a genuinely informative picture at a glance while ensuring a
-- volunteer is judged on their PATTERN of contribution rather than any single
-- bad day or one grumpy reviewer, and it naturally rewards consistency --
-- which is what the system is actually trying to measure. Individual reviews
-- stay readable only by their author and their subject, under
-- event_reviews_select_org_or_volunteer.
--
-- No PII: this view carries scores and counts only, and joins nothing from
-- `profiles`. The standing rule on the discovery views applies here too --
-- never add phone, email, or a name to it.
create or replace view volunteer_review_summary
with (security_invoker = true)
as
select
  vp.id as volunteer_id,
  vp.v_score,
  vp.events_attended,
  count(er.id) filter (where er.reliability_score is not null) as reviews_count,
  round(avg(er.reliability_score) filter (where er.reliability_score is not null), 2)
    as avg_reliability,
  round(avg(er.clinical_score) filter (where er.clinical_score is not null), 2)
    as avg_clinical,
  -- Chip slugs paired with how often they were received, most frequent first,
  -- e.g. [{"chip":"punctual","count":7}, ...]. Aggregated in the database so
  -- every screen shows the same ordering.
  coalesce(
    (
      select jsonb_agg(t order by t.count desc, t.chip asc)
      from (
        select chip, count(*) as count
        from event_reviews er2, unnest(er2.remark_chips) as chip
        where er2.volunteer_id = vp.id
        group by chip
      ) t
    ),
    '[]'::jsonb
  ) as remark_counts
from volunteer_profiles vp
left join event_reviews er on er.volunteer_id = vp.id
group by vp.id, vp.v_score, vp.events_attended;

grant select on volunteer_review_summary to authenticated;


-- ------------------------------------------------------------
-- 5. Column-level write protection
-- ------------------------------------------------------------
--
-- Same reasoning as the block at the bottom of schema.sql: Supabase grants
-- `authenticated` a TABLE-level INSERT/UPDATE on everything in `public`, and
-- RLS cannot restrict WHICH COLUMNS a payload carries. Revoke the table, then
-- grant back the specific columns.

-- attendance: nothing is client-writable at all. See the policy note above.
revoke insert, update, delete on attendance from authenticated;

-- outreaches: the three new columns are all server-managed and must NOT join
-- the existing grant lists.
--   checkin_code       -- rotating it would invalidate a live event's QR
--   venue_latitude/longitude/venue_anchored_at
--                      -- written by the API when the organiser anchors the
--                         venue, so a forged anchor cannot be posted to make a
--                         remote check-in look "confirmed"
-- No statement is needed: they are simply absent from the grant lists in
-- schema.sql, which is what protects them. This comment exists so nobody
-- "fixes" a write failure by adding them.

-- event_reviews: remark_chips is authored by the reviewing organisation, like
-- every other column on the table, and is governed by
-- event_reviews_insert_org / event_reviews_update_org. No column-level carve-
-- out is needed because there is no column here a client may write but the
-- author may not.
