-- Adds the two Cloudinary media columns.
--
-- profiles.avatar_url already exists and is already client-writable, so
-- profile photos need no schema change -- only the upload itself.
--
-- THE TWO COLUMNS ARE GRANTED DIFFERENTLY, on purpose:
--
--   outreaches.flyer_url IS client-writable (added to both the INSERT and
--   UPDATE grant lists). An organisation sets it while creating its own
--   outreach, and a bogus value harms only that organisation's own listing.
--   Routing it through the API would add a round trip to the create flow for
--   no security gain.
--
--   volunteer_profiles.credential_document_url is NOT granted to anyone. It is
--   written solely by /api/verification-document on the service-role key,
--   because that endpoint also advances verification_status from 'unverified'
--   to 'documents_pending' -- and verification_status is the column the
--   clinical-role eligibility gate reads. Tying the two writes together in one
--   server-side transaction is what makes "in review" mean "a document was
--   actually uploaded", rather than a state any client could assert. If the
--   URL were client-writable the endpoint would be pointless: a volunteer
--   could set the column to anything and the status would be moved on the
--   strength of a string.
--
-- Both columns are nullable with no default: existing rows predate uploads,
-- and a volunteer who never uploads a credential keeps NULL forever.
--
-- Idempotent: safe to re-run. Already folded into supabase/schema.sql.

alter table outreaches
  add column if not exists flyer_url text;

alter table volunteer_profiles
  add column if not exists credential_document_url text;

-- Re-grant, adding flyer_url. Restated in full rather than as an incremental
-- grant so this file stays the whole truth for these two tables' write
-- surface -- a reader does not have to diff it against schema.sql to know
-- what a client may set.
revoke insert on outreaches from authenticated;
grant insert (
  organisation_id,
  title,
  description,
  date,
  start_time,
  end_time,
  region,
  district,
  location_name,
  required_skills,
  required_category,
  role_type,
  slots_total,
  status,
  flyer_url
) on outreaches to authenticated;

revoke update on outreaches from authenticated;
grant update (
  title,
  description,
  date,
  start_time,
  end_time,
  region,
  district,
  location_name,
  required_skills,
  required_category,
  role_type,
  slots_total,
  status,
  flyer_url
) on outreaches to authenticated;

-- volunteer_profiles' grant lists are deliberately UNCHANGED:
-- credential_document_url is absent from both, alongside v_score,
-- verification_status and events_attended.
