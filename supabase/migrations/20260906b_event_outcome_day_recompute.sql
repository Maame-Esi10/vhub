-- ============================================================
-- Multi-day participation scaling, PART B — THE WRITE. Run 20260906a first and
-- READ ITS REPORT.
--
-- **STOP IF PART A'S REPORT SHOWED ANY ROW MARKED 'INVESTIGATE'.** A score that
-- moves with no partial attendance behind it means the replay disagrees with
-- history for a reason nobody has explained, and running this would bake that
-- disagreement into everybody's score.
--
-- If part A's report was EMPTY — the expected outcome — this file still needs
-- running. It is a no-op for every number, and it exists so that the stored
-- cache is provably consistent with the new definition of `vscore_replay()`
-- rather than assumed to be, and so that `v_score_recomputed_at` reflects the
-- current rule.
--
-- WHAT IT DOES: sets every volunteer's `v_score` and `events_attended` to the
-- replayed value and stamps `v_score_recomputed_at`. Idempotent — running it
-- twice produces the same numbers, because the second run replays the same
-- history.
--
-- WHAT IT DOES NOT DO: touch `event_reviews`, `attendance`, `application_days`,
-- `score_events`, `disputes`, or any other record. The history is the truth;
-- this only rebuilds the cache of it.
-- ============================================================


-- ============================================================
-- 1. Keep a copy of what the numbers were before
--
-- A SEPARATE table from `v_score_recompute_backup`, not more rows in it, and
-- the reason is a real one rather than tidiness. That table is keyed on
-- `volunteer_id` alone and its insert is `on conflict do nothing`, because the
-- first backup — the pre-derivation running total — is the valuable one and
-- must never be overwritten. Writing this recompute's "before" into it would
-- either be silently discarded or destroy exactly the number it exists to
-- preserve. Two recomputes are two events and get two tables.
--
-- RLS FROM THE START, not added afterwards. `v_score_recompute_backup` shipped
-- without it and any signed-in user could read everybody's scores until
-- 20260905 closed it. The lesson recorded there: whether a table needs RLS is
-- decided by WHAT IS IN IT, never by what it is for.
-- ============================================================

create table if not exists v_score_day_scaling_backup (
  volunteer_id uuid primary key,
  previous_score numeric not null,
  previous_events_attended integer not null,
  new_score numeric not null,
  new_events_attended integer not null,
  taken_at timestamptz not null default now()
);

comment on table v_score_day_scaling_backup is
  'What every volunteer''s v_score was immediately before the multi-day participation scaling was applied (20260906b). The only record of the pre-scaling number; read-only to admins.';

alter table v_score_day_scaling_backup enable row level security;

drop policy if exists "v_score_day_scaling_backup_select_admin" on v_score_day_scaling_backup;
create policy "v_score_day_scaling_backup_select_admin"
  on v_score_day_scaling_backup for select
  to authenticated
  using (is_admin());

-- Belt to the braces. RLS already denies these; the revokes make a stray
-- attempt fail as `permission denied for table` rather than as an empty result.
revoke all on v_score_day_scaling_backup from anon;
revoke insert, update, delete on v_score_day_scaling_backup from authenticated;
grant select on v_score_day_scaling_backup to authenticated;

-- `on conflict do nothing` for the same reason as before: on a re-run the FIRST
-- backup is the one holding the pre-scaling value.
insert into v_score_day_scaling_backup (
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
-- ============================================================

update volunteer_profiles vp
   set v_score = round(coalesce(r.score, 70), 2),
       events_attended = coalesce(r.events_attended, 0),
       v_score_recomputed_at = now()
  from (select * from vscore_replay()) r
 where r.volunteer_id = vp.id;

-- The ones with no reviews and no penalties at all, which the join cannot
-- reach. If their stored value is not 70, it came from something that is not in
-- the replayable history, and this is the moment that becomes visible.
update volunteer_profiles vp
   set v_score = 70,
       events_attended = 0,
       v_score_recomputed_at = now()
 where not exists (select 1 from event_reviews er where er.volunteer_id = vp.id)
   and not exists (select 1 from score_events se where se.volunteer_id = vp.id)
   and (vp.v_score is distinct from 70 or vp.events_attended is distinct from 0);


-- ============================================================
-- 3. Verification — run this after, and read the numbers
--
-- Expected:
--   still_disagreeing    0   every stored score equals its replay
--   never_recomputed     0   every volunteer has a timestamp
--   backup_rows              one per volunteer — the record of what changed
--   biggest_move         0   expected, if part A's report was empty
--   partial_attendance   0   how many volunteers have a ratio below 1 anywhere;
--                            0 today, and the number to watch later
--   rls_enabled          1   the new backup table is locked
--   client_write_grants  0   authenticated cannot insert, update or delete it
--   anon_grants          0   anon has nothing at all
-- ============================================================

with replayed as (select * from vscore_replay())
select
  (select count(*)
     from volunteer_profiles vp
     left join replayed r on r.volunteer_id = vp.id
    where round(coalesce(r.score, 70), 2) <> vp.v_score)              as still_disagreeing,
  (select count(*) from volunteer_profiles
    where v_score_recomputed_at is null)                              as never_recomputed,
  (select count(*) from v_score_day_scaling_backup)                   as backup_rows,
  (select coalesce(max(abs(new_score - previous_score)), 0)
     from v_score_day_scaling_backup)                                 as biggest_move,
  (select count(distinct er.volunteer_id)
     from event_reviews er
    where vscore_day_ratio(er.volunteer_id, er.outreach_id) < 1)      as partial_attendance,
  (select count(*) from pg_tables
    where schemaname = 'public' and tablename = 'v_score_day_scaling_backup'
      and rowsecurity)                                                as rls_enabled,
  (select count(*) from information_schema.table_privileges
    where table_name = 'v_score_day_scaling_backup' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE'))           as client_write_grants,
  (select count(*) from information_schema.table_privileges
    where table_name = 'v_score_day_scaling_backup' and grantee = 'anon') as anon_grants;
