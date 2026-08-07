-- ============================================================
-- volunteer_review_summary must aggregate the WHOLE record
-- 2026-08-07. Amends the view added in 20260805_attendance_and_reviews.sql.
-- ============================================================
--
-- Run this whole file in the Supabase SQL editor. It is idempotent.
--
-- THE PROBLEM. The view was created `with (security_invoker = true)`, so it
-- runs with the CALLER's rights and every underlying row policy still applies.
-- `event_reviews_select_org_or_volunteer` limits an organisation to reviews it
-- wrote for its own outreaches -- which means the "summary" an organisation
-- read was an aggregate of its own opinion, not the volunteer's record. A
-- volunteer with twenty reviews across the platform showed `reviews_count = 1`
-- to an organisation that had reviewed them once, and 0 to everyone else.
--
-- That is worse than showing nothing: an average over a single review looks
-- exactly like an average over twenty, and an organisation deciding on an
-- applicant would read one bad day as a pattern.
--
-- THE FIX, and why it is safe. The view now runs with its OWNER's rights, like
-- the two discovery views at the bottom of schema.sql, so it sees the whole
-- review history. THE AGGREGATE ITSELF IS THE PRIVACY BOUNDARY -- and that is
-- the owner decision this implements (2026-08-05): an organisation sees the
-- SHAPE of a volunteer's record and never an individual review, so a volunteer
-- is judged on their pattern of contribution rather than on one bad day or one
-- grumpy reviewer. Individual reviews stay row-scoped under
-- event_reviews_select_org_or_volunteer: readable by their author and their
-- subject, nobody else. Nothing here widens access to a single review.
--
-- Disclosure check, deliberately: this exposes reviews_count, avg_reliability,
-- avg_clinical and remark_counts for any volunteer to any signed-in user.
-- `v_score` and `events_attended` -- the two most sensitive numbers here --
-- are ALREADY platform-wide readable through public_volunteer_profiles, which
-- the applicant cards and public profile screens use, so this is consistent
-- with the posture already shipped rather than a new one. There is no PII in
-- the select list and none may ever be added: no name, no phone, no email, and
-- no outreach or organisation id that could re-identify who wrote what.
--
-- `notes` in particular MUST NOT be aggregated in here. Free text is
-- identifying by nature, and the volunteer is the only person outside its
-- author who may read it.

-- drop + create rather than create or replace: `create or replace view` cannot
-- change a view's options, and would silently keep security_invoker = true.
drop view if exists volunteer_review_summary;

create view volunteer_review_summary
with (security_invoker = false)
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
  -- Chip slugs paired with how often they were received, most frequent first.
  -- Aggregated in the database so every screen shows the same ordering, and
  -- counted rather than listed so no single review can be picked back out.
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

-- Signed-in users only, exactly like the discovery views. Never grant to anon:
-- a volunteer's reputation is for people inside the platform, not the web.
revoke all on volunteer_review_summary from anon;
grant select on volunteer_review_summary to authenticated;
