-- ============================================================
-- Admin phase, package B — credential documents become private.
--
-- ONE PASTE. No enum value is added, so the two-paste rule does not apply.
--
-- WHAT WAS WRONG. The upload was signed but never marked private: Cloudinary
-- stored credentials as ordinary public-delivery assets, and
-- `volunteer_profiles.credential_document_url` held the PERMANENT delivery URL
-- of one. Anyone holding that string could fetch the document — no session, no
-- authorisation check, nothing to revoke. The verification screen opened it
-- with the phone's browser, which is exactly what a permanent public URL is
-- for.
--
-- NOTHING WAS EXPOSED. No real credential has ever been uploaded to this app;
-- everything in `vhub/credentials/` is a test PDF. This is a gap closed before
-- real documents arrive, not a breach — which is why it ships now, ahead of the
-- two admin packages that cause documents to be uploaded and reviewed at
-- volume.
--
-- WHAT REPLACES IT. Uploads are stored as Cloudinary `authenticated` assets,
-- which cannot be fetched without a signature. The database stores the
-- PUBLIC_ID — a name, not an address — and `/api/document-url` mints a
-- short-lived signed URL per request, for a requester it has just authorised.
--
-- RUN THIS AFTER THE PUSH HAS DEPLOYED. The API and the app both stop reading
-- `credential_document_url` in the same commit as this file. Running the
-- migration first leaves the deployed API selecting a column that no longer
-- exists; running it after leaves the new code reading a column that is not
-- there yet, which reads as "no document" and recovers on its own. The second
-- failure is the harmless one. (The lesson is the 2026-08-15 one: ship a
-- schema change and its writer together.)
-- ============================================================


-- ============================================================
-- 1. The new column
--
-- A Cloudinary public_id, e.g. `vhub/credentials/<uid>/licence_a1b2c3.pdf`.
-- For `raw` assets the extension is part of the id, which is what lets the app
-- still tell a photographed certificate from a PDF without storing a MIME type.
--
-- Not granted to anybody, exactly like the column it replaces: written only by
-- /api/verification-document on the service-role key. A client that could write
-- it could point its own record at somebody else's document.
-- ============================================================

alter table volunteer_profiles
  add column if not exists credential_document_id text;

comment on column volunteer_profiles.credential_document_id is
  'Cloudinary public_id of the credential document (authenticated delivery type). NEVER a URL: a stored URL is the thing that leaks. Read it through /api/document-url, which signs a short-lived link for an authorised requester.';


-- ============================================================
-- 2. The existing documents
--
-- Owner's decision, 2026-08-21: DELETE them. They are test PDFs, so there is
-- nothing to preserve and nobody to notify. This clears the database side; the
-- Cloudinary files themselves are removed from the console, and deliberately
-- only AFTER the private upload path is live, so a re-upload during testing
-- lands as a private asset instead of recreating the problem.
--
-- verification_status goes back to `unverified` alongside, because
-- `documents_pending` means "a reviewer has something to read" and after this
-- there is nothing. Leaving the status would put a volunteer in a queue for a
-- review that can never happen.
-- ============================================================

-- RE-RUNNABLE, and it has to be built this way rather than guarded with a
-- plain `if`. Section 3 below DROPS credential_document_url, so on a second
-- run of this file the column is already gone -- and a statement naming a
-- column that does not exist fails when the statement is PARSED, before any
-- guard around it could run. (That is exactly what happened on 2026-08-27:
-- `ERROR: 42703: column "credential_document_url" does not exist`.) Dynamic
-- SQL inside `execute` is parsed only when it is executed, so wrapping the
-- guard around `execute` is what actually makes the check reachable.
--
-- The whole paste runs inside the editor's single transaction, so the failed
-- run rolled back and changed nothing. This block means there is nothing to
-- roll back next time.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'volunteer_profiles'
       and column_name = 'credential_document_url'
  ) then
    execute $sql$
      update volunteer_profiles
         set credential_document_url = null,
             verification_status = 'unverified'
       where credential_document_url is not null
         and verification_status <> 'verified'
    $sql$;

    -- A verified volunteer is a decision a human already made; their status
    -- stays, and only the dead URL is cleared.
    execute $sql$
      update volunteer_profiles
         set credential_document_url = null
       where credential_document_url is not null
    $sql$;
  else
    raise notice 'credential_document_url is already gone; nothing to clear.';
  end if;
end $$;


-- ============================================================
-- 3. The old column goes
--
-- Kept-but-unused was the alternative, and it is the weaker one. The column is
-- the leak: as long as it exists, some future code path can write a permanent
-- URL into it and nothing in the schema would object. Dropping it makes that
-- impossible rather than merely unlikely.
--
-- Safe to drop: it appears in no view, no policy, no grant list and no index.
-- The app reads it in one screen and the API in one route, and both change in
-- the same commit as this file.
-- ============================================================

alter table volunteer_profiles
  drop column if exists credential_document_url;


-- ============================================================
-- 4. Verification — run this after, and read the numbers
--
-- Expected:
-- EVERY FIGURE IS A COUNT, and every one of them should read 0 except the
-- first. `url_columns_remaining` was called `url_column_gone` until
-- 2026-08-27, which was a genuinely bad name: it counts the columns still
-- there, so 0 means the drop WORKED -- but the name reads like a flag, and
-- "gone = 0" reads like "not gone". Renamed so the number cannot be misread.
--
--   id_column_present     1   credential_document_id exists
--   url_columns_remaining 0   credential_document_url is gone
--   client_can_write_id   0   not in any grant list
--   stale_pending         0   nobody is queued for a review with no document
-- ============================================================

select
  (select count(*) from information_schema.columns
    where table_name = 'volunteer_profiles' and column_name = 'credential_document_id') as id_column_present,
  (select count(*) from information_schema.columns
    where table_name = 'volunteer_profiles' and column_name = 'credential_document_url') as url_columns_remaining,
  (select count(*) from information_schema.column_privileges
    where table_name = 'volunteer_profiles' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE') and column_name = 'credential_document_id') as client_can_write_id,
  (select count(*) from volunteer_profiles
    where verification_status = 'documents_pending' and credential_document_id is null) as stale_pending;
