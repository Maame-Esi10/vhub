-- ============================================================
-- V-Score reversal, PART A — the machinery and the DRY RUN.
--
-- APPROVED BY THE OWNER, 2026-08-26. This is the one item in the admin brief
-- that changes something already built, working and tested, which is why it
-- was gated and why it ships as two files.
--
-- **THIS FILE WRITES NO SCORE.** It adds one nullable column, creates two
-- read-only functions, and ends with a REPORT showing exactly how far every
-- volunteer's score would move if the recompute were run. Read that report
-- before pasting 20260903b. Nothing here is destructive and it can be re-run.
--
-- ============================================================
-- WHAT CHANGES, IN ONE SENTENCE
--
-- `volunteer_profiles.v_score` stops being a running total that each review
-- blends into, and becomes a CACHE of a value derived by replaying the whole
-- history from 70.
--
-- WHY, beyond the dispute case that prompted it:
--
--   1. A running total has no way back. One wrong review was permanent, and an
--      upheld dispute could record that the volunteer was right while changing
--      nothing about the number the mistake produced.
--   2. It was ALREADY subtly wrong. `event_reviews` is upserted on
--      (outreach_id, volunteer_id), so an organisation EDITING a review it had
--      already filed blended a second time into a score the first version had
--      already moved, and incremented events_attended again. Replaying fixes
--      that without anyone having to have noticed it.
--
-- WHAT COUNTS AS AN EVENT: one `event_reviews` row. That is, today, the only
-- thing that moves a score -- the flat penalties are built, tested and called
-- by nothing.
--
-- IN WHAT ORDER: `created_at`, tie-broken by id. NOT the outreach's date. The
-- blend is order-dependent, so replaying by event date would rewrite the
-- trajectory of any volunteer whose review arrived late -- a January event
-- reviewed in June would be re-inserted ahead of events already counted,
-- moving a score for a reason unconnected to any error.
--
-- Filing order also buys the property this whole change rests on: for a
-- volunteer with no upheld dispute, the replay MUST reproduce the stored score
-- exactly. **Any non-zero delta in the report below, for a volunteer with no
-- upheld dispute, is a BUG rather than a correction** -- and the report says
-- which is which, so it can be read rather than guessed at.
-- ============================================================


-- ============================================================
-- 1. When the cache was last rebuilt
--
-- A derived value that nothing records the age of is indistinguishable from a
-- stale one. Written by /api/vscore on every replay.
--
-- Server-only, like `v_score` itself: it is not added to any grant list.
-- ============================================================

alter table volunteer_profiles
  add column if not exists v_score_recomputed_at timestamptz;

comment on column volunteer_profiles.v_score_recomputed_at is
  'When v_score was last derived by replaying the volunteer''s full review history. v_score is a CACHE of that replay, not the truth -- the truth is event_reviews plus any upheld disputes.';


-- ============================================================
-- 2. The event outcome, in SQL
--
-- A LINE-FOR-LINE MIRROR of computeEventOutcome() in lib/vscore.ts, and it has
-- to stay one. Two implementations of the same rule is a real risk, taken
-- deliberately and for one reason: the owner asked to see how far every score
-- would move BEFORE anything was written, and that report has to be producible
-- in the SQL editor without deploying code first.
--
-- The TypeScript remains the only version that runs in production. This one
-- exists for the migration and for spot-checking afterwards. If they ever
-- disagree, the TypeScript is right and this is the bug.
--
--   attended = false        -> 0      (a no-show floors the outcome)
--   attended is not true    -> null   (unknown attendance is not evidence)
--   no reliability score    -> null   (no signal; see the removed midpoint)
--   no clinical score       -> reliability x 20   (support roles are never
--                                                  clinically scored)
--   both scores             -> average x 20
-- ============================================================

create or replace function vscore_event_outcome(
  p_attended boolean,
  p_reliability integer,
  p_clinical integer
)
returns numeric
language sql
immutable
as $$
  select case
    when p_attended is false then 0::numeric
    when p_attended is not true then null::numeric
    when p_reliability is null then null::numeric
    when p_clinical is null then (p_reliability * 20)::numeric
    else (((p_reliability + p_clinical) / 2.0) * 20)::numeric
  end;
$$;


-- ============================================================
-- 3. The replay
--
-- Walks each volunteer's reviews in filing order, folding
-- `0.7 x old + 0.3 x outcome` and clamping to [0, 100], exactly as
-- recomputeVScoreAfterReview does. An event with no scorable outcome leaves
-- the score untouched rather than blending in a substituted number.
--
-- AN UPHELD DISPUTE VOIDS THE EVENT. It stops moving the score entirely rather
-- than being replaced with a better number, because upholding says "this
-- record should not have counted against you" and says nothing about what the
-- ratings should have been. Inventing one would be exactly the fabrication the
-- removed midpoint constant was.
--
-- An upheld ATTENDANCE dispute additionally restores the attendance count:
-- they were there, which is the thing they were disputing.
--
-- `exists` rather than a join to `disputes`, deliberately: a volunteer can
-- have BOTH an attendance and a review dispute upheld for one outreach, and a
-- join would then replay that event twice.
--
-- Returns only volunteers who have at least one review. A volunteer with none
-- replays to exactly the starting score, which the report below supplies with
-- coalesce rather than manufacturing a row for.
-- ============================================================

create or replace function vscore_replay()
returns table (volunteer_id uuid, score numeric, events_attended integer)
language sql
stable
set search_path = public
as $$
  with recursive ordered as (
    select
      er.volunteer_id                                as volunteer_id,
      row_number() over (
        partition by er.volunteer_id
        order by er.created_at, er.id
      )                                              as n,
      er.attended                                    as attended,
      er.reliability_score                           as reliability_score,
      er.clinical_score                              as clinical_score,
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
  ),
  walk as (
    select
      v.volunteer_id,
      -- The casts are load-bearing, not decoration. A recursive CTE demands
      -- that every column have the SAME type in both terms: row_number()
      -- returns bigint, so a bare `0` here is an integer and Postgres
      -- refuses the whole function with "has type integer in non-recursive
      -- term but bigint overall".
      0::bigint    as n,
      70::numeric  as score,
      0::integer   as attended_count
    from (select distinct er.volunteer_id from event_reviews er) v

    union all

    select
      w.volunteer_id,
      o.n,
      case
        when o.voided then w.score
        when vscore_event_outcome(o.attended, o.reliability_score, o.clinical_score) is null
          then w.score
        else greatest(
               0::numeric,
               least(
                 100::numeric,
                 0.7 * w.score
                 + 0.3 * vscore_event_outcome(o.attended, o.reliability_score, o.clinical_score)
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
-- 4. THE DRY RUN — read this before running 20260903b
--
-- One row per volunteer whose score OR attendance count would move, biggest
-- movement first. An empty result means the recompute would change nothing at
-- all, which is the expected outcome on a platform where no dispute has been
-- upheld yet.
--
-- HOW TO READ `why`:
--
--   'correction'  — this volunteer has an upheld dispute, so the movement is
--                   the point of the whole change. Expected.
--   'review edit' — an organisation edited a review after filing it, and the
--                   old running total double-counted the edit. The replay is
--                   right and the stored number was wrong. Expected, and a bug
--                   this fixes.
--   'INVESTIGATE' — neither of those applies and the number still moves.
--                   There is exactly ONE known way this can happen: a flat
--                   penalty (no-show / late or on-time cancellation) applied
--                   through /api/vscore's 'penalty' action, which wrote a
--                   deduction straight onto the stored score and left no
--                   record of itself anywhere. That action now REFUSES with a
--                   409 for this very reason, and nothing in the app ever
--                   called it -- so on this platform the count should be zero.
--                   Anything else is a bug in the replay.
--                   **Do not run 20260903b; send me the row.**
-- ============================================================

with replayed as (
  select * from vscore_replay()
)
select
  p.full_name,
  vp.v_score                                   as stored_score,
  round(coalesce(r.score, 70), 2)              as replayed_score,
  round(coalesce(r.score, 70) - vp.v_score, 2) as score_delta,
  vp.events_attended                           as stored_events,
  coalesce(r.events_attended, 0)               as replayed_events,
  case
    when exists (
      select 1 from disputes d
       where d.volunteer_id = vp.id and d.status = 'upheld'
    ) then 'correction'
    when exists (
      select 1 from event_reviews er
       where er.volunteer_id = vp.id
         and er.updated_at is distinct from er.created_at
    ) then 'review edit'
    else 'INVESTIGATE'
  end                                          as why
from volunteer_profiles vp
join profiles p on p.id = vp.id
left join replayed r on r.volunteer_id = vp.id
where round(coalesce(r.score, 70) - vp.v_score, 2) <> 0
   or coalesce(r.events_attended, 0) <> vp.events_attended
order by abs(coalesce(r.score, 70) - vp.v_score) desc, p.full_name;
