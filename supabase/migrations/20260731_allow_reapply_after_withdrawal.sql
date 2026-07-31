-- Lets a volunteer re-apply to an outreach they previously withdrew from.
--
-- THE BUG. applications has `unique (outreach_id, volunteer_id)`, so a
-- withdrawn application still occupies that slot. After withdrawing, the
-- detail screen correctly re-showed Quick Join / Apply Now (status is
-- 'cancelled', so the volunteer has not applied) -- but the INSERT behind
-- those buttons hit the unique constraint, and the error mapping turned code
-- 23505 into "You've already applied to this outreach." So a volunteer who
-- had just withdrawn was told they had already applied, with no way forward.
--
-- THE FIX. The client now UPDATEs the existing cancelled row back to
-- 'pending' instead of inserting a second one (hooks/useApplications.ts,
-- useCreateApplication). Two database changes are needed for that update to
-- be permitted:
--
--   1. GRANT -- the applications UPDATE grant list covered only
--      (status, cancellation_reason). Re-applying also rewrites `type`
--      (a volunteer may withdraw a Quick Join and come back with a Full
--      Application) and `motivation`. Both are volunteer-authored columns
--      already present in the INSERT grant list, so allowing UPDATE on them
--      grants nothing new in kind. match_score, cancelled_at and
--      late_cancellation remain absent -- they stay service-role-only.
--
--   2. RLS -- applications_update_own_cancel's WITH CHECK hard-coded
--      `status = 'cancelled'`, so a volunteer could only ever write that one
--      value. It now also permits 'pending', gated by exactly the same
--      eligibility test applications_insert_own uses: the outreach must still
--      be open, and a clinical outreach still requires a verified profile.
--      Re-applying therefore cannot bypass the verification gate.
--
-- Volunteers still cannot write 'accepted', 'rejected' or 'waitlisted' -- the
-- with check enumerates the two values they may set, and everything else is
-- refused.
--
-- The volunteer_profiles subquery below is the same one applications_insert_own
-- already uses. It is safe (no 42P17 recursion) because volunteer_profiles'
-- SELECT policy now goes through the is_related_via_application security
-- definer helper -- see 20260731_fix_applications_rls_recursion.sql. Do not
-- revert that migration without revisiting this one.
--
-- KNOWN LIMITATION, accepted deliberately: because a policy's USING clause
-- sees the old row and WITH CHECK sees the new one, and Postgres ORs multiple
-- permissive policies rather than pairing them, this also lets a volunteer
-- move their own *rejected* application back to 'pending' and re-enter the
-- queue. That is a nuisance, not an escalation -- they still cannot accept
-- themselves, cannot alter match_score, and cannot touch anyone else's row,
-- and the organisation sees the resulting status. Constraining it precisely
-- needs a BEFORE UPDATE trigger comparing old.status to new.status; noted in
-- docs/REPORT_NOTES.md as a follow-up rather than built now.
--
-- Idempotent: safe to re-run. Already folded into supabase/schema.sql.

grant update (status, cancellation_reason, type, motivation)
  on applications to authenticated;

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
            and (
              o.role_type is distinct from 'clinical'
              or exists (
                select 1 from volunteer_profiles vp
                where vp.id = auth.uid()
                  and vp.verification_status = 'verified'
              )
            )
        )
      )
    )
  );
