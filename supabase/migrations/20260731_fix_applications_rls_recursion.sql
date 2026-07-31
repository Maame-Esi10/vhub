-- Fixes: infinite recursion detected in policy for relation "applications"
-- (SQLSTATE 42P17), which broke Quick Join and Full Application submission on
-- the volunteer Outreach Detail screen, and the organisation Applicants list.
--
-- ROOT CAUSE -- a two-table policy cycle:
--
--   applications_insert_own (WITH CHECK) subqueries volunteer_profiles, to
--   enforce the clinical-role verification gate:
--       ... or exists (select 1 from volunteer_profiles vp
--                      where vp.id = auth.uid()
--                        and vp.verification_status = 'verified')
--
--   volunteer_profiles_select_authenticated (USING) subqueries applications
--   joined to outreaches, to let an org read an applicant's profile:
--       ... or exists (select 1 from applications a
--                      join outreaches o on o.id = a.outreach_id
--                      where a.volunteer_id = volunteer_profiles.id
--                        and o.organisation_id = auth.uid())
--
-- Inserting an application therefore forces Postgres to expand
-- volunteer_profiles' policy, which forces it to expand applications' policy
-- again, while applications is already mid-expansion. Postgres detects the
-- cycle and aborts rather than looping. profiles_select_authenticated carries
-- the identical applications-subquery and closes the same loop by the second
-- path -- the org Applicants screen embeds
-- applications -> volunteer_profiles -> profiles in one PostgREST select.
--
-- FIX -- move the lookup into a security definer function. Postgres never
-- inlines a security definer function body into the calling query, so the
-- rewriter no longer re-expands applications'/outreaches' policies while
-- expanding profiles'/volunteer_profiles'. The cycle is structurally severed
-- rather than merely reshuffled. This is the standard Postgres/Supabase
-- remedy for this bug class.
--
-- SECURITY -- this does NOT widen access. The function computes exactly the
-- boolean the two inline EXISTS branches computed:
--   exists(... where P) or exists(... where Q)  ==  exists(... where P or Q)
-- over the same join. The RLS bypass inside the function is safe because each
-- branch's own predicate already implies what the skipped policy would have
-- enforced (o.organisation_id = auth.uid() already satisfies
-- outreaches_select_open_or_own's own-org clause; a volunteer cannot hold an
-- applications row against a draft outreach). An organisation still cannot
-- read a volunteer it shares no application with, and vice versa.
--
-- DO NOT revert either policy to an inline `exists (select 1 from
-- applications ...)` subquery -- that is precisely what reintroduces 42P17.
--
-- Idempotent: safe to re-run. Already folded into supabase/schema.sql; this
-- file exists to bring an EXISTING live project up to date, matching the
-- convention of 20260729_lock_role_and_org_verified.sql.

-- Table names are schema-qualified (public.applications, not applications)
-- rather than relying on `set search_path` alone: Postgres resolves relation
-- names against pg_temp first regardless of an explicitly set search_path, so
-- qualifying is the durable hardening for a security definer body.
create or replace function public.is_related_via_application(target_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.applications a
    join public.outreaches o on o.id = a.outreach_id
    where (a.volunteer_id = target_id and o.organisation_id = auth.uid())
       or (o.organisation_id = target_id and a.volunteer_id = auth.uid())
  );
$$;

-- Reviewed and accepted: granting execute to `authenticated` also exposes this
-- as PostgREST rpc/is_related_via_application, callable with an arbitrary
-- target_id. It is not a new disclosure -- the same boolean is already
-- derivable by selecting the target row and seeing whether it comes back --
-- and it returns only a boolean, never row data. Noted here so a future audit
-- does not mistake the grant for an oversight.
revoke all on function public.is_related_via_application(uuid) from public;
grant execute on function public.is_related_via_application(uuid) to authenticated;

drop policy if exists "volunteer_profiles_select_authenticated" on volunteer_profiles;
create policy "volunteer_profiles_select_authenticated"
  on volunteer_profiles for select
  to authenticated
  using (
    auth.uid() = id
    or public.is_related_via_application(volunteer_profiles.id)
  );

drop policy if exists "profiles_select_authenticated" on profiles;
create policy "profiles_select_authenticated"
  on profiles for select
  to authenticated
  using (
    auth.uid() = id
    or public.is_related_via_application(profiles.id)
  );
