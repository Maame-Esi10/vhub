-- ============================================================
-- save_outreach() — one transaction for an edit that spans two tables.
--
-- RUN AS ONE PASTE. Idempotent (create or replace).
--
-- THE PROBLEM. Editing an outreach writes the details to `outreaches` and the
-- staffing to `outreach_roles`, and supabase-js cannot span two tables in one
-- transaction. Every request is its own transaction, so a save was two or three
-- of them and a failure between them left the event describing one thing and
-- staffed as another. Writing the fragile one first narrowed the window; only a
-- function body closes it, because a function body IS a transaction.
--
-- Three writes become atomic here: the details update, the role delete, and the
-- role insert. Any exception rolls back all three.
--
-- SECURITY INVOKER, NOT DEFINER. This runs with the CALLER's privileges, so
-- `outreaches_update_own`, `outreach_roles_write` and every column-level GRANT
-- still apply exactly as they do to a direct PostgREST call. A definer function
-- would bypass RLS and hand any authenticated user the ability to rewrite
-- another organisation's event -- the opposite of what this is for. Nothing
-- here needs elevation: an organisation editing its own outreach is already
-- permitted to do all three writes.
--
-- The parameters are explicit and typed rather than a jsonb patch, so the
-- column list is fixed, auditable, and cannot be widened by a crafted payload
-- into columns the GRANTs deliberately withhold (slots_filled, status,
-- organisation_id, the check-in anchor).
-- ============================================================

create or replace function save_outreach(
  p_outreach_id      uuid,
  p_title            text,
  p_description      text,
  p_date             date,
  p_start_time       time,
  p_end_time         time,
  p_region           text,
  p_district         text,
  p_location_name    text,
  p_required_skills  text[],
  p_required_category text,
  p_role_type        outreach_role_type,
  -- NULL means "leave it to the roles": in multi-role mode the total is the
  -- sum of the roles and is maintained by trigger, so a client value would be
  -- overwritten anyway.
  p_slots_total      int,
  p_flyer_url        text,
  -- NULL means "do not touch the roles at all" — the common save, where only
  -- the details changed. A JSON ARRAY (including an empty one) replaces them
  -- wholesale; an empty array is how an outreach returns to single-role mode.
  p_roles            jsonb
) returns outreaches
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved outreaches;
begin
  -- Details first. In multi-role mode the role write below fires triggers that
  -- re-derive role_type and slots_total from the rows themselves, so doing the
  -- details first lets the derived answer win rather than being clobbered by
  -- the client's.
  update outreaches o
     set title             = p_title,
         description       = p_description,
         date              = p_date,
         start_time        = p_start_time,
         end_time          = p_end_time,
         region            = p_region,
         district          = p_district,
         location_name     = p_location_name,
         required_skills   = p_required_skills,
         required_category = p_required_category,
         role_type         = p_role_type,
         slots_total       = coalesce(p_slots_total, o.slots_total),
         flyer_url         = p_flyer_url
   where o.id = p_outreach_id;

  -- Zero rows means RLS refused it (someone else's outreach) or the id is
  -- wrong. Both are the same answer from here, and neither should look like a
  -- successful save.
  if not found then
    raise exception 'That outreach could not be found, or it is not yours to edit.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_roles is not null then
    delete from outreach_roles where outreach_id = p_outreach_id;

    -- jsonb_to_recordset rather than a loop: one statement, and the column
    -- types are declared here so a malformed payload fails on the cast instead
    -- of reaching the table.
    insert into outreach_roles (
      outreach_id, category, role_type, min_experience_level, slots_total
    )
    select
      p_outreach_id,
      r.category,
      r.role_type,
      r.min_experience_level,
      r.slots_total
      from jsonb_to_recordset(p_roles) as r(
             category             text,
             role_type            text,
             min_experience_level text,
             slots_total          int
           );
  end if;

  -- Re-read rather than using RETURNING: the role triggers rewrite role_type,
  -- slots_total and slots_filled after the update above, so a RETURNING row
  -- would hand back values that were already stale when it was captured.
  select * into saved from outreaches where id = p_outreach_id;
  return saved;
end;
$$;

grant execute on function save_outreach(
  uuid, text, text, date, time, time, text, text, text, text[], text,
  outreach_role_type, int, text, jsonb
) to authenticated;


-- ============================================================
-- Verification — the function exists and is INVOKER, not DEFINER.
-- prosecdef must come back FALSE. If it is true, the function bypasses RLS and
-- must not be used.
-- ============================================================
select p.proname, p.prosecdef as is_security_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'save_outreach';
