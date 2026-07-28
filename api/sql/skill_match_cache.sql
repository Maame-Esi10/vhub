-- V-HUB API -- skill_match_cache table (Gemini Layer 2 skill-equivalence cache).
--
-- NOTE: this table is ALREADY defined in supabase/schema.sql (search for
-- "skill_match_cache" there) -- it was added ahead of this task. Reproduced
-- here only for convenience/completeness of this api/ project's SQL
-- deliverables. If your Supabase project has already had the current
-- supabase/schema.sql run against it, this block is a no-op (IF NOT EXISTS /
-- DROP POLICY IF EXISTS guards) and you do not need to run it again.
--
-- Written/read ONLY by this api/ project via the service-role key. RLS is
-- enabled with ZERO policies granted to `authenticated`/`anon` -- default-deny,
-- so only service_role (which bypasses RLS) can touch it.

create table if not exists skill_match_cache (
  id uuid primary key default gen_random_uuid(),
  skill_a text not null,
  skill_b text not null,
  is_match boolean not null,
  created_at timestamptz not null default now(),
  unique (skill_a, skill_b)
);

alter table skill_match_cache enable row level security;
-- Intentionally no policies: only service_role (which bypasses RLS) may access this table.
