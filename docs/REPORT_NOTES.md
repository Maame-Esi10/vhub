# FYP Report Notes

Notes for the Design & Implementation chapter of the Final Year Project report.

- Cleanup: delete `design-refs/` once all UI is complete.

## Design decisions

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
