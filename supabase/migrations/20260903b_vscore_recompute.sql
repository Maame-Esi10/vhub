-- ============================================================
-- V-Score reversal, PART B — THE WRITE. Run 20260903a first and READ ITS
-- REPORT.
--
-- This is the only file in the admin phase that changes a number a real person
-- can see about themselves. It is separate from part A for exactly that
-- reason: part A can be pasted freely, this one should be pasted once, on
-- purpose, after the dry run has been read.
--
-- **STOP IF PART A'S REPORT SHOWED ANY ROW MARKED 'INVESTIGATE'.** That
-- combination should be impossible — a score that moves with no upheld dispute
-- and no edited review means the replay disagrees with history for a reason
-- nobody has explained yet, and running this would bake that disagreement into
-- everybody's score.
--
-- WHAT IT DOES: sets every volunteer's `v_score` and `events_attended` to the
-- replayed value, and stamps `v_score_recomputed_at`. Nothing else. It is
-- idempotent — running it twice produces the same numbers, because the second
-- run replays the same history.
--
-- WHAT IT DOES NOT DO: touch `event_reviews`, `attendance`, `disputes` or any
-- other record. The history is the truth; this only rebuilds the cache of it.
-- ============================================================

-- ============================================================
-- 1. Keep a copy of what the numbers were before
--
-- A permanent table, not a temp one, and not skipped. Temp tables vanish
-- between statements in the Supabase editor, and more importantly: this is the
-- only record of what the running total said. If a volunteer ever asks why
-- their score changed on this date, the answer has to be lookup-able rather
-- than reconstructed.
--
-- Small, written once, and safe to drop by hand in a year.
-- ============================================================

create table if not exists v_score_recompute_backup (
  volunteer_id uuid primary key,
  previous_score numeric not null,
  previous_events_attended integer not null,
  new_score numeric not null,
  new_events_attended integer not null,
  taken_at timestamptz not null default now()
);

-- `on conflict do nothing`: on a re-run, the FIRST backup is the valuable one
-- — it holds the pre-migration running total. Overwriting it with the second
-- run's "before" (which is already the replayed value) would destroy exactly
-- the number the backup exists to preserve.
insert into v_score_recompute_backup (
  volunteer_id, previous_score, previous_events_attended, new_score, new_events_attended
)
select
  vp.id,
  vp.v_score,
  vp.events_attended,
  round(coalesce(r.score, 70), 2),
  coalesce(r.events_attended, 0)
from volunteer_profiles vp
left join (select * from vscore_replay()) r on r.volunteer_id = vp.id
on conflict (volunteer_id) do nothing;


-- ============================================================
-- 2. The recompute
--
-- `round(..., 2)` because the blend produces long decimals and a score is read
-- by humans as a whole-ish number. Rounding at the point of storage rather
-- than at the point of display keeps the stored value and the displayed value
-- the same thing.
--
-- A volunteer with no reviews gets exactly 70 — the starting score — rather
-- than being left alone. That matters: if their stored value is not 70, it
-- came from something that is not in the replayable history, and this is the
-- moment that becomes visible rather than staying hidden.
-- ============================================================

update volunteer_profiles vp
   set v_score = round(coalesce(r.score, 70), 2),
       events_attended = coalesce(r.events_attended, 0),
       v_score_recomputed_at = now()
  from (select * from vscore_replay()) r
 where r.volunteer_id = vp.id;

-- The ones with no reviews at all, which the join above cannot reach.
update volunteer_profiles vp
   set v_score = 70,
       events_attended = 0,
       v_score_recomputed_at = now()
 where not exists (select 1 from event_reviews er where er.volunteer_id = vp.id)
   and (vp.v_score is distinct from 70 or vp.events_attended is distinct from 0);


-- ============================================================
-- 3. Verification — run this after, and read the numbers
--
-- Expected:
--   still_disagreeing   0   (every stored score now equals its replay)
--   never_recomputed    0   (every volunteer has a timestamp)
--   backup_rows             (one per volunteer — the record of what changed)
--   biggest_move            (the largest single change, for the record)
-- ============================================================

with replayed as (select * from vscore_replay())
select
  (select count(*)
     from volunteer_profiles vp
     left join replayed r on r.volunteer_id = vp.id
    where round(coalesce(r.score, 70), 2) <> vp.v_score) as still_disagreeing,
  (select count(*) from volunteer_profiles where v_score_recomputed_at is null) as never_recomputed,
  (select count(*) from v_score_recompute_backup) as backup_rows,
  (select coalesce(max(abs(new_score - previous_score)), 0)
     from v_score_recompute_backup) as biggest_move;
