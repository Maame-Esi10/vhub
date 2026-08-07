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

- **Absence has no V-Score effect until the review is filed.** Marking a
  volunteer absent on the post-event attendance screen (`/api/checkin`, mode
  `resolve`) records the absence and moves no score. The −15 no-show penalty
  arrives only when the organisation files the post-event review with
  `attended: false` (`/api/vscore`, action `review`). **Consequence: an
  organisation that marks its no-shows but never reviews leaves them
  unpenalised** — the attendance record exists, but the volunteer's V-Score is
  untouched and the ranking multiplier never reflects it.

  Decided deliberately on 2026-08-07 in preference to penalising at resolve
  time. Two paths that both move `v_score` would double-punish a single
  no-show — once when the organiser flags the absence, again when the review
  files `attended: false` — and the double-count would be invisible, because
  neither path can see what the other did (see the non-idempotent penalty note
  below, which is the same class of problem). Keeping exactly one writer also
  keeps a V-Score fully derivable from its event records, which the planned
  V-Score-as-derived-value change depends on: a score that can be recomputed
  from the reviews alone is one that can be audited and repaired, and a
  penalty applied outside that trail would break the property.

  Mitigations if it matters before submission: prompt the organisation to
  review after marking anyone absent, or have the review screen surface
  unreviewed absentees. Neither changes where the score moves.

  **Defence.** "Attendance and reputation are deliberately separated. Marking
  someone absent records a fact; changing their score is a judgement, and it
  happens in one place — the post-event review. That keeps a V-Score derivable
  from the event record rather than accumulated from side effects, at the cost
  of an organisation that never reviews leaving no-shows unpenalised."

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

- **Profile-wiping bug via the clinical verification gate (found on device
  2026-07-31, fixed).** The "Verify my identity" action on the outreach detail
  screen's clinical gate pushed to `app/(auth)/verify-identity.tsx`. That
  screen is a STEP OF THE ONBOARDING WIZARD, not a standalone verification
  flow: it submits the whole wizard payload from `useOnboardingStore`, which
  is `reset()` once onboarding completes. An already-onboarded volunteer who
  reached it and pressed "Complete Later" therefore wrote
  `category: null, skillTags: [], specialties: [], availabilitySlots: [],
  region: null, district: null` over their saved profile — and the now-null
  `category` made `useAuthGuard`'s incomplete-onboarding check drag them back
  through the entire wizard. Reproduced and confirmed by the owner.

  Fixed in two layers, because removing one link does not stop the next one
  being added: (1) the gate no longer navigates at all — it opens a
  ConfirmDialog explaining that verification is team-reviewed and not yet
  available in-app; (2) `persistAndFinish` in verify-identity.tsx now refuses
  to submit when the onboarding store is empty AND the saved profile already
  has a category, which is precisely the "arrived from outside the wizard"
  signature. The same trap was already closed on the Settings row earlier the
  same day; this was the second, missed entry point.

  **Still to build (Phase 4):** a standalone re-verification screen that does
  NOT reuse the wizard's submit path — it should upload a credential document
  (Cloudinary) and move `verification_status` to `documents_pending`, leaving
  every other column untouched. Until it exists, nothing may link to
  `(auth)/verify-identity` from outside the onboarding wizard. Both the
  Settings row and this gate are waiting on it.

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

## Test on device next session (as of 2026-07-31)

All SQL below has been RUN successfully against the live Supabase project.
The code is committed and pushed (05f345e). What is outstanding is device
verification, not implementation.

**Confirmed working on device by the owner:**
- Quick Join, Apply Now, withdraw, and re-apply after withdrawal.

**Written and typechecked but NOT yet exercised on a device:**
1. **Calendar / clock pickers** on create-outreach (step 2). NOTE: this added
   a native module (`@react-native-community/datetimepicker`), so a plain
   `npx expo start --dev-client -c` may not be enough — the dev client itself
   may need rebuilding. Check: past dates are blocked; the saved value still
   round-trips as `YYYY-MM-DD` / `HH:MM`.
2. **Accept / Waitlist / Reject on the volunteer's full profile.** Reached
   from Applicant Vetting -> View Full Profile. Confirm the bar appears only
   when arriving from the applicant list, and that deciding returns to the
   list with the status updated.
3. **The rejected -> pending trigger.** Reject an application as the
   organisation, then confirm that volunteer cannot re-apply to it (the
   withdraw -> re-apply path must still work). This is the one piece of the
   security model with no test coverage at all.
4. **Settings + organisation Info Hub**, reached from the gear on each Profile
   tab — both were built after the last device session.
5. **Tab bar safe-area and label fit** on the organisation's five-tab bar.

**Still unbuilt, in rough priority order:** change-password flow (Account
Security row); standalone re-verification screen (the Identity Verification
row in Settings is read-only until it exists); the Gemini-key fallback proof
(remove `GEMINI_API_KEY` from Vercel, confirm the feed still ranks with
`layer2Applied: false`, restore it); then the deferred Cloudinary flyer upload
and OpenStreetMap location work described above.

---

## Design decisions — planning discussion, 2026-08-05

The following were decided in a full design discussion with the project owner
and are final. Each records the problem, the decision, and the reasoning,
because the reasoning is the defensible part.

### 1a. Skills score: divide by the requirement, not the larger set

**Problem.** The original spec scored skills as `matched / max(|volunteer
skills|, |required skills|)`. This penalised breadth. For an outreach
requiring 5 skills, a volunteer holding exactly those 5 scored 5/5 = 1.0,
while a broad, experienced volunteer holding the same 5 plus 15 others scored
5/20 = 0.25 — marked down for being well-rounded despite meeting every
requirement. Since skills carry the largest weight (35 of 100), this was the
single most distorting flaw in the scorer.

**Decision.** `skillsScore = matched required skills / required skills`. Both
volunteers above now score 1.0. Skills beyond the requirement neither help nor
hurt.

**Edge cases.** An outreach with no required skills scores 1.0 — nothing is
required, so nothing can be missing. (This reverses an earlier assumption that
an empty requirement scored 0 to avoid a "free pass"; an empty requirement is
a statement by the organisation, not a data gap.) A volunteer with no skills
against a real requirement still scores 0 and needs no special case: nothing
matches, so the numerator is zero.

**Defence.** "The skills component measures coverage of what the event
requires, not similarity between two skill sets. Dividing by the requirement
means a volunteer is scored on whether she can do the job, and is never
penalised for capabilities the event happens not to need."

### 1b. Reliability multiplier: reputation as a bounded penalty

**Problem.** The match score measured FIT only (skills, category, location,
availability, experience); V-Score measured RELIABILITY and had no effect on
ordering whatsoever. Two candidates with identical 95% fit therefore ranked
equally even when one had never missed an event and the other repeatedly
no-showed. A volunteer who keeps flunking should not be given the same
priority as a reliable one — nor as someone who simply has not been tested.

**Decision.** Final ranking score = `matchScore × reliabilityMultiplier`,
derived from the volunteer's V-Score band:

| Band | Range | Multiplier |
|---|---|---|
| Elite | 90+ | 1.00 |
| Trusted | 75–89 | 1.00 |
| Active | 60–74 | 1.00 |
| New volunteer | 70 (Active) | 1.00 |
| Developing | 40–59 | 0.90 |
| At Risk | <40 | 0.70 |

**Reasoning, which must be preserved.**

- The multiplier is **bounded in (0,1]** — it can only ever REDUCE a ranking,
  never inflate one. This gives a provable invariant: fit defines the ceiling,
  and reliability can only pull a candidate down from it. A boost above 1.0
  was deliberately rejected. It would let reputation override fit (an Elite
  volunteer leapfrogging a better-fitting Trusted one) and would structurally
  disadvantage new volunteers, who start at 70 and have done nothing wrong.
- New and untested volunteers sit at 1.00 — neutral. Not having a track record
  is NOT the same as having a bad one, and must never be penalised.
- **At Risk = 0.70 is calibrated, not arbitrary.** A 90%-fit chronic no-show
  drops to 63, so a reliable volunteer needs roughly 63%+ fit to overtake
  them. That is a meaningful demotion — proven unreliability costs roughly one
  band of fit — without burying them so deep that redemption becomes
  impossible. 0.65 was considered and judged too aggressive (it would let a
  barely-qualified reliable volunteer beat a highly skilled one); 0.75 too
  forgiving.
- **Developing = 0.90** is a mild nudge for volunteers with minor dings or who
  are recovering.

**Presentation rule.** Both the RAW match score AND the V-Score remain visible
to organisations. The multiplier affects ORDERING only; it is never presented
as the volunteer's match percentage, and the match breakdown continues to
explain fit transparently. `applications.match_score` stores the raw score —
writing the multiplied value would conflate fit with reliability and silently
rewrite the historical record every time a V-Score moved.

**Where it applies.** `/api/match` mode `score_applicants`, where the
multiplier varies between the candidates being compared. It is deliberately
NOT applied in `rank_feed`: there the volunteer is ranking outreaches, so the
multiplier would be their own single V-Score applied identically to every row
— a positive constant, which cannot change the order — and applying it would
only risk a deflated number leaking into a displayed match percentage.

**Defence.** "The reliability modifier is a bounded penalty in (0,1] —
reputation can only reduce a candidate's ranking, never inflate it, so
match-fit always dominates and new volunteers are never structurally
disadvantaged. Proven unreliability costs roughly one band of fit, which
demotes chronic no-shows below reliable candidates of moderately lower fit,
while still allowing redemption."

### 2. Feed pre-filter: scalability of the ranking loop

**Problem.** The feed scored EVERY open outreach for every volunteer on every
load, then sorted. At small scale this is fine, but compute was being spent
scoring outreaches the volunteer could never realistically attend. At 10,000
outreaches, scoring the ~200 relevant ones instead is roughly a 50× saving —
and it is also what keeps the Gemini batch in Layer 2 small.

**Decision.** `rank_feed` pre-filters candidates before scoring:

1. `status = 'open'`
2. slots still available (`slots_filled < slots_total`)
3. region ∈ the volunteer's own region **or an adjacent region**

**Deliberately NOT pre-filtered**, and this is the important half of the
decision:

- **Category** — a related category still scores 0.5, and support roles match
  everyone, so an exact-category filter would wrongly drop valid matches.
- **Skills** — a partial overlap is a legitimate match.
- **Availability** — an event spanning slots, or a storage quirk, could
  wrongly hide a valid outreach. Let these score 0 rather than be filtered
  out.

The governing principle: **only exclude the genuinely impossible.** Anything
that could plausibly score above zero must still be scored and ranked. The
pre-filter changes what is CHEAP TO RANK, never what is DISCOVERABLE.

**Region adjacency.** `GHANA_REGION_ADJACENCY` in
`constants/ghana-locations.ts` maps which of the 16 regions share a land
border. Two properties are enforced by unit test rather than trusted: it is
**symmetric** (a one-way edge would make the feed asymmetric in a way nothing
in the UI would reveal), and it errs toward **inclusion** where two regions
meet only at a corner — a wrongly-included region merely scores low on
location, whereas a wrongly-excluded one is invisible.

**Empty-feed guard.** If fewer than 5 candidates survive the region filter,
the search widens to the whole platform (`shouldWidenFeedSearch` in
`lib/matching/feedFilter.ts`, unit-tested at the boundary). Five is a floor on
a USEFUL feed, not merely a non-empty one. The rule does not fire when the
volunteer applied their own explicit region filter (their choice wins) or when
no region restriction was applied in the first place (the query was already
unrestricted, so repeating it would waste a round trip).

**Complexity.** Scoring is O(N × S) and sorting O(N log N) over RELEVANT N —
open, still-recruiting, reachable — not over every outreach on the platform.

**Implementation note.** The slots predicate runs in application code
immediately after the fetch rather than in the query, because PostgREST cannot
express a column-to-column comparison (it filters columns against literals
only). It still runs BEFORE any scoring, so the scoring cost is over relevant
N either way; only the transferred row count is unaffected. Moving it into the
database would require a generated `has_open_slots` column — a schema change
not worth making for a predicate this cheap.

**Defence.** "The feed pre-filters to open, non-full outreaches within a
reachable region before scoring, so ranking cost grows with the number of
relevant outreaches rather than the total on the platform — with a fallback
that widens the search in low-activity regions so no volunteer sees an empty
feed."
