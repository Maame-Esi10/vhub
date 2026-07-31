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

- **`profiles.role` and `organisation_profiles.verified` locked at the database
  level (2026-07-31, owner-approved).** Found while tracing a
  `permission denied for volunteer_profiles` bug during on-device testing.
  `supabase/schema.sql` applied its "revoke table, grant back columns" UPDATE
  protection to `volunteer_profiles`, `applications` and `outreaches`, but never
  to `profiles` or `organisation_profiles` — so both kept Supabase's default
  table-level UPDATE grant to `authenticated`, covering every column. RLS could
  not compensate: `profiles_update_own` / `organisation_profiles_update_own`
  check only row ownership (`auth.uid() = id`), never which columns changed.

  That left a complete privilege-escalation chain, reachable with nothing but
  the shipped publishable key and a valid session JWT (curl/PostgREST, no app
  UI involved): `update profiles set role='organisation'` → insert an
  `organisation_profiles` row (the insert policy checks `auth.uid() = id`, not
  role) → `update organisation_profiles set verified=true` → create outreaches,
  review volunteers (moving real V-Scores), and read the applicant PII that
  `profiles_select_authenticated` exposes to "the organisation". Notably
  `verified` was *already* excluded from the INSERT grant list, whose comment
  names it a "self-assigned trust badge" — so the UPDATE path was an oversight,
  not a deliberate exception.

  Never reachable through the shipped app (there is no organisation-profile edit
  screen, and nothing writes `role` after signup), so this closed a capability
  rather than an active exploit. Fixed by extending the same column-grant
  pattern to both tables, omitting `role` and `verified`. Owner rationale: a
  health app handling professional credentials and patient-facing volunteer PII
  should not rely on the absence of a UI screen for its access control, and
  role being immutable after signup is correct behaviour regardless.

  Worth reporting as a security-design point: the defence is *deny by omission*
  — a column is protected precisely by not appearing in a grant list, so the
  safe failure mode is a write that stops working (visible immediately) rather
  than a privilege that silently stays open. The matching trap is documented in
  CLAUDE.md: the fix for such a failure is to move the write to the serverless
  API, never to widen the grant.

- **Tab bar labels: "Home" adopted from Figma, "PLAN" wording rejected.** The
  volunteer bar in `design-refs/Volunteer Home Feed.png` is labelled HOME /
  PLAN / SCHEDULE / PROFILE. The first was adopted — the tab was called "Feed",
  and "Home" is both more relatable to a volunteer and what the design says, so
  the two now agree. The rest were deliberately kept as **Applications /
  Schedule / Profile** over the Figma wording: "Plan" is ambiguous about
  whether it means the volunteer's own schedule or something they are planning,
  whereas "Applications" names exactly what the tab holds — the outreaches this
  volunteer has applied to and their pending/accepted/rejected state. Clarity
  for a first-time user beat literal design fidelity here. The underlying route
  file stays `feed.tsx`; only the display label changed, so no `router.push`
  call site or URL moved. Icons were then matched to the *current* labels
  rather than the Figma glyphs — Applications shows a document, not Figma's
  calendar, because a calendar next to a "Schedule" tab that also shows a
  calendar would read as duplicated.

- **`experience_level` collected on the profile-edit screen, not onboarding.**
  Resolves the gap logged under Known issues below. It was left out of the
  onboarding wizard deliberately: it is the one matching input that genuinely
  changes over a volunteer's career, so a one-off signup wizard is the wrong
  place to capture it. It now lives in the PROFESSIONAL IDENTITY card on
  `app/(volunteer)/edit-profile.tsx` as a beginner/intermediate/experienced
  select, with helper copy saying it feeds match quality. Safe as a
  client-writable field — it is already in the `volunteer_profiles` UPDATE
  grant list, and unlike `v_score` it is a self-declaration rather than an
  earned score, so there is nothing for a volunteer to gain by editing it that
  they could not also have claimed at signup.

## Known issues (open, not blocking)

- **`/api/vscore` `action: "penalty"` is not idempotent.** There is no ledger of
  penalties already applied per application, so the same `applicationId` can be
  submitted repeatedly and each call re-subtracts the flat penalty (−15 no-show
  / −8 late / −2 on-time) from `v_score`. Damage is bounded — the
  `v_score >= 0` check constraint in `supabase/schema.sql` stops it going
  negative — and both callers are authenticated and authorised, so this is a
  data-integrity gap rather than a security hole. There is also no audit trail
  of how many times a given no-show was penalised. Should get an
  `applications.penalty_applied_at` (or a small penalty ledger table) plus a
  server-side rejection of a repeat penalty for the same application/type before
  final submission. Deferred deliberately on 2026-07-31: not urgent, and the
  V-Score pipeline's correctness under normal single-call use is unaffected.

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

- **~~`experience_level` has no onboarding UI.~~ RESOLVED 2026-07-31.**
  CLAUDE.md's onboarding step list (skills, category, specialties,
  region+district+availability, declaration) and the matched Figma screens
  never covered `volunteer_profiles.experience_level`, so it was left `null`
  after onboarding for every volunteer, silently undermining the
  Experience×10 component of the matching formula. It is now collected on the
  volunteer profile-edit screen — the "future profile-edit screen" this note
  anticipated — rather than being added to the wizard; see the Design
  decisions entry above for why that placement was chosen. Volunteers who
  onboarded before this screen existed still have `experience_level = null`
  until they visit it once. That degrades gracefully rather than crashing —
  `experienceScore()` in `lib/matching/layer1.ts` returns 0 for null — but note
  0 is *below* beginner's 0.3, so an un-edited volunteer is scored slightly
  worse on that component than one who declares themselves a beginner. Setting
  it once on this screen is what closes the gap.

- **Settings rows deliberately not built (2026-07-31).**
  `design-refs/Settings.png` shows five rows; three were not built because the
  underlying feature does not exist, and a settings row that does nothing is
  worse than no row. Decisions, so they aren't re-argued:

  - **Account Security — BUILD THIS, it is a real gap.** There is currently no
    way for a signed-in user to change their password in-app. For a platform
    holding health volunteers' PII that is a genuine security shortcoming, not
    a nice-to-have. `design-refs/Forgot Password.png` already covers the
    signed-out reset half; what is missing is the signed-in change-password
    flow. Supabase supports it directly via `supabase.auth.updateUser({
    password })`, so this is a screen plus a hook, not a schema change. Do it
    when the Phase 4 polish pass happens, and wire it to this row.
  - **Linked Accounts — will not build.** Implies OAuth / social sign-in.
    V-HUB's auth is Supabase email+password only; adding a provider is a whole
    separate flow with no benefit to the project's aims.
  - **Language — will not build.** The app is not internationalised and English
    is Ghana's official language. Real translation (Twi, Ga, Ewe) is a
    substantial i18n project and is outside the spec; a toggle with one option
    would be theatre.

  Also dropped from that PNG: the "Premium Member" subtitle (V-HUB has no paid
  tier) — replaced with the volunteer's actual V-Score band, which is a real
  status they hold.

- **The Identity Verification row in Settings is deliberately read-only.**
  The only identity-verification screen is `app/(auth)/verify-identity.tsx`,
  which is a *step of the onboarding wizard*: it reads `useOnboardingStore`
  (empty outside that flow) and submits `useCompleteOnboarding`. Linking a
  settings row to it would let an already-onboarded volunteer overwrite their
  saved category, skill_tags, specialties and availability_slots with blanks —
  silent data loss. The row shows status only. A standalone re-verification
  screen must exist before it can become tappable; that is the same Phase 4
  pass as the change-password flow above.

- **Re-applying after a withdrawal (2026-07-31).** `applications` has
  `unique (outreach_id, volunteer_id)`, so a withdrawn application keeps
  occupying that slot. The outreach detail screen correctly treats
  `status = 'cancelled'` as "not applied" and re-shows Quick Join / Apply Now,
  but the INSERT behind those buttons hit the unique constraint, and the error
  mapping rendered 23505 as "You've already applied to this outreach" — told
  to someone who had just withdrawn, with no way forward.
  `useCreateApplication` now reactivates the existing cancelled row with an
  `.update()` instead of inserting a second one. Deliberately not `.upsert()`:
  PostgREST puts every payload column in the ON CONFLICT SET clause, and
  `outreach_id`/`volunteer_id` are excluded from the applications UPDATE grant,
  so the statement would be rejected with 42501. Two database changes were
  needed alongside it — `type` and `motivation` added to the UPDATE grant list
  (both volunteer-authored and already INSERT-grantable), and
  `applications_update_own_cancel`'s WITH CHECK widened from a hard-coded
  `status = 'cancelled'` to also allow `'pending'` under exactly the
  eligibility test `applications_insert_own` uses, so re-applying cannot slip
  an unverified volunteer into a clinical outreach.

- **Known limitation — a volunteer can move their own rejected application
  back to pending.** A policy's USING clause sees the old row and WITH CHECK
  the new one, and Postgres ORs multiple permissive policies rather than
  pairing them, so the re-apply allowance above cannot be restricted to rows
  that were specifically *cancelled*. A rejected applicant can therefore
  re-enter the queue. Judged a nuisance rather than an escalation: they still
  cannot write accepted/rejected/waitlisted, cannot alter `match_score`, and
  cannot touch another volunteer's row, and the organisation sees the
  resulting status. Constraining it precisely needs a `BEFORE UPDATE` trigger
  comparing `old.status` to `new.status`; deferred, not built.

## Planned, not built (decided 2026-07-31)

Both of these were raised, scoped, and deliberately deferred — they are not
oversights. Build them in the Phase 4 pass, alongside the change-password flow
and the standalone re-verification screen already noted above.

- **Outreach flyer / photo upload — full Cloudinary path (Option A, owner-approved).**
  An organisation currently cannot attach a picture or flyer when creating an
  outreach. Owner chose the complete implementation over a UI-only placeholder,
  on the reasoning that Cloudinary has to be stood up anyway for profile photos
  and credential documents, so the upload path should be built once and shared.
  Deferred until that Cloudinary work happens rather than done in isolation.
  What it needs, in order:
  1. `outreaches.image_url text` column, plus adding `image_url` to the
     outreaches INSERT **and** UPDATE grant lists at the bottom of
     `supabase/schema.sql` — it is organisation-authored, not server-computed.
     Mirror it in `types/database.ts` (`Outreach`).
  2. `expo-image-picker` for selection. Not currently a dependency.
  3. A signed-upload endpoint in the serverless API (`api/`). The Cloudinary
     API secret is a secret and must live ONLY in Vercel env vars per CLAUDE.md
     hard rule 4 — the mobile app must never hold it. The app requests a
     signature, then uploads directly to Cloudinary and sends back the
     resulting URL.
  4. UI: a picker in the create-outreach wizard (step 1 or the preview step),
     and rendering on `OutreachPreviewCard`, the feed cards, and the outreach
     detail header. Note the volunteer feed design
     (`design-refs/Volunteer Home Feed.png`) already shows outreach cards with
     a full-bleed photo behind the title, so the display side has a design to
     match — this is the missing half of that card.
  5. Reuse the same signed-upload endpoint to finish the "coming soon" photo
     buttons already present on both Edit Profile screens.

- **OpenStreetMap for outreach location (owner request, deferred).**
  Outreaches currently capture region + district + a free-text
  `location_name`. Volunteers get no map and no precise point, which matters
  for an outreach at a named clinic or a field site with no street address.
  Plan: let the organisation drop/adjust a pin on an OpenStreetMap view when
  creating an outreach, store the coordinates, and show the pin (plus a
  "directions" hand-off) on the outreach detail screen. Notes for whoever
  builds it:
  - OpenStreetMap specifically, not Google Maps — no API key, no billing
    account, and no quota to exhaust, which suits a free-tier student project.
    `react-native-maps` can be pointed at an OSM raster tile source, or use a
    WebView with Leaflet; decide once, and check the OSM tile usage policy
    before shipping anything that would hammer the public tile servers.
  - Needs `outreaches.latitude numeric` + `outreaches.longitude numeric`
    (nullable — existing outreaches have none), added to the same INSERT and
    UPDATE grant lists as `image_url` above.
  - `app/(volunteer)/map.tsx` already exists as a route; this is the data it
    has been missing.
  - Does NOT affect matching. Layer 1's Location component scores on
    district/region equality (`lib/matching/layer1.ts`), and coordinates must
    not quietly become a distance calculation — that would be a change to a
    spec CLAUDE.md marks final. Coordinates are for display and directions
    only unless the owner decides otherwise.
