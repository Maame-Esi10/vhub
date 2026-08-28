-- ============================================================
-- Score events — a home in the replayable history for the penalties.
--
-- ONE PASTE. It creates a new enum TYPE, which is allowed in the same
-- transaction that uses it; the two-paste rule applies only to adding a VALUE
-- to an enum that already exists.
--
-- RUN THIS AFTER 20260903a AND 20260903b. It replaces `vscore_replay()`, which
-- 20260903a creates, and it re-runs the recompute at the end so the cached
-- scores agree with the new definition.
--
-- ============================================================
-- WHY THIS EXISTS
--
-- The V-Score reversal (20260903a/b) made `volunteer_profiles.v_score` a CACHE
-- of a replay of the volunteer's history. That gave the score one writer, which
-- is what makes it correctable — and it left the three flat penalties with
-- nowhere to live. A penalty applied by arithmetic on the stored number sits in
-- no history, so the next replay erases it, silently, after a screen has shown
-- it. `/api/vscore`'s penalty action was therefore disabled outright.
--
-- Owner's decision, 2026-08-27: build the home rather than leave a designed
-- rule permanently unappliable. Her words, and they are the right test —
-- something does not have to break before the fix is worth building.
--
-- ============================================================
-- WHAT THIS DOES **NOT** CHANGE
--
-- **NO EXISTING SCORE MOVES.** The table is created empty, and the replay adds
-- a term that is empty for everybody. The recompute at the bottom is a no-op
-- for every volunteer on the platform; it runs so that the cache is provably
-- consistent with the new function rather than assumed to be.
--
-- **THE FORMULA IS UNCHANGED, and this is deliberately not a formula change.**
-- A penalty is a flat subtraction at its point in the sequence, clamped to
-- [0, 100] — exactly what `applyVScorePenalty` has always done. Later reviews
-- blend it away at 0.7x apiece, exactly as they did when the score was a
-- running total. The amounts (-8, -2, and the approved late-release curve) are
-- the ones already approved. What changes is only WHERE a penalty is written.
-- ============================================================


-- ============================================================
-- 1. The kinds
--
-- `no_show` IS DELIBERATELY ABSENT, and this is the most important line in the
-- file. A no-show already has a home in the replayable history: a review filed
-- with `attended = false` floors that event's outcome to 0. Adding it here
-- would rebuild the exact double-punishment CLAUDE.md forbids — "one writer
-- owns every score change, so a single no-show cannot be punished twice".
--
-- The three that remain are the three with nowhere else to go, because none of
-- them produces an `event_reviews` row:
--
--   late_cancellation     -8   cancelled an accepted place inside the window
--   on_time_cancellation  -2   cancelled an accepted place in good time
--   late_release               dropped a committed DAY inside 24 hours of it,
--                              at the approved figure (two free per rolling 90
--                              days, then -8 x days released / days committed,
--                              floored at -2 and capped at -8)
-- ============================================================

do $$ begin
  create type score_event_kind as enum (
    'late_cancellation',
    'on_time_cancellation',
    'late_release'
  );
exception when duplicate_object then null; end $$;


-- ============================================================
-- 2. The table
--
-- WHY `points` IS STORED RATHER THAN DERIVED. This is the one real asymmetry
-- with `event_reviews`, and it looks like an inconsistency until you see why.
-- A review stores its RATINGS and the outcome is computed at replay time — the
-- review is evidence, the score is a conclusion drawn from it. A penalty is the
-- other way round: the deduction IS the decision. Two consequences, and both
-- argue for keeping the number:
--
--   1. Recomputing at replay time would let a later change to the amounts
--      silently re-punish cancellations settled months ago, at a figure nobody
--      was ever told.
--   2. The late-release amount cannot honestly be recomputed at all. It depends
--      on how many late releases were already in the rolling 90-day window AT
--      THE MOMENT OF THE RELEASE, and that window has moved since. Deriving it
--      later would produce a different, equally confident, wrong answer.
--
-- So a penalty, once applied, means what it meant.
--
-- `points < 0` is enforced. A zero-point penalty is not an event — the first
-- two late releases in a window are free, and a free release is recorded by
-- `application_days.late_release`, not here. Rows in this table are exactly the
-- ones that move a score.
--
-- `dedupe_key` + `unique (volunteer_id, dedupe_key)` is what makes the writer
-- safe to retry. The endpoint constructs it from the thing being penalised
-- (`cancellation:<application_id>`, `late_release:<application_day_id>:<ts>`),
-- so a duplicate request is a no-op rather than a second deduction. Getting
-- this wrong is not a cosmetic bug: it is charging somebody twice for one act.
--
-- The foreign keys are `on delete set null` on purpose, EXCEPT the volunteer's.
-- A penalty outlives the outreach or application it refers to, because it is
-- the record of something that happened; but a penalty against a deleted person
-- is meaningless, so that one cascades.
-- ============================================================

create table if not exists score_events (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references profiles(id) on delete cascade,
  kind score_event_kind not null,
  points numeric not null check (points < 0 and points >= -100),

  outreach_id uuid references outreaches(id) on delete set null,
  application_id uuid references applications(id) on delete set null,
  outreach_day_id uuid references outreach_days(id) on delete set null,

  -- Why this deduction was applied, in words, for the volunteer and for an
  -- admin looking at it later. Required for the same reason a dispute's
  -- resolution and a vetted source's rationale are: a number with no reason
  -- attached is something people have to take on trust.
  reason text not null check (length(btrim(reason)) > 0),

  -- Reversal. An admin who applied one wrongly voids it; the row STAYS,
  -- because a penalty is a record and deleting one would erase the evidence
  -- behind a score exactly the way editing an attendance row would. A voided
  -- row stops counting in the replay — the same treatment an upheld dispute
  -- gives a review.
  voided_at timestamptz,
  voided_reason text,

  dedupe_key text not null,
  created_at timestamptz not null default now(),

  unique (volunteer_id, dedupe_key)
);

comment on table score_events is
  'Flat V-Score deductions that produce no event_reviews row: cancellations and late per-day releases. Part of the replayable history that volunteer_profiles.v_score is derived from. Service-role writes only. A no-show is NOT here -- it is expressed by a review with attended = false.';

-- The replay reads this per volunteer, in time order, on every single score
-- write. Without the index that is a sequential scan of the whole table each
-- time a review is filed.
create index if not exists idx_score_events_replay
  on score_events (volunteer_id, created_at, id)
  where voided_at is null;


-- ============================================================
-- 3. Who may read it, and who may write it
--
-- NOBODY WRITES IT FROM A CLIENT. Not the volunteer, not the organisation, not
-- an admin's browser session. A client that could insert here could penalise
-- anybody by name; a client that could update here could void its own
-- penalties. Both are service-role-only through /api/vscore, the same treatment
-- as v_score itself — RLS decides which rows, and the grant list decides which
-- columns, and here the answer to the second is "none".
--
-- READ ACCESS is the volunteer themselves and an admin. Deliberately NOT the
-- organisation: it is a person's disciplinary record, and an organisation
-- already sees the V-Score the record produced. Seeing the reasons behind
-- somebody's number is not the same as seeing their number.
--
-- There is deliberately NO trigger refusing DELETE, unlike `admin_actions`.
-- One would break account deletion — `volunteer_id` cascades from `profiles`,
-- and a cascade is a DELETE that the trigger could not tell apart from a bad
-- one. The supported reversal is `voided_at`; the clients cannot delete because
-- the privilege is revoked, and the service role must not, which is what this
-- comment is for.
-- ============================================================

alter table score_events enable row level security;

drop policy if exists "score_events_select_own_or_admin" on score_events;
create policy "score_events_select_own_or_admin"
  on score_events for select
  to authenticated
  using (volunteer_id = auth.uid() or is_admin());

revoke insert, update, delete on score_events from authenticated;
revoke all on score_events from anon;
grant select on score_events to authenticated;


-- ============================================================
-- 4. The replay, extended
--
-- `create or replace`, so this is safe whether or not 20260903a's version is
-- already in place.
--
-- ONE MERGED STREAM, not two. The score is order-dependent, so two separate
-- passes could not express "the cancellation came before the review". Reviews
-- and penalties are unioned, ordered together by `created_at`, and walked once.
--
-- THE TIE-BREAK IS `(created_at, source_rank, id)`. `source_rank` puts a review
-- before a penalty when the two carry the same timestamp to the microsecond.
-- That choice is arbitrary — what is not arbitrary is that it is FIXED, because
-- without it two entries filed in the same instant would replay in whatever
-- order the planner happened to return and the score would not be
-- reproducible.
--
-- FILING ORDER, still, for the same reason as before: the blend is
-- order-dependent, so ordering by the event's date would re-insert a
-- late-reviewed event ahead of ones already counted and move a score for a
-- reason unconnected to any error.
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

    -- Penalties. They carry no attendance and no ratings, and never touch the
    -- attendance count -- cancelling is not attending.
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
-- 5. Re-run the recompute
--
-- A no-op today: score_events is empty, so every volunteer replays to exactly
-- what 20260903b already stored. It runs anyway, because "the cache agrees with
-- the function" should be something that was CHECKED rather than reasoned
-- about — and from here on, this is the statement any future change to the
-- replay ends with.
--
-- Idempotent, like 20260903b: replaying the same history twice gives the same
-- numbers.
-- ============================================================

-- It REPORTS ITS OWN ROW COUNT rather than leaving that to be inferred. The
-- update is wrapped in a data-modifying CTE so the number of scores it actually
-- changed comes back as the result of the statement:
--
--   scores_moved_by_this_migration   0   expected, and the point of the file
--
-- Anything other than 0 means the new replay disagrees with the old one on a
-- platform where no penalty exists yet, which would be a bug in section 4
-- rather than a correction. Stop and send me the number.
with replayed as (select * from vscore_replay()),
moved as (
  update volunteer_profiles vp
     set v_score = round(coalesce(r.score, 70), 2),
         events_attended = coalesce(r.events_attended, 0),
         v_score_recomputed_at = now()
    from replayed r
   where r.volunteer_id = vp.id
     and (vp.v_score is distinct from round(coalesce(r.score, 70), 2)
          or vp.events_attended is distinct from coalesce(r.events_attended, 0))
  returning vp.id
)
select count(*) as scores_moved_by_this_migration from moved;


-- ============================================================
-- 6. Verification — run this after, and read the numbers
--
-- EVERY FIGURE IS A COUNT, and the expected value is on the right. Nothing here
-- is a flag, so no number means the opposite of how it reads.
--
--   table_present        1   score_events exists
--   penalty_rows         0   nobody has been penalised yet -- the table is new
--   client_write_grants  0   authenticated cannot insert, update or delete
--   no_show_labels       0   'no_show' is NOT one of the kinds (see section 1)
--   scores_disagreeing   0   every cached v_score equals its replay
-- ============================================================

with replayed as (select * from vscore_replay())
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'score_events') as table_present,
  (select count(*) from score_events) as penalty_rows,
  (select count(*) from information_schema.column_privileges
    where table_name = 'score_events' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE')) as client_write_grants,
  (select count(*) from pg_enum e
     join pg_type t on t.oid = e.enumtypid
    where t.typname = 'score_event_kind' and e.enumlabel = 'no_show') as no_show_labels,
  (select count(*)
     from volunteer_profiles vp
     left join replayed r on r.volunteer_id = vp.id
    where round(coalesce(r.score, 70), 2) <> vp.v_score) as scores_disagreeing;
