-- ============================================================
-- Multi-role outreaches — per-category role slots.
--
-- "2 doctors, 3 nurses, 5 students" instead of a single required_category.
--
-- PURELY ADDITIVE. No existing outreach gains a role row, so every outreach
-- that exists today stays in single-role mode and behaves identically. There
-- is deliberately NO BACKFILL: creating one role row per existing outreach
-- would silently convert them all to multi-role mode and hand their
-- slots_total to a trigger.
--
-- The two modes are distinguished by the presence of child rows and by nothing
-- else. There is no `outreaches.is_multi_role` flag — a boolean that must
-- agree with the existence of rows is a second source of truth, and will
-- eventually disagree with the first.
--
-- Plan and rationale: docs/MULTI_ROLE_PLAN.md.
-- ============================================================


-- ============================================================
-- 1. The table
-- ============================================================

create table if not exists outreach_roles (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid not null references outreaches(id) on delete cascade,

  -- Same vocabulary as volunteer_profiles.category.
  category text not null check (category in (
    'doctor', 'nurse', 'midwife', 'pharmacist', 'student', 'first_aider', 'other'
  )),

  -- Per-role, NOT per-outreach. This is what lets one event ask for 2 clinical
  -- doctors and 5 support-role students, and it is what the verification gate
  -- reads (section 5).
  role_type text not null check (role_type in ('clinical', 'support')),

  -- MINIMUM experience, not exact match. NULL means "any level".
  --
  -- The semantics matter: an exact match would mean a 4-slot "any level" nurse
  -- role could not accept an experienced nurse, which is absurd. "This level or
  -- above" lets an organisation post "1 experienced nurse to lead, 4 nurses of
  -- any level" and have both roles behave sensibly.
  min_experience_level text check (min_experience_level in (
    'beginner', 'intermediate', 'experienced'
  )),

  -- Optional per-role skills. NULL inherits the outreach's required_skills, so
  -- an organisation wanting one skill list for the whole event need not repeat
  -- it on every role.
  required_skills text[],

  slots_total int not null check (slots_total > 0),
  slots_filled int not null default 0 check (slots_filled >= 0),

  created_at timestamptz not null default now(),

  constraint outreach_roles_slots_filled_le_total check (slots_filled <= slots_total)
);

create index if not exists outreach_roles_outreach_id_idx on outreach_roles(outreach_id);

-- ------------------------------------------------------------
-- Uniqueness: one row per (outreach, category, experience level).
--
-- A plain `unique (outreach_id, category)` was the first design and was wrong:
-- it permanently ruled out "1 experienced nurse to lead, 4 nurses of any
-- level", which is a real staffing pattern.
--
-- But `unique (outreach_id, category, min_experience_level)` is ALSO wrong,
-- because min_experience_level is NULL for "any level" and NULL never equals
-- NULL in a unique constraint — an organisation could create two separate
-- "nurse, any level" rows and the constraint would permit both. A unique INDEX
-- over coalesce() closes that: 'any' is a real value that deduplicates.
-- ------------------------------------------------------------
create unique index if not exists outreach_roles_unique_category_level
  on outreach_roles (outreach_id, category, coalesce(min_experience_level, 'any'));


-- ============================================================
-- 2. Applications point at a role
-- ============================================================

-- NULL in single-role mode, and NULL for every application that already
-- exists — which is why it is nullable rather than defaulted. A default would
-- silently attach historical applications to a role nobody chose. It stays
-- nullable permanently; every read path must handle null.
alter table applications
  add column if not exists outreach_role_id uuid references outreach_roles(id) on delete set null;

create index if not exists applications_outreach_role_id_idx on applications(outreach_role_id);

-- `on delete set null`, not cascade: if an organisation removes a role, the
-- applications to it must survive as a record. Losing a volunteer's
-- application because the organisation reorganised its roster would be
-- indefensible.


-- ------------------------------------------------------------
-- A chosen role must belong to the outreach being applied to.
--
-- Without this, a volunteer could pass a SUPPORT role's id while applying to a
-- different outreach's clinical event and walk straight through the
-- verification gate. A check constraint cannot contain a subquery, so this is
-- a trigger.
-- ------------------------------------------------------------
create or replace function assert_role_belongs_to_outreach() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.outreach_role_id is not null
     and not exists (
       select 1 from outreach_roles r
        where r.id = new.outreach_role_id
          and r.outreach_id = new.outreach_id
     )
  then
    raise exception 'This role does not belong to that outreach.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_applications_role_belongs on applications;
create trigger trg_applications_role_belongs
  before insert or update of outreach_role_id, outreach_id on applications
  for each row execute function assert_role_belongs_to_outreach();


-- ============================================================
-- 3. Derived slot counts
--
-- slots_filled is DERIVED from accepted applications, never incremented, so
-- two admins accepting concurrently cannot double-count. Same reasoning as the
-- existing trg_applications_sync_slots_filled.
--
-- In multi-role mode the outreach's slots_total and slots_filled become the
-- SUM of its roles. This is the most consequential line in the migration: the
-- organisation no longer types a total, it types per-role counts. The columns
-- stay (the feed pre-filter and lib/roster.ts both read them) but are
-- maintained by trigger.
-- ============================================================

create or replace function sync_role_slots_filled() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_role uuid := coalesce(new.outreach_role_id, old.outreach_role_id);
  affected_outreach uuid := coalesce(new.outreach_id, old.outreach_id);
begin
  if affected_role is not null then
    update outreach_roles r
       set slots_filled = (
         select count(*) from applications a
          where a.outreach_role_id = r.id and a.status = 'accepted'
       )
     where r.id = affected_role;
  end if;

  -- Guarded on the existence of role rows, so this NEVER fires for a
  -- single-role outreach. That guard is what makes the migration safe for
  -- every outreach that already exists.
  if exists (select 1 from outreach_roles where outreach_id = affected_outreach) then
    update outreaches o
       set slots_filled = (select coalesce(sum(r.slots_filled), 0) from outreach_roles r where r.outreach_id = o.id),
           slots_total  = (select coalesce(sum(r.slots_total), 0)  from outreach_roles r where r.outreach_id = o.id)
     where o.id = affected_outreach;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_applications_sync_role_slots on applications;
create trigger trg_applications_sync_role_slots
  after insert or update of status, outreach_role_id or delete on applications
  for each row execute function sync_role_slots_filled();


-- Editing a role's slots_total must re-roll the outreach total too.
create or replace function sync_outreach_totals_from_roles() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_outreach uuid := coalesce(new.outreach_id, old.outreach_id);
begin
  update outreaches o
     set slots_total  = (select coalesce(sum(r.slots_total), 0)  from outreach_roles r where r.outreach_id = o.id),
         slots_filled = (select coalesce(sum(r.slots_filled), 0) from outreach_roles r where r.outreach_id = o.id)
   where o.id = affected_outreach
     and exists (select 1 from outreach_roles where outreach_id = affected_outreach);
  return null;
end;
$$;

drop trigger if exists trg_outreach_roles_sync_totals on outreach_roles;
create trigger trg_outreach_roles_sync_totals
  after insert or update or delete on outreach_roles
  for each row execute function sync_outreach_totals_from_roles();


-- ============================================================
-- 4. The outreach's role_type becomes a summary
--
-- 'clinical' if ANY role is clinical. This column is for DISPLAY and coarse
-- filtering only — the authoritative, per-application gate reads
-- outreach_roles.role_type (section 5). An unverified volunteer therefore
-- still SEES a mixed event, sees it badged clinical, and finds the support
-- roles open to them on the detail screen. Nothing becomes invisible.
-- ============================================================

create or replace function sync_outreach_role_type() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_outreach uuid := coalesce(new.outreach_id, old.outreach_id);
begin
  update outreaches o
     set role_type = case
           when exists (
             select 1 from outreach_roles r
              where r.outreach_id = o.id and r.role_type = 'clinical'
           ) then 'clinical' else 'support'
         end
   where o.id = affected_outreach
     and exists (select 1 from outreach_roles where outreach_id = affected_outreach);
  return null;
end;
$$;

drop trigger if exists trg_outreach_roles_sync_role_type on outreach_roles;
create trigger trg_outreach_roles_sync_role_type
  after insert or update of role_type or delete on outreach_roles
  for each row execute function sync_outreach_role_type();


-- ============================================================
-- 5. The verification gate, per role
--
-- Applying for a CLINICAL role needs verification. Applying for a SUPPORT role
-- on the same outreach does not.
--
-- This is the whole reason multi-role is worth building. Today a drive needing
-- 3 nurses and 6 general helpers must be posted either as clinical (locking
-- out every unverified helper) or as support (waving unverified people into
-- clinical work). Neither is acceptable.
--
-- Falls back to the outreach's own role_type when no role was chosen, which is
-- single-role mode and preserves today's behaviour exactly.
-- ============================================================

create or replace function application_role_is_clinical(
  p_outreach_id uuid,
  p_role_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select r.role_type = 'clinical' from outreach_roles r where r.id = p_role_id),
    (select o.role_type = 'clinical' from outreaches o where o.id = p_outreach_id),
    false
  );
$$;

grant execute on function application_role_is_clinical(uuid, uuid) to authenticated;


-- ============================================================
-- 6. RLS — roles inherit the visibility of their parent outreach exactly
-- ============================================================

alter table outreach_roles enable row level security;

drop policy if exists outreach_roles_select on outreach_roles;
create policy outreach_roles_select on outreach_roles
  for select to authenticated
  using (exists (
    select 1 from outreaches o
     where o.id = outreach_roles.outreach_id
       and (o.status <> 'draft' or o.organisation_id = auth.uid())
  ));

drop policy if exists outreach_roles_insert on outreach_roles;
create policy outreach_roles_insert on outreach_roles
  for insert to authenticated
  with check (exists (
    select 1 from outreaches o
     where o.id = outreach_roles.outreach_id and o.organisation_id = auth.uid()
  ));

drop policy if exists outreach_roles_update on outreach_roles;
create policy outreach_roles_update on outreach_roles
  for update to authenticated
  using (exists (
    select 1 from outreaches o
     where o.id = outreach_roles.outreach_id and o.organisation_id = auth.uid()
  ));

drop policy if exists outreach_roles_delete on outreach_roles;
create policy outreach_roles_delete on outreach_roles
  for delete to authenticated
  using (exists (
    select 1 from outreaches o
     where o.id = outreach_roles.outreach_id and o.organisation_id = auth.uid()
  ));


-- ============================================================
-- 7. Column-level GRANTs
--
-- slots_filled is server-derived and appears in NEITHER list. A write failure
-- on it is `permission denied for table outreach_roles` (42501) and must never
-- be fixed by adding it to a grant list — deriving it is the trigger's job.
-- ============================================================

revoke insert, update on outreach_roles from authenticated;

grant insert (outreach_id, category, role_type, min_experience_level, required_skills, slots_total)
  on outreach_roles to authenticated;

-- `id` is included because editing an outreach upserts its roles on the PK,
-- and PostgREST compiles ON CONFLICT DO UPDATE with every payload column, the
-- PK included. See CLAUDE.md.
grant update (id, category, role_type, min_experience_level, required_skills, slots_total)
  on outreach_roles to authenticated;

-- The volunteer chooses their role on INSERT, but must never be able to move
-- themselves into a different role's slot afterwards, so outreach_role_id is
-- granted on INSERT only.
grant insert (outreach_id, volunteer_id, type, motivation, outreach_role_id)
  on applications to authenticated;


-- ============================================================
-- 8. Verification — should report zero roles and every outreach single-role
-- ============================================================

select
  (select count(*) from outreach_roles) as role_rows,
  (select count(*) from applications where outreach_role_id is not null) as applications_with_role,
  (select count(*) from outreaches) as total_outreaches;
