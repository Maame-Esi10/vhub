-- ============================================================================
-- 2026-09-24. Approved and applied by the owner (self-checks passed).
--
-- "Your application was refused. Please reload this outreach and try again."
--
-- THE CAUSE. `apply_to_outreach()` (20260818) is SECURITY INVOKER, so it runs
-- with the volunteer's own privileges, and it clears the application's
-- committed days with `delete from application_days` before writing the new
-- ones. Three days later `20260821_per_day_release.sql` revoked DELETE on
-- application_days from `authenticated` -- correctly, because a day commitment
-- is evidence a V-Score is derived from and must be released, never erased.
-- Nobody drew the consequence: Postgres checks the DELETE privilege when the
-- statement is planned, whether or not any row would match, so from that moment
-- EVERY application through the app has failed with 42501, first applications
-- included, which have no rows to delete at all. The app maps 42501 to
-- "refused".
--
-- WHY IT WAS NOT SEEN (probable, not proven). The applicants used in testing
-- since then came from `supabase/seed/02_apply_to_outreach.sql`, which inserts
-- directly as the database owner and never calls this function. The read-only
-- check given alongside this file confirms or kills the diagnosis before it is
-- pasted.
--
-- THE FIX, and why not the obvious ones.
--   * Granting DELETE back would reopen the hole 20260821 closed: a crafted
--     client call could erase a commitment silently.
--   * Making apply_to_outreach SECURITY DEFINER would bypass
--     `applications_insert_own`, which IS the verification gate and the
--     "outreach must be open" rule. Never.
--   * So: a FIRST application skips the delete (there is nothing to clear), and
--     a RE-application after a withdrawal clears the withdrawn commitment
--     through one narrow definer function that refuses anything but the
--     caller's own CANCELLED application with no attendance recorded against
--     it. That is exactly the case the delete was written for, and nothing
--     else can reach it.
--
-- Idempotent. No begin/commit (the editor wraps the paste in one transaction).
-- ============================================================================

create or replace function clear_withdrawn_application_days(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  app applications;
begin
  select * into app from applications where id = p_application_id;

  if not found
     or app.volunteer_id is distinct from auth.uid()
     or app.status <> 'cancelled' then
    raise exception 'Only your own withdrawn application can be cleared.'
      using errcode = 'insufficient_privilege';
  end if;

  -- An attended day is evidence and is never erased, whatever the status says.
  if exists (
    select 1 from attendance
     where outreach_id = app.outreach_id
       and volunteer_id = app.volunteer_id
  ) then
    raise exception 'This application has attendance recorded and cannot be cleared.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from application_days where application_id = p_application_id;
end;
$$;

revoke all on function clear_withdrawn_application_days(uuid) from public, anon;
grant execute on function clear_withdrawn_application_days(uuid) to authenticated;


create or replace function apply_to_outreach(
  p_outreach_id      uuid,
  p_type             text,
  p_motivation       text,
  p_outreach_role_id uuid,
  -- NULL or empty means every day of the outreach, which is the honest reading
  -- of a one-day event and of a quick join that was never asked to choose.
  p_day_ids          uuid[] default null
) returns applications
language plpgsql
security invoker
set search_path = public
as $$
declare
  existing applications;
  saved    applications;
begin
  select * into existing
    from applications
   where outreach_id = p_outreach_id
     and volunteer_id = auth.uid();

  if found and existing.status <> 'cancelled' then
    raise exception 'You have already applied to this outreach.'
      using errcode = 'unique_violation';
  end if;

  if found then
    -- Clear the withdrawn commitment WHILE the row still reads 'cancelled',
    -- which is the only state the helper accepts. Done through the helper
    -- because this function runs as the volunteer, who holds no DELETE on
    -- application_days (20260821).
    perform clear_withdrawn_application_days(existing.id);

    -- A withdrawn application still occupies UNIQUE (outreach_id,
    -- volunteer_id), so re-applying reactivates the row rather than inserting.
    -- outreach_role_id is deliberately NOT rewritten: it is INSERT-only, so a
    -- revived application keeps the role it was made for.
    update applications
       set status              = 'pending',
           type                = p_type::application_type,
           motivation          = p_motivation,
           cancellation_reason = null
     where id = existing.id
     returning * into saved;
  else
    -- A first application has no committed days, so there is nothing to clear
    -- and no DELETE is issued at all.
    insert into applications (
      outreach_id, volunteer_id, type, motivation, outreach_role_id
    ) values (
      p_outreach_id, auth.uid(), p_type::application_type, p_motivation, p_outreach_role_id
    )
    returning * into saved;
  end if;

  insert into application_days (application_id, outreach_day_id)
  select saved.id, d.id
    from outreach_days d
   where d.outreach_id = p_outreach_id
     and (
       p_day_ids is null
       or array_length(p_day_ids, 1) is null
       or d.id = any (p_day_ids)
     )
  on conflict (application_id, outreach_day_id) do nothing;

  -- Zero days is never a valid commitment.
  if not exists (select 1 from application_days where application_id = saved.id) then
    raise exception 'Choose at least one day you can attend.'
      using errcode = 'check_violation';
  end if;

  return saved;
end;
$$;

grant execute on function apply_to_outreach(uuid, text, text, uuid, uuid[]) to authenticated;


-- ============================================================
-- Verification. Silence means it landed.
-- ============================================================
do $$
begin
  -- The hole 20260821 closed stays closed.
  if has_table_privilege('authenticated', 'public.application_days', 'DELETE') then
    raise exception 'authenticated can DELETE application_days again -- the evidence hole is open.';
  end if;

  -- apply_to_outreach still runs as the caller, so the RLS gate still applies.
  if exists (select 1 from pg_proc where proname = 'apply_to_outreach' and prosecdef) then
    raise exception 'apply_to_outreach became SECURITY DEFINER -- it would bypass applications_insert_own.';
  end if;

  -- The function no longer issues the bare delete.
  if exists (
    select 1 from pg_proc
     where proname = 'apply_to_outreach'
       and prosrc ilike '%delete from application_days%'
  ) then
    raise exception 'apply_to_outreach still deletes application_days directly.';
  end if;
end;
$$;
