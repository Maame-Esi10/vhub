-- Closes the limitation left open by 20260731_allow_reapply_after_withdrawal.sql.
--
-- THE GAP. That migration widened applications_update_own_cancel so a
-- volunteer may set their own application to 'pending', which is what makes
-- "withdraw, then apply again" work. But an RLS policy's WITH CHECK only sees
-- the NEW row, and Postgres ORs multiple permissive policies rather than
-- pairing each USING with its own WITH CHECK -- so the policy cannot express
-- "pending is allowed only if the row was previously cancelled". A volunteer
-- could therefore also move their own REJECTED application back to pending
-- and re-enter an organisation's queue.
--
-- THE FIX. A BEFORE UPDATE trigger, which unlike a policy sees both OLD and
-- NEW, and so can compare them. RLS still decides who may touch the row and
-- which values they may write; this only constrains the transition between
-- two states RLS has already allowed. Defence in depth, not a replacement.
--
-- Only the volunteer's own path is constrained. An organisation legitimately
-- moves an application rejected -> pending (reconsidering someone) or
-- rejected -> accepted, so the check applies only when the caller is the
-- volunteer on the row and is NOT the owning organisation.
--
-- Idempotent: safe to re-run. Already folded into supabase/schema.sql.

create or replace function public.enforce_volunteer_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Not the volunteer acting on their own row -> nothing to constrain here.
  if new.volunteer_id is distinct from auth.uid() then
    return new;
  end if;

  -- The owning organisation may also be acting; orgs keep full transitions.
  if exists (
    select 1 from public.outreaches o
    where o.id = new.outreach_id
      and o.organisation_id = auth.uid()
  ) then
    return new;
  end if;

  -- A volunteer may only reach 'pending' from a withdrawal of their own.
  -- Coming from 'rejected' (or 'accepted', or 'waitlisted') is refused: those
  -- are the organisation's decisions to revisit, not the applicant's.
  if new.status = 'pending' and old.status is distinct from 'cancelled' then
    raise exception
      'A volunteer may only return an application to pending after withdrawing it (was: %).',
      old.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_volunteer_status_transition() from public;

drop trigger if exists trg_applications_volunteer_status_transition on applications;
create trigger trg_applications_volunteer_status_transition
  before update of status on applications
  for each row
  when (old.status is distinct from new.status)
  execute function public.enforce_volunteer_status_transition();
