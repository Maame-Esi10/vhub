-- ============================================================
-- Admin phase, package D — volunteer credential review (Gate 1).
--
-- ONE PASTE. No enum value is added; see below for why not, because that is a
-- decision rather than an omission.
--
-- WHAT THIS CLOSES. A volunteer can reach `documents_pending` today and stop
-- there forever: nothing in the app can advance them, and approval has been a
-- manual UPDATE typed into this editor. The queue in package D is what makes
-- 'documents_pending' mean "somebody will look at this".
--
-- GATE 1 IS A BASIC CHECK, PLATFORM-WIDE: is the document real, legible,
-- unexpired, and does it plausibly match the claimed category? It is explicitly
-- NOT a judgement about clinical competence. That is Gate 2 — the
-- organisation's own call, per application, which changes no platform status.
-- ============================================================


-- ============================================================
-- 1. Three columns, and NO new status value
--
-- The obvious design is a fourth `verification_status` of 'rejected'. It is not
-- worth it, for two reasons that both point the same way:
--
--   * It would need its own separate migration paste (a new enum value cannot
--     be used in the transaction that adds it), plus a branch in every screen
--     that reads the status.
--   * It would not be more truthful. A volunteer whose document was declined IS
--     unverified — that is exactly the state they are in, and exactly what they
--     could do something about. `rejected` would be a status that means
--     "unverified, and also we are cross about it".
--
-- What they actually need is the REASON, which is what these columns carry.
-- The screen shows "Not verified" with the reason beside it, and the volunteer
-- can replace the document.
--
-- Server-only, all three: they are absent from every grant list, so the client
-- cannot write them. A volunteer able to clear their own rejection reason could
-- hide a decision from the next reviewer.
-- ============================================================

alter table volunteer_profiles
  add column if not exists verification_reason text,
  add column if not exists verification_decided_at timestamptz,
  add column if not exists verification_submitted_at timestamptz;

comment on column volunteer_profiles.verification_reason is
  'Why the LAST credential decision went the way it did, shown to the volunteer so they can fix and resubmit. The full history of every decision lives in admin_actions and is never overwritten.';


-- ============================================================
-- 2. Backfill, so the queue is not lying on day one
--
-- Anyone already sitting in `documents_pending` uploaded at some point, and
-- their row's updated_at is the closest honest record of when. Without this
-- they would all sort as "submission date not recorded" and an oldest-first
-- queue would have nothing to order by.
-- ============================================================

update volunteer_profiles
   set verification_submitted_at = updated_at
 where verification_status = 'documents_pending'
   and verification_submitted_at is null;


-- ============================================================
-- 3. The queue has to be readable by an admin
--
-- `volunteer_profiles_select_authenticated` is scoped to "my own row, or
-- someone I share an application with". An admin shares no application with
-- anybody, so without this clause the credential queue would be empty for the
-- only person who is supposed to see it — and the endpoint's own reads would
-- still work, which is exactly the kind of half-working that wastes a session.
--
-- The same clause is added to `profiles`, because a queue that cannot show a
-- volunteer's NAME beside their document is not usable.
-- ============================================================

drop policy if exists "volunteer_profiles_select_authenticated" on volunteer_profiles;
create policy "volunteer_profiles_select_authenticated"
  on volunteer_profiles for select
  to authenticated
  using (
    auth.uid() = id
    or public.is_related_via_application(volunteer_profiles.id)
    or is_admin()
  );

drop policy if exists "profiles_select_authenticated" on profiles;
create policy "profiles_select_authenticated"
  on profiles for select
  to authenticated
  using (
    auth.uid() = id
    or public.is_related_via_application(profiles.id)
    or is_admin()
  );


-- ============================================================
-- 4. Verification — run this after, and read the numbers
--
-- Expected:
--   reason_column        1
--   submitted_column     1
--   client_can_write     0   (none of the three is client-writable)
--   admin_reads_vols     1   (the queue can see volunteer rows)
--   admin_reads_profiles 1   (and their names)
--   awaiting_review          however many volunteers are queued right now
-- ============================================================

select
  (select count(*) from information_schema.columns
    where table_name = 'volunteer_profiles' and column_name = 'verification_reason') as reason_column,
  (select count(*) from information_schema.columns
    where table_name = 'volunteer_profiles' and column_name = 'verification_submitted_at') as submitted_column,
  (select count(*) from information_schema.column_privileges
    where table_name = 'volunteer_profiles' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE')
      and column_name in ('verification_reason', 'verification_decided_at', 'verification_submitted_at')) as client_can_write,
  (select count(*) from pg_policies
    where tablename = 'volunteer_profiles' and policyname = 'volunteer_profiles_select_authenticated'
      and qual like '%is_admin%') as admin_reads_vols,
  (select count(*) from pg_policies
    where tablename = 'profiles' and policyname = 'profiles_select_authenticated'
      and qual like '%is_admin%') as admin_reads_profiles,
  (select count(*) from volunteer_profiles where verification_status = 'documents_pending') as awaiting_review;
