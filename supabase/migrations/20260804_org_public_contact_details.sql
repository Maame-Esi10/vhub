-- Public contact details for organisations.
--
-- WHY NOT profiles.phone / profiles.email:
-- those two columns are personal PII. profiles_select_authenticated is
-- row-scoped precisely so an unrelated user cannot read them (schema.sql
-- "phone/email are PII and must not be readable by unrelated authenticated
-- users"), and the public discovery views carry a standing instruction that
-- "phone and email must never be added to either select list". A volunteer
-- must be able to see how to contact an organisation BEFORE applying, so
-- routing that through profiles would mean loosening exactly the policy that
-- comment forbids loosening.
--
-- organisation_profiles is the correct home: its select policy is already
-- `using (true)` on the stated grounds that it "holds no PII" and volunteers
-- need to browse org info before applying. These columns do not change that --
-- an organisation's public contact address is information it is deliberately
-- publishing, not a personal address inherited from its login. The org's
-- login email stays on auth.users and is never exposed here.

alter table organisation_profiles add column if not exists contact_email text;
alter table organisation_profiles add column if not exists contact_phone text;

comment on column organisation_profiles.contact_email is
  'Public enquiries address volunteers can write to. NOT the login email (that lives on auth.users) and not personal PII.';
comment on column organisation_profiles.contact_phone is
  'Public enquiries phone, Ghana format (+233...). Distinct from profiles.phone, which is the private contact for the individual account holder.';

-- Column-level grants are additive, so these extend the existing lists at the
-- bottom of schema.sql rather than replacing them. Both are plain
-- organisation-authored fields: no server-side meaning, safe for the owner to
-- write. `verified` remains absent from both lists and must stay that way.
grant insert (contact_email, contact_phone) on organisation_profiles to authenticated;
grant update (contact_email, contact_phone) on organisation_profiles to authenticated;

-- Republish the discovery view with the two new columns. drop + create rather
-- than create or replace, for the reason given in schema.sql: replace cannot
-- change a view's column list.
drop view if exists public_organisation_profiles;
create view public_organisation_profiles
with (security_invoker = false) as
  select
    p.id,
    p.avatar_url,
    p.region,
    p.district,
    p.created_at,
    op.org_name,
    op.org_type,
    op.description,
    op.website,
    op.verified,
    op.contact_email,
    op.contact_phone
  from profiles p
  join organisation_profiles op on op.id = p.id
  where p.role = 'organisation';

revoke all on public_organisation_profiles from anon;
grant select on public_organisation_profiles to authenticated;
