-- ============================================================
-- The verification gate finally reads the ROLE, in the database too.
--
-- RUN AS ONE PASTE. Idempotent.
--
-- THE BUG. `application_role_is_clinical()` was created by the multi-role
-- migration, documented as "the verification gate, per role", granted to
-- authenticated — and then called by NOTHING. Both application policies still
-- gated on the outreach's summarised column:
--
--     o.role_type is distinct from 'clinical'
--
-- and `outreaches.role_type` is 'clinical' if ANY role on the event is. So an
-- unverified volunteer who chose the SUPPORT role of a mixed event was refused
-- by RLS, with the app's own gate having correctly let them through — the two
-- halves implemented different rules and only the database's counted.
--
-- That is the exact failure multi-role exists to remove: a drive needing 3
-- nurses and 6 helpers could not accept unverified helpers. The screens have
-- been right since the feature shipped; the policies were never rewired.
--
-- WHAT CHANGES: the eligibility test now asks about the role actually applied
-- for, falling back to the outreach's own role_type when no role was chosen,
-- which is single-role mode and preserves today's behaviour exactly.
--
-- WHAT DOES NOT CHANGE: `o.status = 'open'` still gates every application, so
-- closed, completed, draft and cancelled outreaches remain unappliable. The
-- chosen role must still belong to the outreach — `assert_role_belongs_to_outreach`
-- enforces that, so a support role's id from a different event cannot be passed
-- in to slip past a clinical gate.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Applying.
-- ------------------------------------------------------------
drop policy if exists "applications_insert_own" on applications;
create policy "applications_insert_own"
  on applications for insert
  to authenticated
  with check (
    volunteer_id = auth.uid()
    -- The event must still be recruiting. Unchanged, and deliberately its own
    -- clause so the two conditions can never be confused for one another.
    and exists (
      select 1 from outreaches o
       where o.id = applications.outreach_id
         and o.status = 'open'
    )
    -- Verification, judged on the ROLE.
    and (
      not application_role_is_clinical(
        applications.outreach_id,
        applications.outreach_role_id
      )
      or exists (
        select 1 from volunteer_profiles vp
         where vp.id = auth.uid()
           and vp.verification_status = 'verified'
      )
    )
  );


-- ------------------------------------------------------------
-- 2. Re-applying after a withdrawal.
--
-- The same test, for the same reason: `applications` is UNIQUE on
-- (outreach_id, volunteer_id), so re-applying reactivates the existing row
-- through an UPDATE rather than inserting a second one. If this policy kept the
-- old outreach-level test, withdrawing and re-applying would still be refused
-- on a support role — and worse, the two paths would disagree about who may
-- apply to the same event.
-- ------------------------------------------------------------
drop policy if exists "applications_update_own_cancel" on applications;
create policy "applications_update_own_cancel"
  on applications for update
  to authenticated
  using (volunteer_id = auth.uid())
  with check (
    volunteer_id = auth.uid()
    and (
      status = 'cancelled'
      or (
        status = 'pending'
        and exists (
          select 1 from outreaches o
           where o.id = applications.outreach_id
             and o.status = 'open'
        )
        and (
          not application_role_is_clinical(
            applications.outreach_id,
            applications.outreach_role_id
          )
          or exists (
            select 1 from volunteer_profiles vp
             where vp.id = auth.uid()
               and vp.verification_status = 'verified'
          )
        )
      )
    )
  );


-- ============================================================
-- 3. Proof that the function is now actually wired in.
--
-- It was granted and unused before, which is how this went unnoticed: nothing
-- fails when a helper is merely never called.
-- ============================================================
do $$
declare
  wired int;
begin
  select count(*) into wired
    from pg_policy pol
    join pg_class rel on rel.oid = pol.polrelid
   where rel.relname = 'applications'
     and pol.polname in ('applications_insert_own', 'applications_update_own_cancel')
     and pg_get_expr(pol.polwithcheck, pol.polrelid) like '%application_role_is_clinical%';

  if wired <> 2 then
    raise exception
      'Expected both application policies to call application_role_is_clinical(), found %.', wired;
  end if;
end $$;

select polname,
       pg_get_expr(polwithcheck, polrelid) like '%application_role_is_clinical%' as gates_on_role
  from pg_policy pol
  join pg_class rel on rel.oid = pol.polrelid
 where rel.relname = 'applications'
   and polname in ('applications_insert_own', 'applications_update_own_cancel');
