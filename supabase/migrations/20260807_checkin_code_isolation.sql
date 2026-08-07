-- ============================================================
-- Move the check-in secret out of `outreaches` (security fix)
-- 2026-08-07. Supersedes part of 20260805_attendance_and_reviews.sql.
-- ============================================================
--
-- Run this whole file in the Supabase SQL editor. It is idempotent.
--
-- THE BUG. 20260805 added `outreaches.checkin_code` and described it as
-- readable by the owning organisation only. It was not. `outreaches` is
-- governed by outreaches_select_open_or_own:
--
--     using (status <> 'draft' or organisation_id = auth.uid())
--
-- which makes every non-draft outreach row readable by every authenticated
-- user -- and RLS scopes ROWS, never COLUMNS (the standing note at the foot of
-- schema.sql). `authenticated` still held the default table-level SELECT, so
-- the secret was one query away from any signed-in volunteer:
--
--     supabase.from('outreaches').select('checkin_code').eq('id', <any open id>)
--
-- With the code in hand, /api/checkin's comparison against it passes for
-- someone who never went near the venue, and since scan coordinates are
-- optional by design the result resolves to 'unavailable' -- which counts as
-- PRESENT. The entire attendance feature would have been theatre.
--
-- THE FIX, and why it is a new table rather than a column privilege. The
-- obvious repair is `revoke select on outreaches` + a column-level grant list.
-- That works, but it makes `select('*')` on outreaches fail with 42501 for
-- every client (PostgREST expands `*` at parse time and needs the privilege on
-- each column), so all four read sites in hooks/useOutreaches.ts would have to
-- carry a hand-maintained column list forever -- and a column added later
-- would silently go missing from the app rather than fail loudly.
--
-- A per-row secret owned by one organisation is a ROW problem, and rows are
-- exactly what RLS is good at. Moving it to its own table lets the existing
-- machinery do the work: one policy, no column lists, `outreaches.*` stays
-- complete and safe, and the privilege question can never be reopened by
-- someone adding a column to the wrong grant list.


-- ------------------------------------------------------------
-- 1. The codes table
-- ------------------------------------------------------------
--
-- PK is outreach_id, not a surrogate id: exactly one live code per outreach.
-- The code is NOT rotated -- reissuing it would invalidate the QR an organiser
-- may already be displaying at a live event.
create table if not exists outreach_checkin_codes (
  outreach_id uuid primary key references outreaches(id) on delete cascade,
  code uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

comment on table outreach_checkin_codes is
  'The secret inside each check-in QR. Readable ONLY by the owning organisation (RLS); written only by the issuing trigger and the service role. Deliberately not a column on outreaches, whose rows are world-readable to authenticated users.';


-- ------------------------------------------------------------
-- 2. Carry the live codes across
-- ------------------------------------------------------------
--
-- Preserves any code already issued, so an outreach that has been displayed
-- keeps working. Guarded by to_regclass/column existence so the file is safe
-- to re-run after step 5 has already dropped the old column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'outreaches'
      and column_name = 'checkin_code'
  ) then
    insert into outreach_checkin_codes (outreach_id, code)
    select id, checkin_code from outreaches where checkin_code is not null
    on conflict (outreach_id) do nothing;
  end if;
end $$;

-- Any outreach without one (created before 20260805, or inserted between that
-- migration and this one) gets a fresh code.
insert into outreach_checkin_codes (outreach_id)
select id from outreaches
on conflict (outreach_id) do nothing;


-- ------------------------------------------------------------
-- 3. Issue a code with every new outreach
-- ------------------------------------------------------------
--
-- The old design got this free from a column default. A separate table needs a
-- trigger, and the trigger must be SECURITY DEFINER: it fires as the
-- organisation that inserted the outreach, and that role has no insert
-- privilege or policy here (step 4) -- by design, since a client being able to
-- write this table is the whole thing we are preventing. Definer rights let
-- the trigger insert without granting the caller anything.
create or replace function issue_outreach_checkin_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into outreach_checkin_codes (outreach_id)
  values (new.id)
  on conflict (outreach_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_outreaches_issue_checkin_code on outreaches;
create trigger trg_outreaches_issue_checkin_code
  after insert on outreaches
  for each row execute function issue_outreach_checkin_code();


-- ------------------------------------------------------------
-- 4. Access
-- ------------------------------------------------------------
alter table outreach_checkin_codes enable row level security;

-- The owning organisation, and nobody else. A volunteer gets zero rows --
-- not a filtered column, no row at all -- which is the property the old
-- arrangement could not express.
drop policy if exists "outreach_checkin_codes_select_owner" on outreach_checkin_codes;
create policy "outreach_checkin_codes_select_owner"
  on outreach_checkin_codes for select
  to authenticated
  using (
    exists (
      select 1 from outreaches o
      where o.id = outreach_checkin_codes.outreach_id
        and o.organisation_id = auth.uid()
    )
  );

-- No insert/update/delete policy, and the table-level privileges go too:
-- codes are issued by the trigger above and read by the service role in
-- /api/checkin. Nothing a client does should ever write here -- setting your
-- own outreach's code to a value you already know is not a threat (you own the
-- event), but rotating another shape of it later might be, and there is no
-- reason to leave the door open.
revoke insert, update, delete on outreach_checkin_codes from authenticated;


-- ------------------------------------------------------------
-- 5. Drop the exposed column
-- ------------------------------------------------------------
--
-- ORDERING: /api/checkin reads this. Run this file, then deploy the API that
-- reads outreach_checkin_codes (api/src/app/api/checkin/route.ts). Scanning is
-- broken in between -- acceptable here because the scanner screen has not
-- shipped, but do not run this against a database whose deployed API still
-- expects the column.
alter table outreaches drop column if exists checkin_code;
