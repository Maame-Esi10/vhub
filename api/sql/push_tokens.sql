-- V-HUB API -- push_tokens table (Expo push notification registration).
-- NOT applied automatically. Copy-paste into the Supabase SQL editor
-- yourself, same as supabase/schema.sql. Safe to re-run (IF NOT EXISTS /
-- DROP POLICY IF EXISTS guards throughout).
--
-- A user may have more than one registered device, hence a separate table
-- (not a single column on profiles) keyed by (user_id, expo_push_token).
-- Only the owning user (or the service-role API, which bypasses RLS
-- entirely) may read/write their own tokens -- nobody should be able to list
-- or guess another user's push token.
--
-- MIRRORED IN supabase/schema.sql (same arrangement as skill_match_cache).
-- The two must stay identical -- edit one, edit the other. Running either is
-- enough; running both is harmless.
--
-- The FK to profiles(id) is load-bearing beyond referential integrity:
-- PostgREST can only embed across a declared FK. It does NOT make
-- `volunteer_profiles -> push_tokens` a one-hop embed -- those two are
-- siblings pointing at profiles, not related to each other -- which is why
-- notifyCandidates in src/app/api/match/route.ts nests push_tokens INSIDE
-- its profiles embed rather than selecting it alongside.

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  expo_push_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
-- (No-op if supabase/schema.sql already defined this function -- CREATE OR
-- REPLACE is idempotent either way.)

drop trigger if exists trg_push_tokens_updated_at on push_tokens;
create trigger trg_push_tokens_updated_at
  before update on push_tokens
  for each row execute function set_updated_at();

create index if not exists idx_push_tokens_user_id on push_tokens (user_id);

alter table push_tokens enable row level security;

drop policy if exists "push_tokens_select_own" on push_tokens;
create policy "push_tokens_select_own"
  on push_tokens for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_tokens_insert_own" on push_tokens;
create policy "push_tokens_insert_own"
  on push_tokens for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_own" on push_tokens;
create policy "push_tokens_update_own"
  on push_tokens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_delete_own" on push_tokens;
create policy "push_tokens_delete_own"
  on push_tokens for delete
  to authenticated
  using (user_id = auth.uid());

-- NOTE: the api/ project's /api/notifications and /api/application-status
-- routes read OTHER users' tokens (e.g. to push an acceptance notice to a
-- promoted waitlisted volunteer) using the SERVICE-ROLE client, which
-- bypasses RLS entirely -- this is expected and is why service-role stays
-- server-only. No additional policy is needed or should be added for that.
