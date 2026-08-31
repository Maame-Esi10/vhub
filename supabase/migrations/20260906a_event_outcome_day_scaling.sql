-- ============================================================
-- Multi-day participation scaling, PART A — the machinery and the DRY RUN.
--
-- APPROVED BY THE OWNER, 2026-08-30.
--
-- **THIS FILE WRITES NO SCORE.** It adds one read-only function, replaces
-- `vscore_replay()`, and ends with a REPORT showing exactly how far every
-- volunteer's score would move if the recompute were run. Read that report
-- before pasting 20260906b. Nothing here is destructive and it can be re-run.
--
-- RUN THIS AFTER 20260903a, 20260903b, 20260904 and 20260905. It replaces the
-- `vscore_replay()` that 20260904 last defined.
--
-- ============================================================
-- WHAT CHANGES, IN ONE SENTENCE
--
-- An event's outcome is still computed ONCE per event, and is now MULTIPLIED
-- by the share of committed days the volunteer was actually present for.
--
-- WHY. The multi-day subsystem records which days a volunteer promised
-- (`application_days`) and which they turned up for (`attendance`), and the
-- scorer threw all of it away: somebody who managed 1 day of 4 scored exactly
-- the same as somebody who managed 4 of 4. It was the largest correctness gap
-- left in the product — a whole subsystem collecting evidence that nothing
-- consumed.
--
-- ============================================================
-- THE TWO RULES THAT DECIDE THE RATIO, both settled policy already
--
--   1. THE DENOMINATOR EXCLUDES RELEASED DAYS. CLAUDE.md: "everything that
--      COUNTS days filters `released_at is null`", and a released day "is not a
--      failure and is not an absence". A day dropped in advance DEPARTS the
--      commitment. Leaving it in the denominator would turn every honest early
--      release into a silent score penalty — the exact trap per-day release was
--      built to remove.
--
--   2. AN UNRESOLVED DAY COUNTS AS ATTENDED. `attendance_is_present` already
--      defaults present, and CLAUDE.md already says "the organiser resolves
--      attendance per day as they go; unresolved days simply do not count,
--      exactly as an unrated review moves nothing". So a missing attendance
--      row, or a row the organiser never gave a verdict on, does not cost the
--      volunteer anything. The ratio falls ONLY where a human actually marked
--      somebody absent. An organiser who never opens the attendance screen
--      cannot damage anybody's score by inaction, and a flat phone is not an
--      absence.
--
-- Those two together are why **the dry-run report below is expected to come
-- back completely empty**: no organiser on this platform has marked anybody
-- absent on some days but not others, so every ratio is 1.0 and the scaling is
-- a no-op for everyone. A NON-EMPTY report is not automatically wrong — it
-- means somebody genuinely was partially absent — but read every row before
-- running part B.
--
-- ============================================================
-- WHAT DOES **NOT** CHANGE
--
--   * The blend. It is still 0.7 x old + 0.3 x outcome, clamped to [0, 100].
--   * The no-show floor. `attended = false` is still 0. A ratio of zero lands
--     on the same 0 by arithmetic rather than by a second rule, which is the
--     approved shape: only ZERO attended days is a no-show, and anything above
--     zero is a partial attender scored on the share they delivered.
--   * Penalties. `score_events` is untouched here.
--   * Single-day outreaches. Every one has exactly one day, so the ratio is 1
--     or 0, and 0 only where the organiser marked that day absent — which is
--     the case a review with `attended = false` already covers.
-- ============================================================


-- ============================================================
-- 1. The ratio, in SQL
--
-- A MIRROR of `dayCommitmentRatio` in lib/vscore.ts combined with the two rules
-- above, and it has to stay one. Same standing arrangement as
-- `vscore_event_outcome`: the TypeScript is the version that runs in
-- production, this one exists so the owner can see the movement in the SQL
-- editor before anything is written. **If they ever disagree, the TypeScript is
-- right and this is the bug.**
--
-- Returns NULL, meaning "no day information, do not scale", when the volunteer
-- holds no live commitment rows for that outreach. NULL is not zero: the caller
-- coalesces it to 1 rather than to nothing. A review whose application was
-- deleted must not be crushed to a no-show by the absence of evidence.
-- ============================================================

create or replace function vscore_day_ratio(p_volunteer_id uuid, p_outreach_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  with committed as (
    select ad.outreach_day_id
      from application_days ad
      join applications a on a.id = ad.application_id
     where a.volunteer_id = p_volunteer_id
       and a.outreach_id  = p_outreach_id
       and ad.released_at is null
  )
  select case
    when count(*) = 0 then null::numeric
    else least(
           1::numeric,
           greatest(
             0::numeric,
             sum(
               case
                 when coalesce(
                        (select attendance_is_present(att)
                           from attendance att
                          where att.volunteer_id    = p_volunteer_id
                            and att.outreach_id     = p_outreach_id
                            and att.outreach_day_id = c.outreach_day_id
                          limit 1),
                        true)
                 then 1 else 0
               end
             )::numeric / count(*)::numeric
           )
         )
  end
  from committed c;
$$;

comment on function vscore_day_ratio(uuid, uuid) is
  'The share of still-committed days a volunteer was present for on one outreach. Released days leave the denominator; an unresolved day counts as present. NULL means no live commitment rows, i.e. do not scale. Mirrors dayCommitmentRatio in lib/vscore.ts.';


-- ============================================================
-- 2. The replay, with the scaling applied
--
-- Identical to the 20260904 version except for one thing: the review branch
-- multiplies `vscore_event_outcome(...)` by `coalesce(day_ratio, 1)`.
--
-- The multiplication sits HERE rather than inside `vscore_event_outcome`
-- deliberately. That function is `immutable` and takes three scalars; adding a
-- fourth parameter creates an overload rather than replacing it, and two
-- functions that must agree is exactly the drift this project keeps closing.
-- The pair — the unscaled outcome, then the ratio applied at the point of use —
-- together mirror `computeEventOutcome` in lib/vscore.ts.
--
-- The ratio is computed for the REVIEW branch only. A penalty carries no
-- attendance and no days; scaling one by a day ratio would be meaningless.
-- ============================================================

create or replace function vscore_replay()
returns table (volunteer_id uuid, score numeric, events_attended integer)
language sql
stable
set search_path = public
as $$
  with recursive merged as (
    -- Reviewed events.
    select
      er.volunteer_id                                as volunteer_id,
      er.created_at                                  as at,
      0                                              as source_rank,
      er.id                                          as tie,
      'review'::text                                 as entry_kind,
      er.attended                                    as attended,
      er.reliability_score                           as reliability_score,
      er.clinical_score                              as clinical_score,
      null::numeric                                  as points,
      vscore_day_ratio(er.volunteer_id, er.outreach_id) as day_ratio,
      exists (
        select 1 from disputes d
         where d.volunteer_id = er.volunteer_id
           and d.outreach_id = er.outreach_id
           and d.status = 'upheld'
      )                                              as voided,
      (
        coalesce(er.attended, false)
        or exists (
          select 1 from disputes d
           where d.volunteer_id = er.volunteer_id
             and d.outreach_id = er.outreach_id
             and d.type = 'attendance'
             and d.status = 'upheld'
        )
      )                                              as attended_effective
    from event_reviews er

    union all

    -- Penalties. They carry no attendance, no ratings and no days, and never
    -- touch the attendance count -- cancelling is not attending.
    select
      se.volunteer_id,
      se.created_at,
      1,
      se.id,
      'penalty'::text,
      null::boolean,
      null::integer,
      null::integer,
      se.points,
      null::numeric,
      (se.voided_at is not null),
      false
    from score_events se
  ),
  ordered as (
    select
      m.*,
      row_number() over (
        partition by m.volunteer_id
        order by m.at, m.source_rank, m.tie
      ) as n
    from merged m
  ),
  walk as (
    select
      v.volunteer_id,
      -- The casts are load-bearing. A recursive CTE demands the same type in
      -- both terms: row_number() returns bigint, so a bare 0 here is an integer
      -- and Postgres refuses the whole function with "has type integer in
      -- non-recursive term but bigint overall".
      0::bigint    as n,
      70::numeric  as score,
      0::integer   as attended_count
    from (select distinct o.volunteer_id from ordered o) v

    union all

    select
      w.volunteer_id,
      o.n,
      case
        when o.voided then w.score
        when o.entry_kind = 'penalty'
          then greatest(0::numeric, least(100::numeric, w.score + o.points))
        when vscore_event_outcome(o.attended, o.reliability_score, o.clinical_score) is null
          then w.score
        else greatest(
               0::numeric,
               least(
                 100::numeric,
                 0.7 * w.score
                 + 0.3 * (
                     vscore_event_outcome(o.attended, o.reliability_score, o.clinical_score)
                     * coalesce(o.day_ratio, 1::numeric)
                   )
               )
             )
      end,
      (w.attended_count + case when o.attended_effective then 1 else 0 end)::integer
    from walk w
    join ordered o
      on o.volunteer_id = w.volunteer_id
     and o.n = w.n + 1
  )
  select distinct on (walk.volunteer_id)
    walk.volunteer_id,
    walk.score,
    walk.attended_count
  from walk
  order by walk.volunteer_id, walk.n desc;
$$;


-- ============================================================
-- 3. THE DRY RUN — read this before running 20260906b
--
-- One row per volunteer whose score would move, biggest movement first.
--
-- **AN EMPTY RESULT IS THE EXPECTED OUTCOME** and means the scaling changes
-- nothing for anybody today. That is not the change being pointless: it means
-- no organiser has yet marked anybody absent on part of a multi-day event, so
-- every ratio is 1.0. The rule now exists for the first time somebody does.
--
-- HOW TO READ `why`:
--
--   'partial attendance' — this volunteer was marked absent on some but not
--                          all of the days they committed to on at least one
--                          reviewed outreach. The movement IS the change, and
--                          `worst_ratio` shows the smallest share involved.
--                          Expected.
--
--   'INVESTIGATE'        — the score moves and no partial attendance explains
--                          it. There is no known way this can happen: the only
--                          thing this file changes is the ratio, and a ratio of
--                          1 multiplies to no change at all.
--                          **Do not run 20260906b; send me the row.**
-- ============================================================

with replayed as (
  select * from vscore_replay()
),
ratios as (
  select
    er.volunteer_id,
    min(vscore_day_ratio(er.volunteer_id, er.outreach_id)) as worst_ratio
  from event_reviews er
  group by er.volunteer_id
)
select
  p.full_name,
  vp.v_score                                   as stored_score,
  round(coalesce(r.score, 70), 2)              as replayed_score,
  round(coalesce(r.score, 70) - vp.v_score, 2) as score_delta,
  round(ra.worst_ratio, 3)                     as worst_ratio,
  case
    when ra.worst_ratio is not null and ra.worst_ratio < 1 then 'partial attendance'
    else 'INVESTIGATE'
  end                                          as why
from volunteer_profiles vp
join profiles p on p.id = vp.id
left join replayed r on r.volunteer_id = vp.id
left join ratios ra on ra.volunteer_id = vp.id
where round(coalesce(r.score, 70) - vp.v_score, 2) <> 0
   or coalesce(r.events_attended, 0) <> vp.events_attended
order by abs(coalesce(r.score, 70) - vp.v_score) desc, p.full_name;
