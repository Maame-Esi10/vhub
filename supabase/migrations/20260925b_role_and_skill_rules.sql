-- ============================================================================
-- 2026-09-25. Owner-approved. Paste AFTER 20260925a has run.
--
-- Three things, each a database backstop for a rule the app already enforces
-- (commit 06f9529). Without them a crafted call straight to the database,
-- bypassing the app, could still get round the rules.
--
-- 1. A ROLE CHANGE WITHDRAWS VERIFICATION.
--    Verification means an admin read ONE document against ONE claimed role.
--    `volunteer_profiles.category` must stay client-writable (the onboarding
--    wizard writes it), so the rule lives in a trigger: whenever an
--    already-set category changes, verification_status drops to 'unverified'
--    and the document reference is cleared, whoever made the write.
--    /api/volunteer-category does the same and also deletes the old file from
--    storage, which SQL cannot do; the trigger makes the two agree.
--    The first category (NULL to a value, at onboarding) is untouched.
--
-- 2. AT MOST 15 SKILLS AND 3 SPECIALTIES. A TRIGGER, NOT A CHECK CONSTRAINT.
--    The approved proposal said "CHECK constraint, NOT VALID". That would
--    have been a mistake, caught before writing: Postgres re-checks a CHECK
--    on EVERY update of the row, whichever columns change. A volunteer who
--    already held 20 skills would then make the V-Score replay, a
--    verification decision or an events_attended update fail on their row.
--    The trigger fires only when skill_tags or specialties is written, and
--    refuses only a list that is over the limit AND longer than before. So
--    people who already hold too many are not locked out: they can trim step
--    by step, and a save that leaves the list unchanged still goes through.
--    (The app itself asks them to get under the limit when they save.)
--    No backfill: nobody's existing list is changed.
--
-- 3. outreach_roles.category ACCEPTS 'allied_health'.
--    That column is text with a CHECK listing the categories, so without
--    this an organisation could not ask for an allied health role.
--
-- Idempotent. No begin/commit. The self-checks at the end raise if anything
-- did not land.
-- ============================================================================

-- 1 --------------------------------------------------------------------------
create or replace function reset_verification_on_category_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.category is not null and new.category is distinct from old.category then
    new.verification_status := 'unverified';
    new.credential_document_id := null;
    new.verification_submitted_at := null;
    new.verification_decided_at := null;
    new.verification_reason := null;
  end if;
  return new;
end;
$$;

revoke execute on function reset_verification_on_category_change() from public, anon, authenticated;

drop trigger if exists trg_volunteer_profiles_category_reverify on volunteer_profiles;
create trigger trg_volunteer_profiles_category_reverify
  before update of category on volunteer_profiles
  for each row execute function reset_verification_on_category_change();

-- 2 --------------------------------------------------------------------------
create or replace function enforce_volunteer_list_limits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  new_skills int := coalesce(cardinality(new.skill_tags), 0);
  new_specialties int := coalesce(cardinality(new.specialties), 0);
  old_skills int := case when tg_op = 'UPDATE' then coalesce(cardinality(old.skill_tags), 0) else 0 end;
  old_specialties int := case when tg_op = 'UPDATE' then coalesce(cardinality(old.specialties), 0) else 0 end;
begin
  if new_skills > 15 and new_skills > old_skills then
    raise exception 'A volunteer can list at most 15 skills.' using errcode = 'check_violation';
  end if;
  if new_specialties > 3 and new_specialties > old_specialties then
    raise exception 'A volunteer can list at most 3 specialties.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function enforce_volunteer_list_limits() from public, anon, authenticated;

drop trigger if exists trg_volunteer_profiles_list_limits on volunteer_profiles;
create trigger trg_volunteer_profiles_list_limits
  before insert or update of skill_tags, specialties on volunteer_profiles
  for each row execute function enforce_volunteer_list_limits();

-- 3 --------------------------------------------------------------------------
alter table outreach_roles drop constraint if exists outreach_roles_category_check;
alter table outreach_roles add constraint outreach_roles_category_check CHECK ((category = ANY (ARRAY['doctor'::text, 'nurse'::text, 'midwife'::text, 'pharmacist'::text, 'allied_health'::text, 'student'::text, 'first_aider'::text, 'other'::text])));

-- Self-checks ----------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'volunteer_category' and e.enumlabel = 'allied_health'
  ) then
    raise exception 'allied_health is missing from volunteer_category: run 20260925a first';
  end if;

  if (select count(*) from pg_trigger
      where tgrelid = 'volunteer_profiles'::regclass
        and tgname in ('trg_volunteer_profiles_category_reverify', 'trg_volunteer_profiles_list_limits')
        and not tgisinternal) <> 2 then
    raise exception 'expected 2 new triggers on volunteer_profiles';
  end if;

  if position('allied_health' in (
    select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'outreach_roles_category_check' and conrelid = 'outreach_roles'::regclass
  )) = 0 then
    raise exception 'outreach_roles_category_check does not accept allied_health';
  end if;
end $$;
