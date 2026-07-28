# FYP Report Notes

Notes for the Design & Implementation chapter of the Final Year Project report.

- Cleanup: delete `design-refs/` once all UI is complete.

## Design decisions

- **Reasoning-over-documents is now a standing rule (2026-07-28).** CLAUDE.md,
  the rebuild guide, and the Figma PNGs are treated as evidence, not scripture —
  discrepancies between them are judged on merit (does it serve a real Ghana
  health-volunteer/org need?) rather than blindly followed or silently dropped.
  Clearly-good low-risk items are kept/built and noted; clear leftovers are
  removed with a reason; anything needing a schema/field/dependency/matching
  change is escalated to the user first. Every judgment call is logged here.
  The rule is baked into the `ui-builder` subagent's instructions too.

- **Professional categories broadened and reordered (2026-07-28).** Old set
  (`nurse, pharmacy_student, first_aider, doctor, midwife, other`) →
  new set `doctor, nurse, midwife, pharmacist, student, first_aider, other`.
  Rationale: `pharmacy_student` was too narrow — renamed to `student` to cover
  ALL health/medical disciplines (medicine, nursing, pharmacy, allied health),
  since many Ghanaian outreach volunteers are students across these fields, not
  pharmacy alone. Added `pharmacist` so qualified pharmacists aren't forced into
  a student label. Reordered qualified professionals → students → support roles
  so the onboarding picker leads with the strongest credentials. Labels: Doctor,
  Nurse, Midwife, Pharmacist, "Health or Medical Student", First Aider, Other.

- **Single related-category map as the scorer's source of truth (2026-07-28).**
  Defined `RELATED_CATEGORIES` + `categoryMatchScore()` in
  `constants/categories.ts` (exact = 1.0, related = 0.5, none = 0) so the Phase 3
  Layer 1 scorer (`lib/matching/layer1.ts`, still a stub) reads one map instead
  of scattering pairings across conditionals. Relations (symmetric):
  doctor/nurse/midwife are mutually related; pharmacist↔student; student is also
  related to nurse/doctor/midwife (a student partially fits any clinical role);
  first_aider and other relate to nothing.

- **`VolunteerCategory` type de-duplicated (2026-07-28).** The type was defined
  twice (`types/database.ts` and `constants/categories.ts`); the constants file
  now imports and re-exports it from `types/database.ts` so the two can't drift
  during category changes like this one. Same cleanup applied to the ad-hoc
  category-label map in `app/(volunteer)/profile.tsx`, which now reads
  `VOLUNTEER_CATEGORIES` like the other screens (ApplicantCard,
  OutreachPreviewCard, profile/volunteer/[id].tsx) instead of a third private copy.

- **`schema.sql` enum edited despite "don't touch the DB" (2026-07-28).** The
  live database is migrated by a separate ALTER TYPE script (run by the user),
  but the `create type volunteer_category` line in `supabase/schema.sql` was
  updated to the new value set so a FRESH install and `types/database.ts` (which
  claims to mirror the schema exactly) stay consistent — this edits the source
  file, not the running database. The enum's physical value order will differ
  between a migrated project and a fresh one; that's cosmetic only, since display
  order comes from `VOLUNTEER_CATEGORIES` in TS, never the enum.

- **Verification gates CLINICAL roles only (implement in Phase 2):**
  volunteers with `verification_status != 'verified'` can browse all
  outreaches and Quick Join support roles, but cannot submit a Full
  Application to a clinical role — they're prompted to complete
  verification first. Support roles never require verification. This is
  the enforcement point for the project's "check clinical credentials
  before event day" goal.

- **License numbers were removed from the design:** no public Ghana
  licensing API exists, so self-entered numbers provide no assurance.
  Verification is document-based with human org-admin review, reinforced
  over time by V-Score reputation. TODO before final: research whether any
  of the three Ghana councils offer any verification channel; design the
  org-admin document review UI (Phase 2/3).

## Before final submission / demo

- **Delete all test accounts and test data from Supabase.** Every account
  created while dogfooding auth/onboarding/matching during development is
  still in the project: Authentication → Users (delete each test user —
  this cascades to their `profiles`/`volunteer_profiles`/
  `organisation_profiles` rows via the FK), plus any leftover rows in
  `outreaches`, `applications`, and `event_reviews` created against those
  accounts. Check the table editor for each of the 6 tables, not just Auth
  → Users, since outreach/application rows can outlive the account that
  created them if deletion order was inconsistent. Do this last, right
  before the demo/submission build, so it isn't accidentally repopulated by
  further testing.

- **Verify the Supabase email confirmation setting.** As of 2026-07-10 the
  `vhub` project's "Confirm email" (Authentication → Providers → Email) is
  left ON. `app/(auth)/register.tsx` (via `hooks/useSignUp.ts`) handles both
  states. The first-login-after-confirmation profile bootstrap gap noted
  here previously is now **fixed**: `useSignUp` passes role/full_name/org
  fields as Supabase `signUp` `options.data` (auth user metadata — see
  `lib/auth-metadata.ts`), and `hooks/useAuthGuard.ts` reads that metadata
  to create the `profiles` / `volunteer_profiles` / `organisation_profiles`
  rows on the user's first authenticated session if they don't exist yet
  (i.e. right after they click the confirmation link and log in). Before
  submission, re-test end-to-end for whichever setting is final:
  - **With confirmation ON:** register → "check your email" state shows →
    click the link → log in → profile rows exist and land in onboarding
    (volunteer) / dashboard (organisation) correctly.
  - **With confirmation OFF:** register → straight into onboarding
    (volunteer) or the dashboard (organisation), no email step.
  - Also sanity-check the defensive fallback: an authenticated session with
    genuinely no profile row and no usable metadata (shouldn't happen via
    normal signup, but could via a manually-created auth user) gets signed
    out by `useAuthGuard` rather than landing in a broken tab group — worth
    a manual check via the Supabase dashboard if time allows.

- **The Supabase client isn't typed with the `Database` generic.**
  `lib/supabase.ts` calls `createClient(supabaseUrl, supabasePublishableKey, {...})`
  without a `Database` type parameter, so `.from(table).insert(...)`/`.update(...)`
  calls aren't checked against `types/database.ts` at all — a stale or
  misspelled column name currently passes `tsc --noEmit` silently (this is
  exactly how a leftover `license_number` write survived a schema change
  undetected during this session's design review). Wire `createClient<Database>`
  through once `types/database.ts` is restructured into the nested
  `Database['public']['Tables'][...]` shape the Supabase JS client expects
  (or generate it via `supabase gen types typescript`) — worth doing before
  Phase 2 adds many more `.from(...)` call sites.

- **Orphaned-account sign-out has no user-facing message.** `hooks/useAuthGuard.ts`'s
  `loadProfileForUser` silently calls `supabase.auth.signOut()` if an
  authenticated session has no `profiles` row and no usable
  `user_metadata` to bootstrap from (rare — normal signup always sets
  metadata; realistically only reachable via a manually-created/tampered
  auth user). The person is bounced to the welcome screen with zero
  explanation. Low priority since it's an edge case, but worth a toast/alert
  ("Your account needs attention — please sign up again") once the app has
  a toast system, rather than looking like a random logout.

- **`experience_level` has no onboarding UI.** CLAUDE.md's onboarding step
  list (skills, category, specialties, region+district+availability,
  declaration) and the matched Figma screens never cover
  `volunteer_profiles.experience_level`, so it's left `null` after
  onboarding for every volunteer. This silently zeroes/undermines the
  Experience×10 component of the matching formula until it's set somewhere
  (a future profile-edit screen, most likely). Decide where this gets
  collected before Phase 3 matching goes live.
