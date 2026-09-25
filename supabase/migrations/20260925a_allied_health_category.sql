-- ============================================================================
-- 2026-09-25. Owner-approved. PASTE THIS ON ITS OWN, BEFORE 20260925b.
--
-- Adds 'allied_health' to the volunteer_category enum: optometrists, lab
-- scientists, physiotherapists, radiographers, dietitians. Until now they
-- could only choose 'other', which the skill rules (constants/
-- skillEligibility.ts) treat as support-only, so an optometrist could not
-- list refraction.
--
-- WHY ITS OWN PASTE. Postgres refuses to USE a new enum value inside the
-- transaction that added it, and the SQL editor wraps each paste in one
-- transaction. Nothing here uses it, so this paste succeeds; 20260925b is then
-- free to refer to it.
--
-- Idempotent. No begin/commit.
-- ============================================================================

alter type volunteer_category add value if not exists 'allied_health' after 'pharmacist';
