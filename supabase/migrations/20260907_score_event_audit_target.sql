-- ============================================================
-- `score_event` becomes an admin_actions target kind.
--
-- ONE PASTE, and safe to re-run. `target_type` is a CHECK constraint rather
-- than an enum precisely so that this is a plain drop-and-add inside one
-- transaction instead of the two-paste dance an enum value needs — the reason
-- is recorded in 20260825b and this is the first time it has been collected on.
--
-- WHY NOW. An admin can reverse a V-Score deduction (`/api/score-event`), and
-- every admin write from the first one onwards records an audit row. Without
-- this value the insert fails the check and the endpoint's `recordAdminAction`
-- throws — which is the correct behaviour for an unrecordable decision, and
-- exactly why this has to land with the feature rather than after it.
--
-- NOTHING ELSE CHANGES. No existing row is touched; the list only grows.
-- ============================================================

alter table admin_actions drop constraint if exists admin_actions_target_type_check;

alter table admin_actions add constraint admin_actions_target_type_check
  check (target_type in (
    'volunteer',
    'organisation',
    'outreach',
    'application',
    'event_review',
    'dispute',
    'document',
    'vetted_source',
    'policy',
    'score_event'
  ));


-- ============================================================
-- Verification — expected:
--   accepts_score_event  1   the new value passes the constraint
--   existing_rows_ok     0   no existing row now violates it
-- ============================================================

select
  (select count(*) from pg_constraint
    where conname = 'admin_actions_target_type_check'
      and pg_get_constraintdef(oid) like '%score_event%')      as accepts_score_event,
  (select count(*) from admin_actions
    where target_type not in (
      'volunteer', 'organisation', 'outreach', 'application', 'event_review',
      'dispute', 'document', 'vetted_source', 'policy', 'score_event'
    ))                                                          as existing_rows_ok;
