-- ============================================================
-- Admin phase, package E — consent, recorded rather than assumed.
--
-- ONE PASTE. No enum values, no policy changes.
--
-- WHAT THIS IS FOR. Somebody handing over a photograph of their nursing
-- licence is entitled to be told, at that moment and in plain language, what
-- happens to it: what is uploaded, why, who can see it, and that it is used for
-- verification and nothing else. The brief asks for this SEPARATELY from
-- general terms, and it is right to — consent buried in a terms document
-- nobody read is not consent.
--
-- WHY A COLUMN AND NOT A CHECKBOX. A checkbox in a form proves nothing after
-- the form closes. This records WHEN the person agreed, which is the only part
-- that is evidence. It is also what lets the API REFUSE a document from
-- somebody who has not agreed, which is what makes the consent real rather
-- than decorative.
-- ============================================================


-- ============================================================
-- 1. One column on each side
--
-- Both are server-only — absent from every grant list — and stamped by the
-- endpoint that records the document. A client able to write its own consent
-- timestamp could produce a record of agreeing to something it was never
-- shown, which is worse than having no record at all.
--
-- NULL means "has not agreed". Nobody is backfilled, deliberately: everyone
-- currently holding a document uploaded it before this text existed, so a
-- backfill would be us writing down that they agreed to something they were
-- never shown. They are asked once, the next time they upload.
-- ============================================================

alter table volunteer_profiles
  add column if not exists document_consent_at timestamptz;

alter table organisation_profiles
  add column if not exists document_consent_at timestamptz;

comment on column volunteer_profiles.document_consent_at is
  'When this volunteer agreed to the credential-upload consent text. NULL means they have not, and /api/verification-document refuses a document in that case. Server-only: a client able to write it could record an agreement to something never shown.';

comment on column organisation_profiles.document_consent_at is
  'The same, for an organisation submitting verification documents.';


-- ============================================================
-- 2. Verification — run this after
--
-- Expected:
--   volunteer_column   1
--   org_column         1
--   client_can_write   0
--   consented          0   (nobody has been asked yet, which is correct)
-- ============================================================

select
  (select count(*) from information_schema.columns
    where table_name = 'volunteer_profiles' and column_name = 'document_consent_at') as volunteer_column,
  (select count(*) from information_schema.columns
    where table_name = 'organisation_profiles' and column_name = 'document_consent_at') as org_column,
  (select count(*) from information_schema.column_privileges
    where grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE')
      and column_name = 'document_consent_at') as client_can_write,
  (select count(*) from volunteer_profiles where document_consent_at is not null) as consented;
