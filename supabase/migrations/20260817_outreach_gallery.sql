-- ============================================================
-- Event gallery — several images per outreach, alongside the flyer.
--
-- RUN AS ONE PASTE. No transaction control of its own, so the editor's
-- transaction wraps it. Idempotent.
--
-- ADDITIVE, AND THE FLYER IS UNTOUCHED. `outreaches.flyer_url` keeps doing
-- exactly what it does: it is the single banner image that heads the card, the
-- detail hero and the wizard preview. This table is a different thing — the
-- event's poster, photos from the day, promotional images — and nothing here
-- reads, writes, replaces or falls back to `flyer_url`. An outreach can have a
-- flyer and no gallery, a gallery and no flyer, both, or neither.
-- ============================================================


-- ============================================================
-- 1. The table
-- ============================================================

create table if not exists outreach_images (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid not null references outreaches(id) on delete cascade,
  -- Cloudinary secure URL. Public delivery, the same as the flyer and the
  -- volunteer avatar: these are images the organisation wants seen. Credential
  -- documents are NOT this — they go to vhub/credentials as `raw` and must
  -- never be routed through the gallery path.
  url text not null,
  caption text,
  -- Display order. NOT unique, deliberately: a unique constraint turns every
  -- reorder into a dance with temporary values, because swapping two rows
  -- needs a third slot to pass through. Ties break on created_at, so the order
  -- is always total even when two rows share a position.
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists outreach_images_outreach_id_idx
  on outreach_images(outreach_id, position);


-- ------------------------------------------------------------
-- 2. Eight per event, enforced where it cannot be talked around.
--
-- The form stops at eight too, but the form is not the guarantee: RLS decides
-- which rows may be touched and column GRANTs decide which columns, and
-- NEITHER can count existing rows. A cap has to be a trigger.
--
-- Eight is a judgement, not a law of nature: enough for a poster and a handful
-- of photographs, and small enough that a volunteer on Ghanaian mobile data
-- scrolling a feed is not paying for a photo album.
-- ------------------------------------------------------------
create or replace function enforce_outreach_image_cap() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing int;
begin
  select count(*) into existing from outreach_images where outreach_id = new.outreach_id;

  if existing >= 8 then
    raise exception 'An outreach can have at most 8 gallery images. Remove one before adding another.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_outreach_images_cap on outreach_images;
create trigger trg_outreach_images_cap
  before insert on outreach_images
  for each row execute function enforce_outreach_image_cap();


-- ============================================================
-- 3. RLS — mirrors outreach_roles exactly.
--
-- Reading inherits the parent outreach's visibility, so a gallery is visible
-- precisely when the event it belongs to is. Writing is the owning
-- organisation and nobody else.
-- ============================================================

alter table outreach_images enable row level security;

drop policy if exists outreach_images_select on outreach_images;
create policy outreach_images_select on outreach_images
  for select to authenticated
  using (exists (
    select 1 from outreaches o
     where o.id = outreach_images.outreach_id
       and (o.status <> 'draft' or o.organisation_id = auth.uid())
  ));

drop policy if exists outreach_images_write on outreach_images;
create policy outreach_images_write on outreach_images
  for all to authenticated
  using (exists (
    select 1 from outreaches o
     where o.id = outreach_images.outreach_id and o.organisation_id = auth.uid()
  ))
  with check (exists (
    select 1 from outreaches o
     where o.id = outreach_images.outreach_id and o.organisation_id = auth.uid()
  ));


-- ------------------------------------------------------------
-- Column-level GRANTs. RLS says WHICH ROWS; only these say WHICH COLUMNS.
--
-- `id` and `created_at` are absent from both lists: nothing client-side needs
-- to write them, and the app never upserts this table on its primary key, so
-- the PostgREST ON CONFLICT rule that forced `id` into other UPDATE lists does
-- not apply here.
-- ------------------------------------------------------------
revoke insert, update on outreach_images from authenticated;

grant insert (outreach_id, url, caption, position)
  on outreach_images to authenticated;

-- `outreach_id` is NOT updatable: an image may be recaptioned and reordered,
-- never moved to a different event.
grant update (caption, position)
  on outreach_images to authenticated;


-- ============================================================
-- 4. The organisation's profile gallery opt-out
--
-- Default TRUE: an organisation that uploads images to its events has already
-- said it wants them seen, and making them opt in again would leave the
-- section permanently empty for everyone who never found the switch. Opting
-- out is a deliberate act, which is what a default-on boolean expresses.
-- ============================================================

alter table organisation_profiles
  add column if not exists show_gallery boolean not null default true;

-- Writable by the organisation itself, like the rest of its own profile.
-- CLAUDE.md: a new column the client must write has to join BOTH grant lists,
-- or the write fails with `permission denied for table` (42501).
grant update (show_gallery) on organisation_profiles to authenticated;
grant insert (show_gallery) on organisation_profiles to authenticated;


-- ------------------------------------------------------------
-- The public view has to carry the flag, or nothing can read it.
--
-- `public_organisation_profiles` is what every volunteer-facing screen reads;
-- `organisation_profiles` itself is not selectable by another user. Without
-- adding the column here the profile screen could never tell whether an
-- organisation had opted out, and would show the gallery to everyone.
--
-- Recreated rather than altered: Postgres will not add a column to an existing
-- view in place. The grants below are reissued because DROP VIEW takes them
-- with it.
-- ------------------------------------------------------------
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
    -- Safe to publish here, unlike profiles.phone/email: these are the org's
    -- own advertised enquiry details, not a person's private contact info.
    op.contact_email,
    op.contact_phone,
    op.show_gallery
  from profiles p
  join organisation_profiles op on op.id = p.id
  where p.role = 'organisation';

revoke all on public_organisation_profiles from anon;
grant select on public_organisation_profiles to authenticated;


-- ============================================================
-- 5. Verification
-- ============================================================
select
  (select count(*) from outreach_images)                                as gallery_images,
  (select count(*) from organisation_profiles where show_gallery)       as orgs_showing_gallery,
  (select count(*) from organisation_profiles)                          as orgs_total;

-- Expected: gallery_images 0 (nothing uploaded yet), and orgs_showing_gallery
-- equal to orgs_total, because the column defaults to true.

-- And the view must now expose it. Expect one row: show_gallery, boolean.
select column_name, data_type
  from information_schema.columns
 where table_name = 'public_organisation_profiles'
   and column_name = 'show_gallery';
