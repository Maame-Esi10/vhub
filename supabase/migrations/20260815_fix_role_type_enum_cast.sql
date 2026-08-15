-- ============================================================
-- Fix: the role_type summary trigger assigned text to an enum column.
--
-- RUN THIS AS ONE PASTE. It replaces one function and reports the damage the
-- bug caused. It carries no transaction control of its own, so the Supabase
-- editor's transaction wraps it.
--
-- THE BUG. `sync_outreach_role_type()` (20260811_multi_role_outreaches.sql)
-- summarised the outreach's role_type from its roles like this:
--
--     set role_type = case when exists (...) then 'clinical' else 'support' end
--
-- `outreaches.role_type` is the ENUM `outreach_role_type`; `outreach_roles.
-- role_type` is plain text with a check constraint. A bare literal assigned to
-- an enum column is fine — an untyped literal coerces straight to the target
-- type. A CASE is not: CASE resolves its untyped branches to `text` before the
-- assignment is considered, so the trigger tried to put text into an enum and
-- Postgres refused with
--
--     column "role_type" is of type outreach_role_type
--     but expression is of type text
--
-- This fired on EVERY insert into outreach_roles, which means multi-role
-- outreaches could never be written at all — not from the create wizard and not
-- from the editor. It went unnoticed because the create path had not yet been
-- run end to end against the live database.
--
-- THE FIX is the explicit cast, at the boundary where the value crosses into
-- the enum column. `::outreach_role_type` also makes the trigger fail loudly at
-- migration time rather than silently at runtime if the enum ever gains or
-- loses a value.
-- ============================================================

create or replace function sync_outreach_role_type() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_outreach uuid := coalesce(new.outreach_id, old.outreach_id);
begin
  update outreaches o
     set role_type = (
           case
             when exists (
               select 1 from outreach_roles r
                where r.outreach_id = o.id and r.role_type = 'clinical'
             ) then 'clinical' else 'support'
           end
         )::outreach_role_type
   where o.id = affected_outreach
     and exists (select 1 from outreach_roles where outreach_id = affected_outreach);
  return null;
end;
$$;


-- ============================================================
-- Damage report — what the failed writes left behind.
--
-- `useReplaceOutreachRoles` deletes an outreach's roles and then inserts the
-- new ones as two separate statements, so a failed insert left the DELETE
-- committed. Any outreach whose roles were being edited when the error struck
-- therefore lost them and silently fell back to single-role mode.
--
-- Two things are detectable and neither can be undone automatically, because
-- the deleted rows are gone:
--
--   1. An outreach carrying a slots_total that no longer matches any roles.
--      The delete trigger is guarded on roles still existing, so when the LAST
--      role row went the outreach kept the summed total it had derived.
--   2. Applications left with no role. `outreach_role_id` is ON DELETE SET
--      NULL, so an application to a deleted role survives as a record but no
--      longer points anywhere.
-- ============================================================

select
  o.id,
  o.title,
  o.status,
  o.role_type,
  o.slots_total,
  o.slots_filled,
  (select count(*) from outreach_roles r where r.outreach_id = o.id)  as role_rows,
  (select count(*) from applications a
    where a.outreach_id = o.id and a.outreach_role_id is null
      and a.status <> 'cancelled')                                     as applications_without_role
  from outreaches o
 order by o.created_at desc;

-- HOW TO READ IT.
--
-- `role_rows = 0` is NORMAL and is what almost every outreach should show —
-- that is single-role mode, the default, and nothing is wrong with it.
--
-- The one row to look at is any outreach you know you set up with SPECIFIC
-- ROLES that comes back with `role_rows = 0`. That is one the failed write
-- emptied. Open it in Edit event, choose "Specific roles", set them again and
-- save; with the cast fixed the insert now succeeds. If it also shows
-- `applications_without_role > 0`, those volunteers applied to a role that no
-- longer exists and will need placing by hand from Applicant Vetting.
