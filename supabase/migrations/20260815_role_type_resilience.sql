-- ============================================================
-- role_type: repair the row, then make the null unreachable.
--
-- RUN AS ONE PASTE. No transaction control of its own, so the editor's
-- transaction wraps it. Idempotent.
--
-- WHAT HAPPENED. Editing an outreach into "Specific roles" mode wrote
-- role_type = NULL on purpose, because in multi-role mode the value is derived
-- from the roles by trigger. The role insert then failed on the enum-cast bug,
-- the trigger never ran, and the NULL stayed. "Free BP & Diabetes Screening"
-- is that row.
--
-- WHY A NULL IS NOT MERELY UNTIDY. role_type drives the verification gate, and
-- every reader of it compares against 'clinical':
--
--     role_type = 'clinical'   -- NULL => NULL => falsy => treated as SUPPORT
--
-- So an outreach with no role type is treated as a support event by both the
-- app and application_role_is_clinical(), and an unverified volunteer may
-- submit a full application to it. The ambiguous state FAILS OPEN, which is
-- the wrong direction for a gate. It is also invisible to a feed filtered by
-- either role type, since it matches neither.
--
-- THREE CHANGES, in the order they must happen:
--   1. Repair the existing NULL.
--   2. Make the gate treat an unknown role type as clinical -- defence in
--      depth, so a NULL arriving by any future route fails CLOSED.
--   3. Forbid the NULL at the column, so it cannot be written again.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Repair.
--
-- Derived from the roles where there are any, exactly as the trigger would.
-- Where there are none the outreach is single-role and the database cannot
-- know what was intended, so it takes the RESTRICTIVE answer: 'clinical'.
--
-- That direction is deliberate. Guessing 'support' would silently open a
-- possibly-clinical event to unverified volunteers, which is the failure this
-- whole migration exists to remove. Guessing 'clinical' costs at most one
-- correction by the organisation in Edit event, and it costs it visibly.
-- ------------------------------------------------------------
update outreaches o
   set role_type = coalesce(
         (
           select case
                    when bool_or(r.role_type = 'clinical') then 'clinical'
                    else 'support'
                  end
             from outreach_roles r
            where r.outreach_id = o.id
         ),
         'clinical'
       )::outreach_role_type
 where o.role_type is null;


-- ------------------------------------------------------------
-- 2. The gate fails closed on an unknown role type.
--
-- Previously the final fallback was `false`, so a NULL outreach role_type fell
-- through to "not clinical" and waved the application through. An unknown
-- requirement is not the same as a known-support one, and only one of the two
-- is safe to assume.
--
-- The chosen role still wins whenever there is one: a support role on a mixed
-- event stays open to unverified volunteers, which is the whole point of
-- multi-role and is unchanged by this.
-- ------------------------------------------------------------
create or replace function application_role_is_clinical(
  p_outreach_id uuid,
  p_role_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- The role the volunteer actually applied for, when they chose one.
    (select r.role_type = 'clinical' from outreach_roles r where r.id = p_role_id),
    -- Otherwise the outreach's own summary (single-role mode).
    (select o.role_type = 'clinical' from outreaches o where o.id = p_outreach_id),
    -- Neither could be resolved: treat it as clinical and require
    -- verification. Fail closed.
    true
  );
$$;

grant execute on function application_role_is_clinical(uuid, uuid) to authenticated;


-- ------------------------------------------------------------
-- 3. The column stops accepting NULL.
--
-- NO DEFAULT, deliberately. A default of 'support' would let a write that
-- forgot the column quietly produce the same fail-open state this migration is
-- removing; a default of 'clinical' would hide the omission behind a value
-- nobody chose. With neither, an insert that omits role_type fails loudly and
-- is fixed once, at the call site.
--
-- The client no longer writes NULL in multi-role mode either: it now sends the
-- summary it can compute from the roles it is about to write, and the trigger
-- re-derives the authoritative value immediately afterwards.
-- ------------------------------------------------------------
alter table outreaches
  alter column role_type set not null;


-- ============================================================
-- 4. An outreach with a history cannot be deleted.
--
-- `outreaches_delete_own` (schema.sql) allows the owning organisation to
-- delete ANY of its outreaches, and applications, attendance and event_reviews
-- all cascade from it. So a delete today destroys volunteers' application
-- history and the event records their V-Score is derived from -- records that
-- are not the organisation's to erase. A V-Score has to stay explainable from
-- the events that produced it.
--
-- The rule matches what the UI will offer: a draft, or an outreach nobody has
-- ever touched, can go; anything with a history must be CANCELLED instead.
-- Enforced here rather than in the screen, because RLS already permits the
-- delete and a client is not the right place to hold the line.
-- ============================================================
create or replace function refuse_delete_of_used_outreach() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  application_count int;
  attendance_count  int;
  review_count      int;
begin
  select count(*) into application_count from applications  where outreach_id = old.id;
  select count(*) into attendance_count  from attendance    where outreach_id = old.id;
  select count(*) into review_count      from event_reviews where outreach_id = old.id;

  -- Cancelled applications count too. Someone applied and withdrew; that is
  -- still their record of having been involved.
  if application_count > 0 or attendance_count > 0 or review_count > 0 then
    raise exception
      'This outreach has % application(s), % attendance record(s) and % review(s). Cancel it instead of deleting it.',
      application_count, attendance_count, review_count
      using errcode = 'restrict_violation';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_outreaches_refuse_used_delete on outreaches;
create trigger trg_outreaches_refuse_used_delete
  before delete on outreaches
  for each row execute function refuse_delete_of_used_outreach();


-- ============================================================
-- 5. Verification
-- ============================================================
select
  title,
  status,
  role_type,
  slots_total,
  slots_filled
  from outreaches
 order by created_at desc;

-- Expected: four rows, every role_type populated. "Free BP & Diabetes
-- Screening" now reads 'clinical' because it had no roles to derive from and
-- the repair takes the restrictive answer. If that event is actually a support
-- event, open it in Edit event and change it -- one tap, and it is now a
-- choice somebody made rather than a gap nobody noticed.
