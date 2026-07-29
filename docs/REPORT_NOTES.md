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

- **Support-role outreaches auto-satisfy the category component (2026-07-28, owner-approved).**
  In the Layer 1 scorer, an outreach with `role_type = 'support'` scores the
  Category×20 component at 1.0 for every volunteer, regardless of their category
  or any `required_category`. Rationale: support roles need no specific health
  profession, so category fit shouldn't gate or rank them. Clinical outreaches
  still score category strictly via `categoryMatchScore`. Implemented in
  `computeLayer1MatchScore` (not inside `categoryScore`, which stays a pure
  category-vs-category comparison). CLAUDE.md's Matching Engine section is silent
  on this; it's a deliberate owner decision, covered by unit tests + a golden case.

- **`event_outcome` derivation for V-Score (2026-07-28, owner-approved).**
  CLAUDE.md gives `new_score = 0.7×old + 0.3×event_outcome` but not how
  `event_outcome` (0–100) is derived. Defined in `lib/vscore.ts`
  `computeEventOutcome`: no-show (`attended=false`) → 0; attended with both
  scores → `((reliability_score + clinical_score) / 2) × 20`; attended with no
  clinical score (support volunteers aren't clinically rated) → `reliability_score × 20`;
  attended but reliability missing (data gap) → neutral 60. Separate from the flat
  cancellation/no-show penalties (−15 / −8 / −2), which are a distinct mechanism.

- **Automatic waitlist promotion (2026-07-28, owner-approved).** When an
  accepted volunteer cancels and frees a slot, the serverless
  `/api/application-status` endpoint automatically promotes the highest-`match_score`
  waitlisted applicant (earliest application on a tie) and notifies them by email
  and push. Rationale: automatic promotion directly attacks the no-show /
  unfilled-slot problem the project exists to solve; a manual org promotion step
  would reintroduce coordination delay and the risk of slots sitting empty. The
  volunteer client's existing direct-Supabase cancel should ALSO call
  `/api/application-status` with `status:"cancelled"` (idempotent) so promotion
  actually runs — wired in Phase 3.3.

- **Volunteer feed ranked server-side by the full two-layer engine
  (2026-07-29, owner-approved).** `/api/match` was originally built
  organisation-oriented only: `score_applicants` ("score the people who applied
  to my outreach"), which `assertOwnsOutreach` restricts to the owning
  organisation. The ranked volunteer feed needs the mirror image — "rank these
  open outreaches for me" — and a volunteer JWT could not call anything.

  Two options were weighed:

  1. **Rank client-side** with the pure `lib/matching/layer1.ts` scorer. Free,
     offline-capable, no quota use — but Layer 1 only. The volunteer's feed
     would have been strictly less intelligent than the organisation's
     applicant list, matching only on exact skill wording.
  2. **Add a volunteer mode to `/api/match`** running the same Layer 1 + Gemini
     Layer 2 pipeline.

  Option 2 was chosen. Rationale (owner): the volunteer feed is the surface
  where AI-assisted matching adds the most value — it is the one screen every
  volunteer sees on every visit, and semantic skill matching is exactly what
  stops a qualified volunteer missing an event that described the same skill in
  different words. A feed that silently used weaker matching than the
  organisation view would also undercut the project's central claim.

  Implemented as `mode: "rank_feed"`, plus `mode: "score_my_application"` for
  the apply-time write (see below). Design points worth reporting:

  - **Nothing is persisted by `rank_feed`.** A feed ranking is transient — it
    changes the moment a volunteer edits their skills — whereas
    `applications.match_score` records the score *at apply time*. Conflating
    the two would have made `match_score` unstable and meaningless as an
    audit trail of why an applicant was ranked where they were.
  - **Quota control, three mechanisms.** (a) One request ranks the entire feed,
    so scrolling costs nothing — the client holds the ranked list and never
    pages back; (b) every (skill, skill) verdict Gemini returns is written to
    the shared `skill_match_cache` table, and because `constants/skills.ts` is
    a small closed vocabulary the cache saturates quickly, so steady-state
    refetches make **zero** Gemini calls; (c) only skill pairs that don't
    literally match are ever sent, batched into a single call for the whole
    feed rather than one per outreach. React Query's 5-minute `staleTime` on
    the client is the fourth layer.
  - **`score_my_application` (new).** `applications.match_score` is
    service-role write-only, and `score_applicants` is organisation-only, so a
    volunteer could not cause their own application to be scored. This mode
    scores and persists exactly one row, looked up by
    `(outreachId, caller.userId)` — never by a client-supplied application id,
    so a volunteer cannot reach anyone else's row. Called best-effort right
    after the application insert: the application is valid without a score, so
    a scoring failure must never surface as a failed application.
  - **Two-step degradation, surfaced honestly.** Gemini unavailable → the
    server still returns a Layer 1 ranking and reports `layer2Applied: false`.
    The API itself unreachable → `useRankedFeed` falls back to the plain
    Supabase query and reports `ranked: false`, and the feed header says the
    list is newest-first rather than ranked. Showing an unranked list while
    implying it is a match ranking would misrepresent the engine.

- **Bug found and fixed while adding the feed mode (2026-07-29).**
  `toOutreachInput` in `/api/match` never passed `role_type` through to
  `computeLayer1MatchScore`, so the owner-approved support-role category
  override (a `support` outreach forces the category component to 1.0) had
  been silently inactive for every applicant scored through the API since
  Phase 3.2 — the pure scorer implemented the rule correctly, but the API
  never fed it the field it keys on. Worth reporting as an example of a
  correct unit-tested function being defeated at its integration boundary,
  which unit tests by construction cannot catch.

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

- **Layer 1 scorer and V-Score recompute math implemented (2026-07-28),
  `lib/matching/layer1.ts` and `lib/vscore.ts`, both flagged for owner
  sign-off since CLAUDE.md leaves several edge cases undefined:**
  (1) Skills — an empty `required_skills` OR empty `skill_tags` list scores 0,
  not a "nothing required = free pass" 1.0, since Skills is the largest
  weight (35/100); matching is case/whitespace-insensitive with duplicate
  tag variants deduplicated before dividing. (2) Availability with no
  outreach `start_time`/`end_time` (or an unparseable/nonsensical time range)
  is treated as "all day", so any slot on the matching weekday counts; a
  missing/invalid outreach `date` instead fails CLOSED (availability = 0),
  since there's no weekday to check against at all. (3) V-Score
  `event_outcome` (the 0.7×old + 0.3×outcome blend): `attended === false` ->
  outcome floors at 0 (separate from, and stackable with, the flat -15
  no-show penalty which targets the application/cancellation flow, not the
  review flow); `attended === true` averages `reliability_score` and
  `clinical_score` (both 1-5) then scales ×20 (1/1 -> 20, 5/5 -> 100, never
  0 for someone who actually showed up); a null `clinical_score` (support-role
  / non-clinical volunteers are never clinically scored) falls back to
  reliability alone; a missing `reliability_score` despite `attended = true`
  (a data-entry gap the review UI shouldn't normally allow) substitutes a
  neutral default of 3/5 (-> 60/100) rather than crashing or silently
  producing 0. See the doc comments on `computeEventOutcome` in
  `lib/vscore.ts` and `skillsScore`/`availabilityScore` in
  `lib/matching/layer1.ts` for the full rationale.

- **`experience_level` has no onboarding UI.** CLAUDE.md's onboarding step
  list (skills, category, specialties, region+district+availability,
  declaration) and the matched Figma screens never cover
  `volunteer_profiles.experience_level`, so it's left `null` after
  onboarding for every volunteer. This silently zeroes/undermines the
  Experience×10 component of the matching formula until it's set somewhere
  (a future profile-edit screen, most likely). Decide where this gets
  collected before Phase 3 matching goes live.
