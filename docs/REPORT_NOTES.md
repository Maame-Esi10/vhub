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

## Spec correction — an unrated review must not move a V-Score (2026-08-07)

**The bug, found on device.** An organisation marked a volunteer present and
filed a post-event review without tapping any star ratings. The volunteer's
V-Score fell from 70 to 67 for an event they had attended and done nothing
wrong at.

**The cause.** `computeEventOutcome` substituted `DEFAULT_MISSING_SUBSCORE = 3`
— the midpoint of the 1–5 scale — whenever a rating was missing, on the
documented reasoning that a midpoint "neither rewards nor punishes the
volunteer". The blend then ran normally:

```
outcome     = 3 × 20            = 60
new_score   = 0.7×70 + 0.3×60   = 67
```

**Why the original assumption was wrong.** It confused the midpoint of the
RATING scale with a neutral point of the SCORE. 3/5 scales to 60, and every
volunteer starts at 70, so the substituted value was always *below* a new
volunteer's score and always pulled them down. Repeated unrated reviews would
converge anyone on 60 regardless of how well they actually worked — the system
would have been measuring how diligently organisations tapped stars, not how
well volunteers performed. There is no fixed number that is neutral against a
moving baseline; neutrality here means *not moving the score at all*.

**The correction (owner-approved, two parts).**

1. `computeEventOutcome` returns `null` when a review carries no scorable
   signal — attended with no `reliability_score`, or unknown attendance — and
   `recomputeVScoreAfterReview` returns the old score unchanged. A missing
   `clinical_score` is deliberately NOT a gap: support-role volunteers are
   never clinically scored, so reliability alone is a complete review for them.
2. The review form now requires the ratings when attendance is true (both,
   when the outreach is clinical), so the unscorable path should be
   unreachable from the app. It is kept as a guard because a gap arriving any
   other way must not cost a volunteer reputation.

**Why keep the guard as well as the form validation.** The form is a UI
constraint and the math is an invariant; only one of them survives a direct API
call, a future screen, or a data import.

**Defence.** "An early version substituted the midpoint of the rating scale when
an organiser filed a review without ratings, reasoning that a midpoint is
neutral. Device testing showed it was not: the midpoint scales to 60 and
volunteers start at 70, so an unrated review quietly cost a good volunteer
three points, and enough of them would drag anyone to 60. The system was
measuring reviewer diligence rather than volunteer performance. The fix was to
recognise that no fixed value is neutral against a moving baseline — a review
with no rating now moves nothing, and the form requires the ratings so a review
that changes nothing is not filed by accident."

## A display-layer symptom masking a data-layer bug (2026-08-07)

Worth the space because the interesting part is not the bug, it is why it
survived weeks of testing.

**The symptom.** Outreach cards rendered times as `10:00:00 - 17:00:00`
instead of `10:00 AM - 5:00 PM`. It reads as a formatting slip — the kind of
thing you note and fix later.

**The actual bug.** The app WRITES `HH:MM` (the masked input in
`DateTimeField`) but READS BACK `HH:MM:SS`, because Postgres `time` columns
come through PostgREST with seconds. Every parser in
`components/ui/dateUtils.ts` was anchored to `HH:MM` exactly, so **every time
loaded from the database failed to parse**, and each helper fell back to a
default that looked plausible:

| Helper | Silent fallback | Consequence |
|---|---|---|
| `formatEventTime` | returns the raw string | the visible symptom |
| `msUntilEvent` | start treated as **midnight** | every event looked started-since-00:00 |
| `isUpcomingEvent` | false all day | confirmed events vanished from Schedule for the whole of their own day |
| `isLateCancellationWindow` | measured to midnight | the withdrawal warning could be hours off |
| `hasEventEnded` | falls back to 23:59 | events stayed "in progress" until midnight |

The Schedule bug was reported as its own separate defect ("my accepted event
isn't in Schedule") and was fixed once at the wrong level — by changing which
predicate Schedule asked — before the shared cause was found.

**What was NOT affected, and why that is the point.**
`lib/matching/layer1.ts` parses times with its own regex,
`/^(\d{1,2}):(\d{2})/` — **no `$` anchor** — so `"10:00:00"` matches and reads
`10:00` correctly. Availability scoring, `applications.match_score` and
`skill_match_cache` were all correct throughout; **nothing stored needed
recomputing**. Two parsers for one format, one of them accidentally lenient,
is what confined the damage — and it is equally what hid it, since the
component everyone scrutinises was the one that happened to be right.

**The fix.** One shared `CLOCK_TIME` regex in `dateUtils.ts` accepting optional
seconds, used by both `parseClockTime` and `formatEventTime`, with tests
pinning **both** wire formats on every affected helper. Normalising at the
parse boundary rather than at call sites: there were seven call sites and one
boundary.

**Defence.** "A cosmetic-looking time format was the visible edge of a parsing
mismatch between what the app wrote and what the database returned. Because
each helper degraded to a plausible default rather than failing, the damage
surfaced as unrelated symptoms on different screens. It is the case for
normalising at the boundary and for testing the format your database actually
returns, not the one your form produces — the matching engine escaped only
because its regex was accidentally more permissive."

## Known issues (open, not blocking)

- **The check-in reminder fires in the morning, not as the event ends.** The
  intended nudge was "scan before you leave", timed near an outreach's end
  time. Vercel's Hobby plan permits exactly **one cron job per day**, so there
  is no scheduler available to run at 4pm on the day of each event, and the
  reminder rides the existing 08:00 pass instead: volunteers are told on the
  morning of their event to scan the organiser's code.

  `sendCheckinReminders()` is nonetheless written to be correct at any hour —
  it skips anyone who already has an `attendance` row — so a late invocation
  chases exactly the volunteers who still have not scanned. Two ways to get the
  intended timing without changing the function: POST
  `{ "action": "send-checkin-reminders" }` to `/api/notifications` with the
  cron secret (manual, and what a demo would use), or move the schedule to a
  paid Vercel plan / any external scheduler that can hit the same endpoint
  hourly.

  A third option was considered and not taken: scheduling a **local**
  notification on the device with `expo-notifications` when the volunteer's
  event is confirmed. That gives exact end-of-event timing with no server at
  all, but the notification lives only on the device that scheduled it — lost
  on reinstall, on a new phone, or if the app never ran that day — so it is a
  supplement to a server reminder rather than a replacement.

  **Defence.** "The reminder's timing is constrained by the free hosting tier's
  one-cron-per-day limit, not by the design. The pass itself is idempotent and
  attendance-aware, so it produces the intended 'before you leave' behaviour
  the moment a scheduler capable of running it hourly is available — no code
  change required."

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

- **The Identity Verification row in Settings was read-only, and is not any
  more (resolved).** It was read-only because the only identity-verification
  screen was `app/(auth)/verify-identity.tsx`, a *step of the onboarding
  wizard*: it reads `useOnboardingStore` (empty outside that flow) and submits
  `useCompleteOnboarding`, so linking a settings row to it would let an
  already-onboarded volunteer overwrite their saved category, skill_tags,
  specialties and availability_slots with blanks. The standalone screen
  `app/(volunteer)/verify-identity.tsx` now exists, shares no submit path with
  the wizard, and the row opens it.

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

  **Built (2026-08-20).** The standalone screen
  `app/(volunteer)/verify-identity.tsx` does not reuse the wizard's submit
  path: it signs the declaration, uploads a credential document to Cloudinary,
  and `/api/verification-document` moves `verification_status` to
  `documents_pending` on the service-role key, leaving every other column
  untouched. The clinical gate now links THERE — see "The verification loop
  closes" below. The rule that nothing may link to `(auth)/verify-identity`
  from outside the onboarding wizard still stands and is still enforced by
  `persistAndFinish`'s refusal.

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

## Multi-day outreaches: commitment, not span (approved 2026-08-12, schema 2026-08-15, app 2026-08-18)

**Problem.** The data model assumed one event, one day: a single `date` with a
`start_time` and `end_time`. A screening campaign running for a month cannot be
represented at all. And "attended / did not attend" assumes one event, one
commitment — which a month-long campaign is not.

**The decision, and it came from the owner: a volunteer commits to SPECIFIC
DAYS when they apply, and is measured only against those days.**

- Applying to a multi-day outreach means selecting which days you can do. That
  selection **is** the commitment.
- Attendance is scored on **days committed vs days attended**, never against
  the event's full length.
- A student who commits to 4 Saturdays and attends all 4 has full reliability.
  Someone who commits to 20 days and attends 5 has not.
- Days never committed to are irrelevant: no penalty, no absence, not counted.

**Why the span model was wrong.** Scoring against the event's full length would
mark a Saturday-only student absent for 26 days they never promised — punishing
them for something that is not a failure. Nobody works thirty days straight;
shifts and off-days are the norm, not the exception. A reliability score has to
measure **kept promises**, and the span model measures hours present, which is
a different and much less meaningful thing.

**Why `application_days` is a table and not a count.** Days committed is the
unit the whole accountability system counts against, so it must be a
first-class row rather than a number someone typed. It is also what answers the
organisation's real question — "I have 3 nurses on Tuesday but only 1 on
Thursday" — which no count could.

**Single-day is the n=1 case.** Every outreach gets exactly one `outreach_days`
row, so there is no branching and no "is multi-day" flag. Same reasoning as the
multi-role mode flag: a boolean that must agree with the existence of rows will
eventually disagree with it.

**Shifts need no new concept.** The existing morning/afternoon/evening
availability slots already express within-day shifts.

**"2 nurses" means per day**, not for the event. It is what an organiser means,
and it is what makes a per-day fill count meaningful.

**Attendance resolution is per day, as the organiser goes.** Reconstructing who
was absent on day 9 of a 20-day campaign three weeks later is guesswork, and
exception-based marking assumes the organiser is present. But daily resolution
is not *required*: unresolved days simply do not count, exactly as an unrated
review moves nothing.

### V-Score: one event, one movement (approved 2026-08-12, BUILT 2026-08-31)

`event_outcome` is computed **once per event**, scaled by
`days_attended / days_committed`. A month-long campaign must not move a score
twenty times harder than a one-day clinic — that would let one event dominate a
volunteer's entire history and distort the whole system.

**Partial attendance takes the ratio; only zero attendance takes the flat −15.**
The −15 is calibrated for *told you nothing, did not turn up*. Someone who
committed to 20 days and worked 5 did show up and was counted on — worse in
absolute harm, but not the same failure, and collapsing both to −15 would
destroy the distinction between them. A 5/20 ratio already produces a severe
outcome. Attending **zero** committed days is the original no-show case and
takes the flat penalty.

### Availability becomes continuous (approved 2026-08-12, gated — not built)

The availability component was **binary**: the volunteer's slots either matched
the event's single day or they did not, scoring 1.0 or 0.

Across a date range it becomes **the fraction of the event's days the
volunteer's slots can cover, capped once they clear a usable threshold.**

Neither alternative works. "Must match every day" excludes precisely the
Saturday-only student the commitment model exists to include. "Any day" scores
a 1-of-20 match identically to a 20-of-20 one, which throws away the
information that matters most for staffing.

**This is a change to the matching engine and is therefore gated.** Logged here
so `qa-reviewer` does not read it as drift when it lands.

## `not_selected` — every applicant gets an answer (2026-08-11)

**Problem.** Applicants past the waitlist cap are deliberately left `pending`
rather than rejected. That is honest while the event is still ahead — places
genuinely free up through withdrawals and waitlist promotion. It stops being
honest the moment the outreach closes or its date passes: nothing more can
happen, and the volunteer is left in permanent limbo, never told anything.

**Decision.** A new application status, `not_selected`, applied to everyone
still `pending` or `waitlisted` when an outreach ends.

**Why not reuse `rejected`.** `rejected` means an organisation looked at this
person and declined them. Being crowded out of a full event is not that.
Labelling it so would show "Rejected" on the volunteer's own screen for
something that was never a judgement about them — and it would corrupt the data
permanently: any future acceptance-rate or selectivity measure that counted
these as rejections would misdescribe both the volunteer and the organisation.

**Where it fires: both triggers, one writer.** The organisation closing the
outreach, and a daily-cron sweep for events whose date passed while still open.
Both call the same `resolve_unsuccessful_applications()`, so an application
cannot be resolved twice and the wording and no-penalty guarantee live in one
place. `outreaches_needing_resolution()` is deliberately a read-only query that
the cron consumes, rather than a second writer.

**No V-Score effect, by construction.** `not_selected` is not an event outcome.
It never reaches `/api/vscore` and no penalty applies. Not being selected is not
a failure and the reputation system must not treat it as one.

**Wording:** "This event filled up before a place could be offered to you." It
names the cause, not the person.

**Defence.** "Applications resolve to a terminal state when the event ends, so
no volunteer is left indefinitely pending. The state is distinct from rejection
because being crowded out of a full event is not a judgement about the
applicant — conflating the two would both mislead the volunteer and corrupt any
later measure of organisational selectivity."

## The organisation's outreach management screen (2026-08-11)

**Problem.** "Show check-in code" and "Mark attendance" had been living on the
Applicant Vetting screen. That screen is for deciding who gets a place; those
are event-DAY actions. A different job at a different moment.

They were there because they had nowhere else to be: the organisation had **no
per-outreach screen at all**. The dashboard card jumped straight to the
applicant list, so any per-event action had to be wedged into whichever screen
happened to be scoped to one outreach.

**Decision.** Build the missing screen — `app/(organisation)/outreach/[id].tsx`
— as the event's home: details, roster progress and tallies, the confirmed
volunteers, a link through to Applicants, and the two event-day actions. The
dashboard card opens it; Applicant Vetting links back to it.

**The general principle.** When a recurring action has no correct home, the
answer is to build the home, not to keep relocating the action. Two buttons
moving between screens across successive rounds of feedback was the symptom of
a missing screen, not of bad placement.

**Editing deferred, deliberately** — see the note in the multi-role plan: the
Create Outreach wizard's step 2 is being rewritten as a role builder, and the
edit path must share that component or be thrown away and rebuilt within days.

## The Firebase rule, corrected — FCM is a transport, not a backend (2026-08-11)

**The rule as written was wrong**, and wrong in a way that would have cost time
repeatedly. It said: *"Never add Firebase in any form — no packages, no config,
no suggestions. If you see Firebase mentioned anywhere, flag it as an error."*

Firebase **is** in the app, deliberately and with owner approval: **Firebase
Cloud Messaging as the Android push-notification transport**. The footprint is
`google-services.json` in the repo plus the FCM service-account credential
uploaded to Expo. There is no Firebase SDK, no Firebase data, no Firebase auth,
no Firebase backend of any kind.

**Why it is not a contradiction.** Google permits no other push transport on
Android. Expo's own push service does not bypass FCM — it relays through it. So
FCM is not a competing backend that was chosen over Supabase; it is the pipe
that carries a notification the last hop to an Android handset, in the same
category as APNs on iOS. **The ban was always about Firebase-as-backend.**
Rewriting the rule to say so does not weaken it — it makes it enforceable,
because a rule that forbids something the project provably does is a rule that
gets ignored wholesale rather than obeyed precisely.

**Why it had to be corrected rather than deleted or quietly softened.** Left as
written, every `qa-reviewer` pass would flag `google-services.json` as a
violation, and the same argument would be relitigated each time — with a real
risk that some pass eventually "fixes" it by deleting the file, silently
breaking Android push. Left vague ("avoid Firebase where possible"), the
opposite failure becomes available: someone reaches for Firestore for a feature
Supabase already covers.

**The corrected rule therefore states both halves explicitly**: the permanent
ban on Firebase for data, auth, storage, hosting, functions and analytics; and
the single named exception of FCM as a push transport, with its exact
footprint, marked as correct and not to be removed.

**Defence.** "The architecture is single-backend by design: Supabase provides
the database, authentication, row-level security and storage. The only Firebase
component in the system is Cloud Messaging, used solely as the Android push
transport, because Google provides no alternative — Expo's push service itself
relays through FCM. No application data, credentials or business logic passes
through Firebase."

## Ghana district list — audit, 2026-08-11

`constants/ghana-locations.ts` was audited against the official 261-MMDA
breakdown (Wikipedia, *Districts of Ghana*, cross-checked against
ghanadistricts.com's 2025–2029 assembly breakdown). The file held **260**
entries across the correct 16 regions.

**Two genuine absences, both added:**

| Region | Added | Note |
|---|---|---|
| Greater Accra | Korle Klottey Municipal | Created 2018 out of Accra Metropolitan. Covers Osu, Adabraka, Ridge — central Accra was unselectable without it. |
| Central | Komenda Edina Eguafo Abirem Municipal | Long-established (Elmina, Komenda). A plain omission, not a new assembly. |

**One outdated entry, deliberately NOT removed:** `East Akim Municipal`
(Eastern) was abolished in June 2018 and split into Abuakwa North Municipal and
Abuakwa South Municipal — both of which the file already lists. Eastern
therefore carries 34 entries where the official count is 33, and the file totals
262 rather than 261.

**Twelve further naming discrepancies, also deliberately NOT changed:**
status-suffix differences (`Jasikan` / `Jasikan Municipal`, `Krachi West` /
`Krachi West Municipal`, `Obuasi East` / `Obuasi East Municipal`,
`Asante Akim North Municipal` / `Asante Akim North`, `Assin North Municipal` /
`Assin North`), spellings (`Mfantseman` / `Mfantsiman`, `Bunkpurugu
Nyakpanduri` / `Bunkpurugu Nyankpanduri`), a naming variant (`Wassa Amenfi
Central` / `Amenfi Central`, `Wassa Amenfi West` / `Amenfi West Municipal`), and
hyphenation (`Twifo Atti-Morkwa`, `Yunyoo-Nasuan`, `Sawla-Tuna-Kalba`,
`Nadowli-Kaleo`, `Prestea Huni-Valley`, `Tarkwa-Nsuaem`).

**Why the corrections were not simply applied.** These strings are **stored
values**. `profiles.district` and `outreaches.district` hold them verbatim, and
the matcher's location component compares them by **exact string equality** —
same district scores 1.0, anything else 0.5 or 0. Renaming or deleting a name
that a row already holds therefore does two invisible things at once: the
district picker renders that profile's district as blank (the stored value is
no longer in the list), and every affected volunteer silently loses the full 20
location points against events in their own district.

**Adding a name is safe; renaming one is a data migration.** Corrections need
an accompanying `update profiles set district = ... where district = ...` per
renamed value, run in the same transaction as the constant change. That is a
deliberate, owner-approved operation, not a tidy-up.

**Defence.** "The district vocabulary is a stored key, not display text. New
assemblies can be added freely because no row can already reference them;
renaming or removing one requires a data migration in the same transaction,
because the matching engine compares district strings by equality and a silent
rename would degrade location scores with no visible symptom."

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

### 5. Oversubscription: deciding forty applicants for twelve places

**Problem.** A popular outreach can attract far more applicants than it has
room for. Deciding each one by hand is slow enough that organisations
realistically stop reviewing and just accept whoever is at the top of the
list; and the surplus — people who did nothing wrong except apply to a popular
event — had nowhere to go but a rejection.

**Decision, in four parts.**

1. **One-tap "Accept top N"**, where N is the number of free slots. The
   ordering is the ranking score already defined in 1b (match fit × bounded
   reliability multiplier), computed by `planBatchAccept` in `lib/roster.ts`.
2. **The surplus is waitlisted, never auto-rejected.** A rejection is a
   judgement about a person and stays a deliberate act by the organisation.
3. **The waitlist is capped at 2× slots, minimum 5.** Beyond the cap
   applicants are **left pending** — again, not rejected.
4. **A skill-coverage indicator** sits directly above the button.

**Reasoning, which must be preserved.**

- **The button acts on exactly what the organiser can see.** The applicant
  list, the waitlist positions, and the batch plan are all derived from one
  projection in the screen, so "Accept top 4" can never quietly pick a
  different four from the four displayed at the top. A batch action whose
  ordering is invisible is not one anybody can meaningfully consent to — and
  the confirmation dialog states the full scope before it runs, including the
  people it will NOT touch.
- **The cap exists to keep a waitlist position honest.** An unbounded waitlist
  on a popular event hands out positions like "number 187", which is not a
  queue, it is a rejection wearing a friendlier word. Twice the slots is the
  point beyond which a position stops being a realistic prospect: an event
  would have to lose two-thirds of its confirmed roster before number 21 of 20
  came up. The floor of 5 covers small outreaches, where 2× is too thin to
  absorb even one dropout.
- **Beyond the cap, applications stay pending rather than being rejected.**
  Being past a capacity line is a fact about the event, not a verdict on the
  volunteer. The organisation can still decide each one individually.
- **Skill coverage answers what the match score structurally cannot.** A match
  score rates ONE volunteer against the event. It says nothing about whether
  ten individually excellent volunteers have collectively left the one skill
  the event actually needs uncovered — which is exactly what accepting the top
  ten by score can produce. Coverage is a property of the team (one holder
  covers a skill; it is deliberately not weighted by how many hold it), and it
  is placed next to the batch button because that is the moment it matters.
- **Waitlist position is computed, never stored.** The promotion rule in
  `/api/application-status` promotes the highest-ranked waitlisted applicant
  when a slot frees; a stored position would disagree with it the moment
  another applicant withdrew or a V-Score moved. The volunteer is told both
  the number and what happens next ("if a place frees up, the top of the queue
  is confirmed automatically"), because "waitlisted" alone reads as a soft
  rejection.
- **An already-waitlisted applicant is never re-shuffled by a later batch
  run.** Being overtaken by a newcomer with a better score would be
  indefensible to someone who has been waiting.

**Implementation notes.** The decision goes through one batch call to
`/api/application-status` (`{ outreachId, decisions: [...] }`) rather than N
separate ones: thirty-one round trips would take most of a minute, could
half-fail invisibly, and would exceed Resend's ~2-requests-per-second free
tier — so the emails now go through Resend's batch endpoint in a single
request. Accepts are applied one row at a time and in order, because
`slots_filled <= slots_total` is a check constraint: a single bulk UPDATE that
overshot would be rejected in its entirety and decide nobody, whereas row by
row the event fills to exactly capacity and the applicant who would have
overfilled it is reported back. A partial success is reported as a partial
success — showing "done" when four of ten accepts hit a full roster would
leave an organiser believing people are confirmed who are not.

The volunteer's own queue position needs a server round trip
(`/api/waitlist-position`) because RLS correctly forbids a volunteer from
reading anyone else's application, so the client cannot compute a rank. A
`SECURITY DEFINER` database function was the alternative; the endpoint was
chosen because it needs no schema change and reuses the same unit-tested
ranking function as the promotion rule, rather than a second copy in SQL free
to drift.

**Defence.** "Oversubscription is resolved by ranking, not by triage. The
organisation accepts the best-ranked applicants in one action whose full scope
is stated before it runs, the surplus is queued rather than refused, and the
queue is capped at the point where a position stops being a real prospect —
so nobody is given a number that is really a no. The skill-coverage indicator
exists because a per-volunteer match score cannot tell an organiser whether
the team it has assembled can actually do the job."

### 6. Under-subscription: the app informs, it never advises

**Problem.** The opposite failure. An outreach approaches its date still short
of volunteers, and the organisation finds out too late to do anything.

**Decision.** A staged escalation at **7, 3 and 1 days** before the event, for
any `open` outreach with `slots_filled < slots_total`:

| Stage | Who is told | Reach |
|---|---|---|
| 7 days | The organisation only | — |
| 3 days | Organisation + matching volunteers who have not applied | The outreach's own region |
| 1 day | Organisation + matching volunteers | That region **and every adjacent one** |

**The governing rule: the app INFORMS, it never ADVISES.** It reports the
shortfall, widens who hears about the event, and stops. It must never suggest
that an organisation reduce its slot count or move its date.

**Reasoning, which must be preserved.**

- **Why no advice.** How many hands a vaccination drive actually needs is an
  operational and clinical judgement with consequences for the community being
  served. Software with no knowledge of the medical plan has no business
  nudging anyone toward a smaller team. A recommendation to "reduce to 6
  slots" would also quietly corrupt the platform's own data: an organisation
  that trims its target to whatever it happened to recruit makes every event
  look fully staffed, and makes under-subscription statistically invisible —
  destroying the very measure this feature exists to surface. The no-advice
  rule is enforced by a unit test over the generated copy, not merely by
  discipline.
- **Escalation is about REACH, not about lowering the bar.** Each stage tells
  more people; the requirement never moves.
- **Why 7 / 3 / 1, unevenly spaced.** Seven days is the last point at which an
  organisation can realistically act on the information itself (call a partner
  clinic, post to its own channels), so it is told first and told alone. Three
  days is where reach widens to volunteers in the region who never saw the
  event. One day widens to neighbouring regions, because by then a volunteer
  willing to travel is worth more than a tidy catchment area. There is no
  stage on the morning itself: a notification that cannot change anyone's
  plans is noise.
- **Unverified volunteers are included for SUPPORT-role outreaches**, a
  deliberate departure from the `notifyCandidates` fan-out, which is
  verified-only. The verification gate restricts CLINICAL events only, so
  support roles are exactly what an unverified volunteer may Quick Join;
  excluding them would hide the shortfall from the very people eligible to fix
  it. Clinical outreaches stay verified-only — notifying someone who cannot
  apply is not outreach, it is spam.

**Implementation notes.** The pass rides the existing daily 08:00 cron
(Vercel Hobby permits exactly one cron per day — the same constraint that
shapes the 24-hour reminder window and the check-in reminder). Because the job
runs once daily, stages test for an EXACT day count and are hit exactly once
per outreach; if a run is missed, that outreach skips that rung rather than
firing late, since a "7 days to go" notice arriving 6 days out is worse than
none. Deduping reuses the check-in reminder's technique — each notification is
stamped `data->>'stage'` and the rows are read back — so no schema change was
needed. Candidates are scored with Layer 1 only: this is a broad scan across
several regions, and the Gemini free-tier quota is reserved for the
higher-value per-applicant path.

The shortfall is also shown in-app on the organisation's outreach card, not
only in a push, because a push fires once per stage and is easy to miss.

**Defence.** "Under-subscription escalates by widening reach — the
organisation at seven days, matching volunteers in the region at three, and
neighbouring regions at one. The app deliberately never recommends reducing
slots or rescheduling: staffing levels are a clinical judgement it is not
qualified to make, and an app that encouraged organisations to trim targets to
match turnout would make the shortfall it is measuring disappear from its own
data."

---

## Three organisation-side UI defects (2026-08-13)

Reported together after an EAS build; the causes were unrelated, which is worth
recording because two of them are the same class of mistake — a change
evaluated only on the screen it was made for.

**1. The Applicant Vetting outreach chips filled a third of the screen.**
React Native gives every `ScrollView` an internal base style, and for
`horizontal` that base is `{ flexGrow: 1, flexShrink: 1, flexDirection: 'row' }`.
Placed directly in a column-flex screen, the picker therefore grew into all the
vertical space the applicant list was not using, and the content container's
default `alignItems: 'stretch'` stretched each chip to that height. Nothing
about the chips themselves had changed. The trigger was the earlier fix that
removed the wrapping `View` so the scroll track could reach the screen edge:
the wrapper had an auto height, so there had been nothing for `flexGrow` to
grow into. Fixed by pinning the ScrollView to its content height
(`flexGrow: 0`) rather than by reinstating the wrapper, which would bring the
clipping back.

**2. The organisation's event cards had no visual treatment.** Not a
regression — no redesign ever touched them. `components/organisation/OutreachCard.tsx`
has two commits in its whole history: the Phase 2 commit that created it and
the under-subscription banner. It was written before the volunteer feed card's
flyer-band treatment existed and was never brought along, so it stayed a flat
`colors.surface` block. It is now built from the same parts as
`components/volunteer/OutreachFeedCard.tsx` — a `FlyerBackground` band carrying
the status and title in white, over a bordered white body.

**3. Flyers appeared nowhere.** Two causes stacked. On the organisation side
the card never rendered one: the flyer commit covered the volunteer feed card,
the volunteer detail hero and the wizard preview, and the organisation card was
not in scope (the organisation's own event-detail hero got one later, with the
management screen). Everywhere else the rendering is correct but conditional —
`FlyerBackground` falls back to the solid navy band when `flyer_url` is null,
and every outreach created before flyers existed has a null. The fallback is
indistinguishable from the pre-flyer design, so "no flyer uploaded" and "the
feature is broken" look identical on a device. The data path itself is sound:
`flyer_url` is in both grant lists, the insert sends it, and every read uses
`select('*')`.

**Splash screens.** The app showed two branded loading screens back to back:
the root layout's wordmark splash while fonts and the session resolved, then a
second, differently composed logo screen on `welcome` while the carousel
images prefetched. Both are now one component, `components/ui/SplashView.tsx`,
with the logo mark restored above the wordmark, so the splash simply stays up
until the carousel is ready instead of appearing to restart.

---

## Organisation navigation hierarchy and roster ownership (2026-08-13)

**The loop.** Dashboard card → Manage event → Applicants → "Manage this event"
→ Manage event. Each screen advertised the other as a destination, so neither
read as the parent and an organiser could bounce indefinitely.

The management screen is the parent of an event; its applicants are a child of
it. The "Manage this event" row is gone and an up arrow sits in Applicant
Vetting's header instead. The distinction is not cosmetic: a content row
labelled with a destination reads as going *deeper*, an arrow in the header
reads as going *up*, and only one of those establishes a hierarchy.

**Why the up arrow is conditional, and why history could not decide it.**
Applicant Vetting has two entry points: the management screen, and the
APPLICANTS tab in the bottom bar. On the tab it is a root — an up arrow there
would point at a screen the organiser has never opened. But the answer cannot
be read from navigation history, because every organisation route lives in one
`Tabs` navigator (`outreach/[id]`, `checkin/[id]` and `attendance/[id]` are
`href: null` tab screens, not stack screens). A tab jump is not a stack push,
which is why the management screen's own back control is a
`router.replace('/dashboard')` rather than a `router.back()`.

Two exact signals decide it instead: the `outreachId` param, which only the
management screen sends, and the navigator's `tabPress` event, which only fires
when the bar is actually tapped. They are mutually exclusive.

**The arrow targets the SELECTED outreach, not the one arrived from.** "Up" is
a claim about hierarchy, not about history — the parent of these applicants is
this event. Retargeting keeps it truthful when the organiser switches events
with the chips, and stops the control vanishing and reappearing as they do.

**Roster ownership.** The roster appeared on both screens and would have
drifted. The split follows what each screen is *for*:

- **Manage event owns the summary** — the fill bar, "X of Y filled", the
  confirmed volunteers' avatars, and the under-subscription line. Facts about
  the event, no controls.
- **Applicant Vetting owns the decision surface** — per-role slot progress,
  pending and waitlisted counts, skill coverage, and the batch accept button.
  Every one of those is either an input to a decision or the decision itself,
  and this is where the organiser acts.

The Pending/Accepted/Waitlisted tally was therefore removed from Manage event.
Beyond the duplication, in multi-role mode it was a single blended total across
every role, which is actively misleading: "4 pending" reads as progress when it
is four nurses and no doctors, and the overview cannot break that down without
becoming the applicant screen. The one figure that *is* actionable from an
overview — how many are waiting for a decision — remains on the Applicants row,
i.e. on the link that resolves it.

The two screens now also read different sources and so cannot disagree: Manage
event renders the trigger-maintained `slots_filled`/`slots_total` columns,
while Applicant Vetting derives its per-role figures from the applications. In
multi-role mode the event total is the sum of the roles by the same trigger, so
they agree by construction rather than by two code paths staying in step.

**Outreach editing is now blocking a shipped feature.** Flyers can only be set
at creation time, so the events that predate the feature can never have one —
they will show the navy fallback band permanently. This is the second thing
editing gates (the first being ordinary corrections to a posted event), and it
strengthens the case for building it before more features accumulate behind it.

## Outreach editing (built 2026-08-15)

The gap this closes is recorded directly above: an organisation could only
close an outreach it had mistyped, and because a flyer could only be attached
at creation, every event posted before flyers shipped was stuck on the navy
fallback band permanently.

**One scroll, not a wizard.** Create Outreach is four steps because the
organisation is composing something out of nothing and the steps pace that.
Editing has the opposite shape: they arrive already knowing the single thing
they want to change, so four steps to reach it would be worse than the
X-to-close they had before. The edit screen is one scroll with three labelled
sections, each independently editable.

**A past date is only an error if it was changed.** `validateWizard` refuses a
date behind today, which is right for creation — an event in the past is
meaningless. Applied unchanged to editing it would have made the screen useless
for exactly the events that need it most: the pre-flyer outreaches, whose own
dates have passed. `validateOutreachEdit` therefore drops the past-date error
when the date is untouched, and keeps it when the organisation actually tries
to reschedule into the past. Rescheduling backwards is the rule that matters;
"your event has already happened" is not an error, it is a fact about the row.

**Places can rise but never fall below the accepted.** `slots_filled <=
slots_total` is a check constraint, so cutting places below the volunteers
already accepted is refused by the database with a constraint violation that
explains nothing. The form catches it first, per role in multi-role mode, in a
sentence naming the role — and removing a role that still has accepted people
in it is refused outright rather than silently orphaning them.

**Roles are only rewritten when they actually differ.**
`useReplaceOutreachRoles` is a delete-then-insert, which sets
`applications.outreach_role_id` to NULL for anyone whose role disappeared. That
is acceptable on a draft and destructive on a live event, and it would have
fired on *every* save — including saves that only fixed a typo in the title.
`rolesChanged` compares the two lists order-insensitively (the list is re-sorted
on read, so a reorder is not a change) and the rewrite is skipped when they
match. When they genuinely differ and people have already applied, a
confirmation dialog states what will happen to those applications before
anything is written.

**The mode toggle restores rather than reseeds.** Toggling to "Specific roles"
in the create wizard seeds a default nurse role, which is a sensible starting
point for a blank form. In the editor it restores the roles already stored, so
toggling away and back does not overwrite a real staffing plan with a stranger's
default.

## The staffing modes collapse into one list (2026-08-15)

An outreach's staffing was described two ways: "Any volunteers", which wrote
`required_category` / `role_type` / `slots_total` on the outreach itself, and
"Specific roles", which wrote `outreach_roles` rows and let triggers derive the
outreach's own columns. The organisation chose between them with a toggle.

**That toggle was a storage detail wearing a user interface.** The database
distinguishes the two shapes by the presence of child rows, which is the right
way for the database to do it; surfacing it as a choice made the organisation
learn a distinction that exists for the schema's benefit, not theirs. Needing
one kind of volunteer is not a different mode from needing three. It is the
one-role case.

The form now holds one list. Adding a profession is a button, not a mode. The
two storage shapes are unchanged and the mapping between them lives in exactly
one function, `toStoragePayload`: a single role with no experience floor writes
the outreach's own columns and no child rows; anything else — two roles, or one
role carrying a floor, which single-role storage cannot express — writes
`outreach_roles`.

**Storage was deliberately NOT collapsed.** Doing so needs every existing
outreach backfilled into a role row, and that hands `slots_total` to the
triggers for events that never opted in and switches scoring from
`computeLayer1MatchScore` to the max-across-roles path for every row on the
platform. It would move live scores to tidy up an internal seam. Nothing was
backfilled and no score moved.

**"Any profession" survived the collapse.** `required_category = null` has
always been expressible and had to remain so, which is why a `RoleDraft` may
carry a null category even though `outreach_roles.category` is NOT NULL. A
category-less role is only representable as the single role of an outreach, so
the form offers "Any profession" on the first role and withdraws it the moment
a second exists — the point at which the database genuinely cannot store it.

## role_type could be null, and null failed open (2026-08-15)

Editing an outreach into multi-role mode wrote `role_type = NULL` on purpose,
because the trigger derives it from the roles. When the role write failed on the
enum-cast bug, the trigger never ran and the NULL stayed.

Every reader compares `role_type = 'clinical'`, and NULL is not equal to
anything, so an outreach with no role type was treated as a SUPPORT event by
both the app and `application_role_is_clinical()`. **An unverified volunteer
could submit a full application to it.** The ambiguous state failed open, which
is the wrong direction for a gate. It was also invisible to a feed filtered by
either role type, since it matched neither.

Three changes rather than a repaired row. The gate now treats an unresolvable
role type as clinical, so a null arriving by any future route fails CLOSED. The
column is NOT NULL, with no default — a default of 'support' would recreate the
fail-open state and a default of 'clinical' would hide the omission behind a
value nobody chose, so a write that forgets the column now fails loudly. And the
client stopped writing null at all: it sends the summary it can compute from the
roles it is about to write, and the trigger re-derives the authoritative value
immediately afterwards. Same answer, no window in which it is missing.

The one existing null was repaired to 'clinical' rather than 'support' for the
same reason the gate now does: guessing 'support' would silently open a
possibly-clinical event, while guessing 'clinical' costs one visible correction.

## The edit is atomic now (2026-08-15)

`save_outreach()` is a plpgsql function, and a function body is a transaction.
The details update, the role delete and the role insert either all commit or all
roll back. Ordering the client's writes so the fragile one went first had
narrowed the window but could not close it, and the role rewrite is itself a
delete followed by an insert — a failure between those lost the roles outright,
which is how an outreach being edited when the enum bug struck ended up with no
roles at all.

It is SECURITY INVOKER, not DEFINER. It runs with the caller's privileges, so
RLS and every column-level GRANT apply exactly as they do to a direct PostgREST
call. A definer function would have handed any authenticated user the ability to
rewrite another organisation's event. The parameters are explicit and typed
rather than a jsonb patch, so the column list is fixed and cannot be widened by
a crafted payload into the columns the GRANTs withhold.

## An outreach with a history cannot be deleted (2026-08-15)

`outreaches_delete_own` let an organisation delete any of its own outreaches,
and applications, attendance and reviews all cascade from it. A delete therefore
destroyed volunteers' application history and the event records their V-Score is
derived from — records that are not the organisation's to erase. A BEFORE DELETE
trigger now refuses when any of the three exist. Enforced in the database rather
than the screen, because RLS already permits the delete and a client is not the
right place to hold that line.

## Event lifecycle: completed, cancelled, deleted (2026-08-17)

Until now an outreach could only be published or closed. Three acts were
missing, and each turned out to be a different kind of thing.

**Completed is archival, not a gate.** It means "I have wrapped this up", and it
deliberately closes nothing: attendance and reviews stay open afterwards.
Reviews are what move V-Scores and are filed days after the event, so tying them
to a button an organiser presses when they are being tidy would punish exactly
the organisers who keep their records straight. If a cutoff is ever wanted it
should be time-based, because a rule that applies evenly cannot be triggered by
mistake. It is offered only once the event has actually ended — a precondition
no constraint can express, which is why the transition goes through the server.

**Cancelled is a fifth status, not a reuse of closed.** `closed` means "no longer
recruiting" and leaves the event happening; an event that is not happening is a
different fact. Reusing `closed` would have left a cancelled event sitting on
volunteers' schedules looking live, which is the one thing a cancellation must
not do.

It is terminal. `trg_outreaches_no_uncancel` refuses any move out of it, so the
volunteers who were told it was off are never silently re-enrolled days later.
The only way back is a new outreach, which is honest about what happened.

**Cancelling deliberately does not touch the applications.** The obvious
implementation — mark every accepted application `cancelled` — is wrong twice
over, because `cancelled` on an APPLICATION means the volunteer withdrew. It is
what the withdrawal flow writes, it stamps `cancelled_at` and
`late_cancellation` through `trg_applications_stamp_cancellation`, and
`late_cancellation` is what the V-Score penalty reads. Cancelling an event would
therefore have written a withdrawal into the record of every volunteer who did
nothing wrong, and on short notice would have stamped them as LATE withdrawals
and docked their V-Score for their organiser's decision. The applications are
left alone and every screen reads the OUTREACH's status instead, so the record
keeps saying, truthfully, that the volunteer was accepted onto an event that was
then cancelled. A migration-time assertion fails if a cascade is ever added.

Because the applications are untouched, the cancelled event stays on the
volunteer's schedule — struck through, badged CANCELLED, with a line saying they
need not attend. Dropping the card would have been worse than leaving it: a
volunteer who never opens the notification would turn up to a clinic that is not
happening.

**Deleting is only for an event nobody has touched.** Once an application,
attendance record or review exists, the outreach is part of somebody else's
record and is not the organisation's to erase — and a V-Score has to stay
explainable from the events that produced it. `trg_outreaches_refuse_used_delete`
enforces this in the database, because `outreaches_delete_own` already permits
the delete and a screen is not where that line should be held. The UI offers
Cancel instead and says why.

**Why two of the four transitions go through the server.** Publishing and
closing stay on the client's own RLS-governed write: one column, one owned row,
nothing follows. Cancelling has to notify every live applicant, which means
reading other users' push tokens and writing rows they own — something no
organisation's JWT can do under RLS, and which must not half-happen. Completing
has the "has it finished" precondition. So `/api/outreach-status` owns those two
and only those two.

**A Postgres constraint shaped the migration.** `ALTER TYPE ... ADD VALUE` cannot
have its new value USED in the same transaction that added it, and the Supabase
editor wraps a paste in one transaction. So the enum addition is its own file
(`20260815a`) and everything that compares against 'cancelled' is in the next
one (`20260815b`). The split is a requirement, not tidiness.

## Event gallery (2026-08-17)

Several images per outreach — the poster, photographs, promotional material —
held in `outreach_images`, **alongside and entirely separate from the flyer**.
`outreaches.flyer_url` is untouched and keeps doing what it does: the one banner
that heads the feed card, the detail hero and the wizard preview. Nothing in the
gallery reads, writes, replaces or falls back to it, and an outreach may have
either, both or neither. Merging the two would have been the tempting
simplification and the wrong one: a banner and an album answer different
questions, and a card can only have one image at its head.

**The cap is a trigger, not a form.** Eight per outreach, enforced by
`trg_outreach_images_cap`. The form stops there too, but the form is not the
guarantee — RLS decides which rows a client may touch and column GRANTs decide
which columns, and neither of them can count existing rows. Eight is a
judgement: enough for a poster and a handful of photographs, small enough that a
volunteer on Ghanaian mobile data scrolling a feed is not paying for an album.

**`position` is not unique, deliberately.** A unique constraint makes every
reorder a dance with temporary values, because swapping two rows needs a third
slot to pass through. Ordering is `position, created_at`, so the order stays
total even when two rows share a position.

**Gallery writes do not go through `save_outreach()`, and that is the whole
distinction from the roles.** The roles need one transaction because the
outreach's own `role_type` and `slots_total` are DERIVED from them: a half-write
leaves an event describing one thing and staffed as another. Nothing on
`outreaches` is derived from the gallery. A failed image write leaves an
outreach with fewer images — visible on the screen, fixed by pressing add again
— which is a retryable state, not an inconsistent one. Adding a photograph is
also a discrete act rather than an edit to a field: an organisation who picks an
image expects it to be there, not to be pending until they find a Save button
belonging to a different section. The editor therefore writes immediately and
says so on the control; the wizard holds URLs in form state because the outreach
row does not exist yet, and inserts them after it does, exactly as the roles do.

**The organisation profile gallery is automatic, not curated.** Curating needs
another screen to build and another thing organisations will not maintain, so
the section would sit empty for everyone who never found it. Drawing on images
they have already uploaded means it fills itself as they run events. It shows
PAST events only, so a profile displays work that happened rather than
re-advertising the drives already in the feed. `organisation_profiles.show_gallery`
is the opt-out and defaults TRUE, because an organisation that uploaded images
to its events has already said it wants them seen; an opt-IN would have left the
section permanently empty for everyone who never found the switch. The flag had
to be added to `public_organisation_profiles` as well — that view is what every
volunteer-facing screen reads, and without it the profile could never tell
whether an organisation had opted out.

**Nothing renders when there is nothing to render.** No placeholder, no empty
frame, no "no photos yet". Most outreaches will never have a gallery, and a
permanent empty shell on every one of them would make the app look broken rather
than look empty.

## The per-role gate was never wired into the database (2026-08-17)

The multi-role migration created `application_role_is_clinical()`, documented it
as "the verification gate, per role", granted EXECUTE on it — and then called it
from nothing. Both application policies still read the outreach's summarised
column:

    o.role_type is distinct from 'clinical'

and `outreaches.role_type` is 'clinical' if ANY role on the event is. So an
unverified volunteer who chose the SUPPORT role of a mixed event was refused by
RLS, with the app's own gate having correctly let them through. The two halves
implemented different rules and only the database's counted.

That is precisely the failure multi-role exists to remove — a drive needing 3
nurses and 6 helpers could not accept unverified helpers — and it had been
shipped, documented and reported as working. **A helper that is granted but
never called fails silently: nothing errors, and the tests that would have
caught it are the ones nobody writes for a policy.** The migration now asserts
that both policies mention the function, so a future rewrite that drops it fails
loudly at migration time instead.

## A refusal must name one reason, and only a reason it checked

The insert message asserted both of the policy's conditions at once — "clinical
outreaches need a verified profile, and closed outreaches no longer accept
applications" — so a volunteer applying to an OPEN event five days away was told
it was closed. Naming two possible causes is not a compromise between them; it
is a message that is half wrong whichever one applied. A row-level-security
refusal carries only 42501 and never says which clause failed, so the screen now
passes down the state it already knows and the message resolves to a single
accurate sentence, falling back to "please reload and try again" when nothing on
the client explains it.

## Tab screens stay mounted, and state derived from params must be keyed

Every screen in the `(organisation)` group is a tab screen — that is what
`href: null` registers — and tab screens stay mounted after their first visit.
Opening a second event changes the route params but does not remount the
component.

The editor hydrated its form behind a `state !== null` guard, which is true
forever after the first event. So the form was populated once and then showed
THAT event's title, description, dates and roles on every later one, and saving
from there would have written one event's content onto another. The success
banner had the same shape: a bare boolean plus a `saved=1` param, both of which
outlived the save and reappeared on unrelated events.

Both are fixed by keying on the outreach id rather than on "has this happened
yet" — the editor records which outreach it hydrated from and re-hydrates when
that changes, and the banner carries the outreach id so it can only ever appear
on the event whose save produced it. Applicant Vetting had already documented
this hazard; the lesson is that it applies to every screen in the group, not
just the one where it was first noticed.

## Gallery images are not cropped

They were being run through the picker's 4:3 crop and rendered in landscape
tiles — the banner's proportions. A real event flyer is a portrait poster whose
entire purpose is the text printed on it, and a landscape crop removes the top
and bottom of exactly the part that carries the information. `allowsEditing` is
therefore off for gallery images and they are stored at whatever shape they
already are; the tiles are portrait and the full-screen viewer takes most of the
screen. The avatar and the flyer keep their crops for good reasons — an avatar
must be square to sit in a circle, and the flyer is a fixed-height band behind
text where an uncropped portrait would be scaled to fill and lose more than a
deliberate crop does.

Turning cropping off is also what makes multi-selection possible: both platforms
offer it only when `allowsEditing` is false.

## The organisation logo, and where a logo actually lives (2026-08-17)

An organisation's logo is `profiles.avatar_url` — the same column a volunteer's
photo uses. That is not a shortcut: an organisation account IS a profile row
with `role = 'organisation'`, and the public organisation view already published
that column, so every screen that showed a logo had been reading the right place
all along. Only the picker was missing, replaced by a "coming soon" dialog.

**A separate `organisation_profiles.logo_url` was considered and rejected.** It
would have needed a migration, a change to the public view, two more grant-list
entries, and — worse — every render site would then have had to decide which of
two columns to prefer. Two columns holding the same fact eventually disagree.

**The interesting part was getting the logo onto list screens.** An outreach
embeds `organisation_profiles`, and the logo is not there. The obvious fix,
embedding the organisation's `profiles` row alongside, does not work: `profiles`
is row-scoped by row-level security and comes back null for any organisation the
volunteer has never applied to — a note already in `useOutreaches` warning
against exactly that. So `useOrganisationLogos` looks the ids up together in
`public_organisation_profiles`, the view that exists to expose an organisation's
public face to every authenticated user. One query per screen rather than one
per card: the feed renders up to fifty outreaches, and a per-card query would
turn one screen into fifty round trips. The same shape as
`useOutreachRolesForMany`, for the same reason.

Removing a photo leaves the Cloudinary asset behind, deliberately. Destroying it
needs the API secret and a server round-trip, and an orphan on the free tier is
cheap — whereas a remote delete that then fails to clear the row leaves the app
pointing at an image that no longer exists. The gallery makes the same trade.

The volunteer screen gained the same Remove control at the same time. The two
screens are the same control over the same column, and only one of them having a
way to undo is a difference nobody could have explained later.

## A Map cannot survive a persisted cache (2026-08-19)

Five React Query hooks returned their data as a JavaScript `Map`, which is a
lookup structure with a `.get()` method. The app persists its query cache to
device storage through `PersistQueryClientProvider`, and that persistence works
by serialising the cache as JSON. `JSON.stringify(new Map())` produces `{}`: a
Map's contents are silently dropped, and what comes back on restore is a plain
empty object with no `.get` method at all.

The consequence was a crash, `TypeError: undefined is not a function`, the first
time a restored cache met a `.get()` call. It surfaced on the feed because the
organisation-logo lookup was the newest of the five and sits on the most-visited
screen, but the same latent fault was in the outreach roles lookup, the
attendance lookup, the reviews lookup and the waitlist positions lookup. Two of
those had been shipped for weeks.

All five now return a plain object keyed by id, which is exactly what JSON round
trips without loss. The rule this leaves behind: **anything that becomes React
Query data in this app must be JSON-safe.** Map, Set and Date all fail that test.

## The skills vocabulary, rewritten against Ghanaian practice (2026-08-19)

The original list read as a generic clinical vocabulary rather than a
description of what medical outreaches in Ghana actually run. Three whole
outreach types were unrepresentable.

**Eye and vision.** Uncorrected refractive error and cataract are the leading
causes of severe visual impairment in Ghana, and around 95% of people who need
glasses do not have them, which is why eye camps are among the most heavily run
outreach types in the country. The old list contained one relevant entry,
"Visual acuity screening", and nothing about refraction, dispensing spectacles,
cataract or pterygium, which is what those camps are built around.

**Screening and early detection.** Clinical breast examination and cervical
screening by visual inspection with acetic acid are the two techniques Ghana's
breast and cervical programmes are actually built on, performed by trained
nurses and midwives on outreach. Hepatitis B, HIV counselling and testing,
malaria rapid diagnostic testing and PSA all appear in the Ministry of Health's
own description of its Community Health Screening Outreach Project.

**Blood donation.** The National Blood Service runs mobile sessions with
schools, churches, workplaces and market groups, and treats donor counselling
before, during and after donation as part of its duty of care. That is real work
a volunteer is asked to do, and none of it could be described before.

Five entries were retired: Catheterisation, Patient positioning, Compounding,
Pharmacovigilance and ACLS. All five are hospital or pharmacy-department
procedures rather than field-outreach work.

**Retiring is not deleting, and the difference matters.**
`volunteer_profiles.skill_tags` stores plain strings, so removing an entry from
this file does not remove it from anyone's saved profile. It stops being
offered, and it stops being renderable in the picker. A picker that cannot draw
a skill somebody holds would silently discard it the next time they toggled
anything else, so retired skills are kept in `RETIRED_SKILLS` and appended to
the volunteer's own picker under "No longer offered". They can keep it or clear
it deliberately, which is the only honest way to remove something people already
have.

Sources: Ministry of Health, Community Health Screening Outreach Project;
Ghana Eye Project 2026; Cure Blindness Project Ghana; Orbis Ghana; "A
community-focused cervical and breast cancer screening program using a
sustainable funding model in a training center in Ghana", BMC Health Services
Research 2025; National Blood Service Ghana donor services and blood-drive
booking.

## The skills picker becomes nine cards (2026-08-19)

Seventy-five skills as one flat list was a wall. The first thing anyone saw was
every skill at once, under section headings small and grey enough that they did
not break it up, and the owner's report was simply that looking at the list was
tiring. That is a layout problem, not a content problem: the vocabulary is the
right size, it was just presented as one undifferentiated scroll.

It is now nine collapsible category cards, each with an icon and a count. The
first thing you see is nine choices rather than seventy-five, and an icon is
recognised faster than a heading is read.

Two alternatives were weighed. Keeping the flat list but making the headings
large and sticky is less work, but it does not fix the actual complaint: the
scroll is still seventy-five rows long. Giving each category its own screen
removes the wall but adds a navigation step per category and hides how much has
been picked overall, which matters when someone is filling in a profile they
want to look complete.

Four behaviours the cards need to be usable rather than merely tidy:

- **Search ignores the cards.** Collapsing is the wrong answer to "show me where
  this is", so any category holding a match opens itself while a search runs.
- **Each card carries its own count**, so nobody opens all nine to find out what
  they already chose.
- **Several open at once.** People pick across categories rather than finishing
  one before starting another, and a strict one-at-a-time accordion makes them
  keep reopening.
- **Categories with existing selections open on arrival**, so an edit begins
  with the user's own choices in view.

The list lives in one shared component used by both the picker modal and the
onboarding step. Those two had separate copies of the same flat list before,
which is how two screens that should look identical stop looking identical.

---

## Building the multi-day app on top of the multi-day schema (2026-08-18)

The tables for multi-day outreaches went into the database on 2026-08-15 and
nothing in the app had used them since. That gap turned out to be more than an
unfinished feature: it had quietly broken a feature that was already working.

### The breakage, and why it was invisible

The 2026-08-12 migration changed `attendance` so that a row belongs to one DAY
of an outreach rather than to the whole thing — `outreach_day_id` became NOT
NULL and the uniqueness rule became (outreach, volunteer, day). The check-in
endpoint was never updated to match. It still wrote a row with no day and still
declared the old two-column conflict target, so every scan and every organiser
attendance decision would have failed twice over: once on the NOT NULL column,
and once because the `ON CONFLICT` clause named a constraint that no longer
existed.

Nothing surfaced it because nobody had scanned since the migration ran. This is
worth recording as a project lesson rather than an incident: a schema change and
the code that writes to it were shipped a week apart, and there was no test
between them that would have noticed.

Two related gaps came from the same source. Every outreach created after
2026-08-15 had no day row at all, because the migration's backfill was
one-shot — so even a fixed check-in would have had nothing to point at. And
every application made since had no committed days, which is the denominator the
entire accountability model divides by.

### The invariants are now structural rather than remembered

Both gaps are closed in the database rather than in client code, because a rule
that lives in a screen is a rule that the next screen forgets.

- A trigger writes the first `outreach_days` row in the same transaction as the
  outreach itself. There is no code path that can produce a dayless outreach.
- The application and its committed days are written by one plpgsql function,
  and a function body is a transaction. This is the same argument that produced
  `save_outreach()` for the details-and-roles problem. It matters more here:
  a half-written application promises nothing, reads afterwards as "attended 0
  of 0 days", and cannot be repaired from the volunteer's side, because the row
  exists and re-applying is refused.

### The three decisions that were not obvious

**A day volunteers committed to cannot be deleted.** `application_days` cascades
from `outreach_days`, so removing a day would silently erase every promise made
against it — and those rows are what a V-Score is later derived from. The
alternative considered was a warning in the editor, which was rejected for the
same reason RLS is not enforced in the UI: a stale screen gets round it. The
refusal is not a trap, because an organisation whose day 3 was rained off does
not need to delete it. An unresolved day simply does not count, so leaving it
costs nobody anything.

**Rescheduling is not a change to the day set.** Moving a one-day outreach to a
different date has always been allowed, including for events people have applied
to. Expressed as a diff it is "remove day A, add day B", which would hit the
refusal above and lock every organisation out of changing their own date. So one
day becoming one different day is an in-place update, keeping the row and its
commitments; anything else is a genuine set change and is governed by the
refusal. The two cases genuinely are different things and the code says so.

**A scan is refused on a day the event does not run.** This is a new bound and
it follows from attendance being per day: there is no day to file the scan
against. Every alternative required inventing one — the first day, the nearest
day — which would put a record on a date the volunteer demonstrably was not
there. It also matches the venue anchor, which was already only honoured on the
event's own day.

### Four places that read the FIRST day and needed the LAST

`outreaches.date` is the first day and is kept in step by trigger, which is what
lets the feed bound, the reminder window and the lifecycle close carry on
unchanged. But four things were asking it a question it cannot answer.

- **The volunteer's Schedule** decided an event was over using the first day, so
  a four-day campaign would have moved to Past on the evening of day one —
  taking the check-in action with it while the volunteer was still standing in
  the event. This is the same failure that was already fixed once, one level up,
  when `isUpcomingEvent` was replaced by `hasEventEnded`.
- **The venue anchor check** compared against the first day, so an organiser
  correctly anchoring the venue on day three would have had every genuine
  on-site scan read as unverified.
- **Check-in reminders** queried outreaches whose first day is today, so days
  two onwards got no reminder at all. They now run off `outreach_days`.
- **The reminder dedupe** was one flag per outreach, so day one's reminder
  silenced every later day. The day id now joins the dedupe key.

The reminders gained a fourth fix at the same time: they now go only to
volunteers who committed to that day. Chasing a Saturday-only student to go and
scan on the other 22 days of a campaign would read as the app not having
listened to what they offered.

### What the two sides see

The organisation gets one list of days in the create wizard and the editor, with
no multi-day switch anywhere — the same argument as the role builder. An
outreach that runs on one day is not a different kind of event from one that runs
on four; it is the one-day case of the same list. There are two ways to add a
day because the two real shapes need different gestures: a clinic running
Thursday to Saturday is three taps of "add the next day", while four Saturdays
across a month need the calendar each time. Generating every day between a start
and an end was rejected — it is wrong for the scattered case, which is the more
common of the two here.

The volunteer sees a day span wherever a date used to appear, and it deliberately
reads differently for a run of days than for a scatter. "Mon Oct 12 – Wed Oct 14
· 3 days" is a range; four Saturdays are shown as "4 days · Sat Oct 3 – Sat Oct
24", leading with the count, because a volunteer who read that as a range would
think they were being asked for 22 days.

Before applying they tick the days they can make, with everything ticked to begin
with — most people applying to a three-day clinic mean all three, so un-ticking
is the deliberate act. The picker does not appear at all for a one-day outreach,
which is every outreach until an organisation makes a longer one.

The attendance screen resolves one day at a time and shows the day strip only
when there is more than one. Its roster is the people who committed to THAT day,
not every accepted volunteer — a student who offered four Saturdays must never
appear on the other days as somebody to mark absent.

### One correction to an existing rule

The post-event review seeds its "no-show" position from the attendance screen so
the two cannot disagree. Across several days, "were they marked absent" has no
single answer, so the seed is now "absent throughout": resolved absent on at
least one day, and never present on any day they committed to. Someone who came
on three days of four is not a no-show, and opening their review at -15 would put
the wrong starting position in front of the organisation.

### Still gated

Continuous availability is not built. The scaling of `event_outcome` by days
attended over days committed WAS built on 2026-08-31 — see "Partial attendance
finally reaches the score" at the end of this file.

## A day span wherever a date is shown (2026-08-20)

When multi-day outreaches were built, every screen that DECIDES something was
moved onto the correct day — is the event over, which day is this scan, which
day is this absence against. Five surfaces that only DISPLAY a date were left
printing `outreaches.date`, which is the first day: the organisation dashboard
card, the volunteer's Applications tracker, the organisation's public profile
(both its active and its past events), the volunteer's own feedback list, and
the Schedule.

They under-reported rather than misbehaved — a four-day campaign looked exactly
like the one-day clinic beneath it — but on the Applications tracker and the
Schedule that is a real problem rather than a cosmetic one, because those two
screens exist to tell a volunteer what they have promised.

All five now read the day rows. Each list fetches them with ONE batched `.in()`
query (`useOutreachDaysForMany`) rather than one query per card, and every
surface falls back to `outreaches.date` when the map has no entry — correct for
the one-day event most of them are, and what shows in the moment before the
query lands.

Two of them additionally show the volunteer's own COMMITMENT, not just the
event's span, through a new batched hook `useApplicationDaysForMany`. The span
alone would overstate what was promised: a student who signed up for the two
Saturdays of a three-week campaign should not read "Oct 3 – Oct 24" on their own
diary. They see "you are on 2 of 4 days" beside it.

**The date group headers on the Schedule deliberately still show a single
date.** They group the diary by the day an event STARTS, and one header can
cover several events; turning it into a span would attach one event's length to
a heading that is not about that event. The span moved onto the event card
instead, where it belongs to exactly one event.

**Withdrawal is still judged on the FIRST day, deliberately.** The Applications
card gates its withdraw button on `isUpcomingEvent(outreach.date, …)`, which is
the rule "you cannot withdraw once the event has begun" — a question about the
start, not the end. Withdrawal is also all-or-nothing: there is no per-day
withdrawal, so allowing it mid-campaign would cancel days already attended and
recorded. **Known limitation, not built:** a volunteer on a scattered campaign
therefore cannot withdraw from the remaining days once the first one has begun.
Per-day withdrawal would need a new concept in `application_days` and is not in
the schema.

## The verification loop closes (2026-08-20)

Identity verification had every piece except the connections between them. The
standalone screen existed, the Cloudinary upload worked, and
`/api/verification-document` moved `verification_status` to
`documents_pending` on the service-role key. But the two places a volunteer
actually meets verification still described the world as it was before any of
that was built.

**The clinical gate was a dead end.** An unverified volunteer opening a clinical
outreach was told they needed verification, offered "How do I get verified?",
and shown a dialog saying verification "isn't open yet". The app turned them
away and then told them there was nothing they could do. That link now opens
`app/(volunteer)/verify-identity.tsx` — never `(auth)/verify-identity`, for the
profile-wiping reason logged above. A volunteer whose document is already in
review reads that instead of being invited to start something they have
finished, and the link takes them to where their document lives.

**Onboarding advertised a COMING SOON box.** Step 5 of the wizard showed a dead
placeholder where the credential upload would one day be. The upload cannot
happen on that screen — `/api/verification-document` refuses a document until
`declaration_signed` is true, and the declaration is only written when that
screen submits, so the order has to be sign-then-upload. The placeholder now
says exactly that, and the completion screen after it offers the upload to the
volunteer who signed, linking to the standalone screen. Someone who chose
"Complete Later" is not offered it and is not nagged.

**What is still not built, and is the admin side:** nothing in the app can move
a volunteer to `verified`. That is deliberate — the whole point of keeping
`verification_status` out of the client's column GRANTs is that a volunteer
cannot grant it to themselves — but it means the queue currently ends at
`documents_pending` with no reviewer surface. Until the deferred admin side is
built, approving a volunteer is a manual UPDATE run on the service-role
connection in the Supabase SQL editor. There is also no notification when the
status changes; the volunteer finds out by opening the screen.

## Verified in production: the under-subscription ladder (2026-08-20)

The owner received the push *"Your outreach still has places… Nima Eye Screening
is in 3 days"* on her **existing** build, with no rebuild and no redeploy. That
single notification is end-to-end evidence for four things that had until then
only been proven by unit tests:

1. **The daily Vercel cron fires at 08:00** and reaches the escalation job.
2. **The staged ladder works and picked the right stage.** Three days out is the
   middle rung of the 7 / 3 / 1 schedule, and the message named the interval
   correctly rather than firing every stage at once.
3. **The under-subscription test itself is right** — the outreach was `open` with
   `slots_filled < slots_total`, and an event that was full would not have fired.
4. **Push delivery works in production**, through Expo's service and FCM, to a
   real device, from the service-role side of the app.

It also confirms the copy holds the line the spec draws: the notification
**states the position and stops**. It does not suggest reducing the slot count or
moving the date. `lib/underSubscription.ts` has a unit test asserting the
generated copy contains no such advice, and the production message matched it.

Worth recording for the report's evaluation chapter: this is the first feature
whose *scheduled server-side* path has been observed working against real data,
rather than inferred from tests.

## The lint pass, deferred (2026-08-20)

`npx expo lint` had never been run in this repository — there was no
`eslint.config.js` until one was generated on 2026-08-20. It reports 32 errors
and 8 warnings, none of them in code written that day, mostly one React rule
(`react-hooks/refs`, reading a ref during render) in `Toast.tsx`, `welcome.tsx`
and a handful of others. Owner's decision: **a separate clean-up pass later**,
once everything currently untested has been verified on a device and committed.
Nothing here affects whether the app runs.


## Device round 2: what test 01 turned up (2026-08-21)

Check-in itself passed — a real scan on a real phone returned "You're checked
in" against the correct event and date, which closes the regression open since
the 15 August migration. Five further problems came out of the same twenty
minutes, and four of them were invisible to 379 passing tests because each one
lives in the gap BETWEEN two things that are individually correct.

**"Mark attendance" was missing from a live event.** Two gates on the same event
disagreed about what "started" means. `/api/checkin` finds today's row in
`outreach_days` and never looks at `start_time`, so a scan is accepted anywhere
on the event's calendar day. The Manage event screen asked whether the stated
start time had passed. Between midnight and an 06:00 start the scanner said yes
and the organiser's screen said no — attendance existing that the organiser had
no way to open. The day is now the unit on both sides, because the day is what
attendance is keyed on.

**Deciding an applicant emailed them and did nothing else.** The single-decision
path in `/api/application-status` called `emailApplicant` alone. The two other
paths that decide an application — the batch "accept top N" and waitlist
promotion — always called `pushApplicant` too, which is why this survived
review: the code looked covered from every angle except the one an organisation
actually uses to accept one person.

**Nothing flowed volunteer → organisation at all.** No notification existed when
somebody applied, and more importantly the organisation side had no inbox: every
push it received also wrote a `notifications` row that nothing in its app could
read. Miss the push and the message was gone. Both halves are now built.

**The applicant card offered every action regardless of state.** It disabled only
the button matching the current status, so an accepted volunteer showed live
"Waitlist" and "Reject" buttons identical to an undecided applicant's. Those
actions are legitimate — an organisation must be able to take someone off a
roster — but they are not the same act as deciding a pending application, since
that person has been emailed, told they are confirmed, and has the event on
their schedule.

**A decision gave no confirmation at all.** Fixed with a toast that names the
person and the decision. Staying on the vetting screen afterwards is deliberate
and now documented in the code: vetting is a run of decisions down a list.

## A scattered day span must not contain a dash (2026-08-21)

Two days — 31 August and 3 September — rendered as
"2 days · Mon, Aug 31 – Thu, Sep 3 2026" and read as a four-day event.

Leading with the count was supposed to prevent exactly this and did not. The
dash is a stronger signal than the number in front of it, and it means "through"
everywhere else in the app: the consecutive form, and every time range. A
scatter cannot borrow it.

Scattered days are now NAMED — "2 days · Mon, Aug 31 + Thu, Sep 3 2026" — and
past three days the remainder is counted rather than listed. The rejected
alternative, "2 days between Aug 31 and Sep 3", is accurate and wrong the same
way: "between X and Y" describes a window, and these days are not a window. The
unit test now asserts the property rather than the strings — no scattered span
contains a dash at any length.

## Required skills are not optional (2026-08-21)

An outreach could be published with none, because `validateWizard` never checked.

That is not a relaxed outreach, it is one the matching engine cannot rank.
Skills are 35 of the 100 match points, and `computeLayer1MatchScore` scores an
empty requirement as 1.0 for every applicant — correct arithmetic, wrong
outcome. Everyone collects the full 35, the largest component stops
discriminating, and the ranking collapses onto category, location, availability
and experience.

The alternative — allow zero and REDISTRIBUTE the 35 points across the other
components — is arguably more correct and was deliberately not taken: it changes
the matching engine, which is gated, and it would move every score already
stored on every application. The rule applies when editing too, so an outreach
posted before it gets repaired on its first save.

## The organisation logo, and why one screen differed (2026-08-21)

The dashboard header was the only `<Avatar>` in the app never passed a `uri`.
Sixteen call sites, fifteen of them correct. The owner's guess — that the screen
reads the organisation's name from `organisation_profiles` and never fetches
`profiles.avatar_url` — was close but not the cause: the screen already holds
the full `profiles` row from the auth store, `avatar_url` included. The prop
was simply never written.

Audited at the same time, and all correct: organisation Settings, Edit Profile,
the public organisation profile, the volunteer's outreach detail, the feed card,
the applications card and the schedule card. One genuine omission remains and is
a design decision rather than a bug — the organisation's own **Profile tab**
shows no logo at all, having no avatar element in it.


## Per-day release, built (2026-08-21)

The gap this closes, stated plainly: withdrawal was all-or-nothing and shut the
moment an event began, so a volunteer on four scattered Saturdays who could not
make the third had two options — abandon the whole campaign, or not turn up and
take a −15 no-show. **The app punished people for a thing it gave them no way to
avoid.**

The design decisions worth recording:

**A release is a state on the row, not a deletion.** `released_at` and
`late_release` are added to `application_days`; nothing is removed. A deleted
row cannot say whether somebody gave three weeks' notice or vanished overnight,
and cannot be told apart from a day never promised. Building it this way also
forced the discovery that `DELETE` on that table had never been revoked from
`authenticated` — so the crude, evidence-destroying version of this feature was
already reachable by a crafted call. That is now closed.

**Lateness is judged against the day, not the event.** Dropping day 9 of a
campaign is a decision about day 9. The window has two edges — within 24 hours
AND before the start — the same shape as the whole-application rule, and for the
same reason: a one-sided test is trivially true for everything in the past.

**A day already started cannot be released.** That is a no-show, worth −15 under
the attendance path, and permitting a release afterwards would let anyone
convert a no-show into the lighter cancellation.

**The warning comes before the tap.** A penalty a volunteer only learns about
afterwards teaches nothing. The sheet states the consequence, names how many
late cancellations are already behind them, and still lets them proceed.

**No score moves.** `late_release` is recorded and counted; nothing reads it to
change a V-Score. The deduction is a formula change and stays gated.

## The day-shortfall question (2026-08-21)

The owner asked whether the useful part of per-day slot counting can be had
without building the full model. The answer is yes for detection, no for
capacity — see the report of 2026-08-21 for the reasoning. In short: a day's
shortfall can be DERIVED on demand (`slots_total` minus the count of live
commitments on that day) with nothing new to maintain, because commitments are
already rows. What cannot be derived is a per-day TARGET different from the
event's, which is what "2 nurses on Saturday, 5 on Sunday" would need.


## Create Outreach validation was largely decorative (2026-08-21)

Reported from a device: a day was picked, the chip appeared, and "Pick at least
one day" stayed on screen underneath it.

**The cause was structural rather than local.** `errors` was a `useState`
snapshot written only by `handleNext` and `handleSubmit`. Nothing recomputed it
when a field changed, so every message survived until the next tap of Next —
stale by construction, for **every field**, not only the day list. Errors are now
DERIVED from the form state on each render, with a separate `attempted` set
deciding whether a step's messages are shown. A message therefore appears when
you try to leave a step that is not ready and disappears the moment you fix it.
The editor had the identical bug and the identical fix.

**Tapping Next with nothing chosen did nothing visible.** The step refused to
advance and the message rendered below the fold, so the button read as dead. The
screen now measures each field on layout, scrolls to the first one that is wrong,
and names what is missing in one line above the button.

**The audit found six unguarded fields**, all of which could reach a published
outreach: description, region, district, venue, start time and end time. Only
title, days, skills and staffing were checked. The database is no help here —
only `title`, `date` and `slots_total` are NOT NULL on `outreaches` — so
"required" is a product decision, and each of the six earns it: region is 20 of
the 100 match points AND the feed pre-filter, so an outreach without one cannot
appear in a ranked feed at all; district is the difference between a 1.0 and a
0.5 location score; the times are 15 points and gate attendance; the description
is what a volunteer reads to decide; the venue is where they have to go.

**The messages are now one short line each**, with a red asterisk on the field
carrying the "this is required" signal. The old skills message ran to two
sentences of justification, which belongs in this document rather than under a
form field.

## The ladder now climbs per day (2026-08-21)

Two silences fixed by the same change. The under-subscription job selected on
`outreaches.date` — the FIRST day — so a campaign short on day five never
escalated at all, because only its first day was ever three days out. And it
judged the shortfall on `slots_filled`, which counts accepted PEOPLE, so once a
volunteer could release a single day the event could read "5 of 5 filled" while
a day of it had four.

Each day is now its own rung, deduped on stage + day id so one day cannot
silence the rest — the same lesson the check-in reminders learned. The target is
still the event's own `slots_total`, deliberately: per-day targets are intent
and cannot be derived.

## Admin phase, package A — the role, the shell and the audit trail (2026-08-25)

Package A of `docs/ADMIN_PHASE_PLAN.md`. It builds no review queue: it builds
the thing every queue needs first — an admin to be, somewhere for them to
stand, and the record their decisions will be written into.

### The enum value had to ship on its own

`profile_role` is a Postgres enum, and a new enum value cannot be USED in the
same transaction that adds it. The Supabase SQL editor wraps a pasted script in
one transaction, so a single migration that added `'admin'` and then wrote a
policy mentioning `'admin'` would fail outright. The migration is therefore two
files run one after the other: `20260825a_admin_role_enum.sql` contains one
statement and nothing else, `20260825b_admin_actions.sql` contains everything
that references the new value. Every future admin migration adding an enum
value follows the same rule.

### Adding the value opened a hole, and the hole was in the INSERT

The project has always described `profiles.role` as immutable after signup, and
that was true of UPDATE: `role` is absent from the client's UPDATE grant list,
so a PATCH is refused with 42501 before RLS is consulted.

It was never true of INSERT. The profiles row is created BY THE CLIENT at
signup — `useSignUp`, and `useAuthGuard`'s bootstrap-from-metadata fallback —
and `profiles_insert_own` only ever checked `auth.uid() = id`. The role named
in that insert has always been the client's to choose. While the enum held only
`volunteer` and `organisation` that cost nothing: both are roles anyone can
register as anyway. The moment `'admin'` became a legal value it was a working
privilege escalation — register, ignore the app entirely, POST to
`/rest/v1/profiles` with `role: 'admin'`.

The plan said to test the role lock rather than assume it, and this is what the
test found. `profiles_insert_own`'s with-check now carries
`and role <> 'admin'`. Admins are created by an UPDATE run in the SQL editor,
which runs as postgres and bypasses RLS — so "creation is database-only" is now
enforced by the database rather than by convention. On the app side,
`SignupRole = Exclude<ProfileRole, 'admin'>` types every registration path, so
an attempt to sign someone up as an admin fails to compile.

`20260825c_admin_lock_test.sql` proves all of it. It impersonates a real
signed-in client (the `authenticated` role plus a JWT claim, exactly as
PostgREST does) and tries the escalation moves, including a control case that
checks the refusal came from the admin clause and not from something that would
have refused any insert at all. Success is silence; any failure raises and names
the lock.

### The audit trail is built before the features it records

`admin_actions` ships in package A, twelfth in the brief but first in the build,
because an admin decision made before the row that records it is a decision with
no evidence behind it, and history cannot be backfilled.

Three deliberate choices:

- **`actor_id` is nullable and `on delete set null`.** An audit row must outlive
  the account that wrote it; cascading would let deleting an admin erase the
  record of everything they decided. `actor_email` is a snapshot taken at write
  time, so a row whose actor is gone still names a person.
- **`target_type` is a CHECK constraint, not an enum.** Later packages add
  target kinds, and widening a check constraint is a plain drop-and-add inside
  one transaction — whereas a new enum value is the two-paste dance above.
- **Append-only is a TRIGGER, not a grant.** RLS and column grants stop clients;
  they do not stop the service role, which bypasses both and is precisely what
  writes this table. A trigger applies to every role. A correction is a new row
  saying what was corrected — which is what an audit trail is.

### Two roles hid a routing assumption that three roles break

The auth guard chose the home route with a ternary (`role === 'organisation' ?
… : …`) and bounced wrong-role users with two hand-written `if` branches. Each
tab layout separately redirected a wrong-role user to "the other group". All of
that rests on "not volunteer" meaning organisation.

With three roles it is a redirect loop: an admin who reached the volunteer group
would be sent to the organisation group, whose own guard would send them
straight back, and the two synchronous redirects can ping-pong before the auth
guard's effect settles it. `lib/roleRoutes.ts` now holds role → home route and
role → tab group, read by the guard and by all three layouts, and the bounce
rule reads "you are inside a role group that is not yours" for every combination
at once. Four unit tests hold the properties a fourth role would otherwise break
silently.

The same two-roles assumption was in `resolveProfile`: `role !== 'volunteer'`
meant "organisation", so an admin would have been handed an
`organisation_profiles` row, and then — falling through to the volunteer branch
— a repaired `volunteer_profiles` row on every single load. With `category`
null, the onboarding-incomplete rule would have parked them on the welcome
screen permanently. An admin has no child profile row of either kind, and
`resolveProfile` now returns early for them.

### The shell, and what it deliberately does not show

No admin design exists in `design-refs/` — the Figma work covered the volunteer
and organisation sides only. The admin screens therefore reuse the existing
visual language exactly rather than introducing a third look.

Two tabs, because package A is the shell and the audit trail: **Home** and
**Activity**, with Settings and Account & Security pushed from Home. There are
no queue-count tiles, and that is a decision rather than an omission — a tile
reading "0 pending" would imply a queue that does not exist yet. The Home screen
lists what is coming in words instead, and the empty Activity log says that an
empty log is the expected state until the first decision is made.

## Admin phase, package B — credential documents become private (2026-08-25)

The single most important technical requirement in the owner's brief, and the
current state did not meet it. `api/src/server/cloudinary.ts` signed the upload
but set no delivery type, so a credential landed as an ordinary public asset;
`volunteer_profiles.credential_document_url` stored its permanent delivery URL;
and the verification screen opened that URL in the phone's browser. Anyone
holding the string could fetch someone's identity document — no session, no
authorisation check, and nothing that could be revoked short of deleting the
file.

Nothing real was ever exposed: every file in `vhub/credentials/` is a test PDF
the owner uploaded while exercising the flow. That is why this is a gap closed
before real documents arrive rather than a breach — and why it ships ahead of
the two packages that cause documents to be uploaded and reviewed at volume.

### Three things had to change together

**The asset becomes private.** Cloudinary's `type` is a different axis from
`resource_type`, and it is the one that decides whether an asset is publicly
fetchable. Credentials are now `authenticated`, which cannot be delivered
without a signature. Avatars, flyers and gallery images stay public
deliberately: they are shown to other users on screens with no session of ours
behind the image request, and signing each one would cost a round trip per image
for content that is meant to be seen.

`type` sits in the SIGNED upload parameter set, so a device cannot downgrade a
credential to public delivery by dropping it — the hash would stop matching. It
is omitted entirely when the value is `upload`, because that is Cloudinary's
default and sending it as a no-op would change the hash for the three public
kinds and break uploads that currently work.

**The database stores a name, not an address.** `credential_document_url` is
dropped and `credential_document_id` holds the `public_id`. Keeping the column
unused was the alternative and it is weaker: as long as the column exists, some
later code path can write a permanent URL into it and nothing in the schema
would object.

**Reading is a request, not a lookup.** `/api/document-url` authorises the
caller and returns a link valid for fifteen minutes. The access rules live there
and never in the UI: the volunteer themselves always; an admin, for the Gate 1
review; an organisation only if that volunteer has applied to one of its
outreaches; nobody else. A refusal is a flat 403 with identical wording whatever
the reason, because distinguishing "no such document" from "not yours to see"
would confirm to a stranger that a particular person has uploaded one.

### Why the private-download endpoint rather than a signed delivery URL

Cloudinary offers both. A signed delivery URL (`/s--abc123--/…`) authenticates
but never expires: leak it once and it works forever, which is the exact problem
being fixed. The private-download form carries `expires_at` inside the signed
parameter set, so Cloudinary itself refuses the link afterwards — expiry is
enforced by the service rather than by us remembering to revoke something. The
signature is computed locally from the API secret, so minting a link costs no
network call and cannot fail.

### The screen gained two states it did not have

A stored URL is either there or not. A fetched one is being fetched, or failed,
or arrived — and saying which matters, because "we are unlocking your document"
and "your document is gone" look identical if both render as an empty box. The
preview now names all three, and the failure state is tappable to retry.

## Admin phase, package C — organisation verification (2026-08-25)

Volunteers judge whether an outreach is real by the organisation behind it.
Until now `organisation_profiles.verified` was a boolean nobody could set from
anywhere: service-role-only, with no service-role writer, so it was permanently
false for every organisation on the platform. The badge existed and could never
light up. This gives it a process, evidence and a human decision.

### The boolean is now derived, and can never disagree again

The owner's decision of 2026-08-21 was to keep `verified` and derive it, rather
than replace it. Eight places read it — two organisation screens, the public
profile, the discovery view, the match endpoint and two type files — and
deriving keeps every one of them working untouched while `verification_state`
becomes the truth. Replacing would have meant editing all eight at once and
risking a miss.

It is a STORED GENERATED COLUMN rather than a trigger, for the reason CLAUDE.md
already gives about the multi-role flag: a boolean that must agree with
something else will eventually disagree with it unless the database is the one
computing it. The consequence designed around is that nothing may ever write
`verified` again — Postgres rejects a write to a generated column outright — and
that is a strict improvement, because approval becomes one write to one column
with one meaning.

Dropping and re-adding the column meant dropping and recreating
`public_organisation_profiles` first: a column cannot be dropped while a view
selects it.

### A state, not a boolean, and it already carries moderation

`org_verification_state` is `unverified → documents_submitted → verified`, plus
`rejected`, `suspended` and `banned`. The last two are set by nothing until
package F, and they are in the enum from the start deliberately: adding them
later would need its own separate migration paste, for values whose meaning is
already decided.

### Registration numbers are a table, not four columns

The brief names four example schemes and says the form must accept others. Four
columns would mean a migration every time a new scheme appears, and would force
every organisation into the same four shapes. There is no uniqueness across
organisations: two branches of one NGO can legitimately quote the same parent
registration, and rejecting the honest case to catch a dishonest one an admin
will see anyway is the wrong trade.

### The block is real

"Only verified organisations may post outreaches" is a database trigger, not a
disabled button — the same standard the clinical gate is held to. It fires on
insert and on any status change that exposes an event, and `suspended`/`banned`
fall out of it for free since neither equals `verified`.

DRAFTS ARE STILL ALLOWED, and that is a deliberate exception. Nothing about a
draft is visible to anyone else, and refusing them outright would mean an
organisation waiting on review cannot prepare anything.

**The known consequence, and it is immediate: every existing organisation loses
the ability to publish the moment this migration runs.** That is the point of
the package rather than a side effect, but it means the owner's test
organisation must be approved through the admin queue before it can post again.

### Decisions

- **The reason is required for approvals too**, not only rejections. An
  approval with a reason is what lets a later admin see why an organisation
  passed when the evidence looked thin.
- **A rejection's reason is sent verbatim to the organisation.** A rejection
  that is not explained is a dead end — the organisation cannot tell what to fix.
- **Resubmission replaces, it does not append.** A resubmission is a complete
  restatement of the evidence; appending would leave a withdrawn registration
  number sitting in the reviewer's list as though it were still claimed.
- **A verified organisation cannot resubmit.** Re-deciding would mean
  un-verifying first, which would quietly revoke a badge volunteers are relying
  on right now, on the organisation's own say-so.
- **Documents are prefilled on a rejection resubmit; files are not.**
  Re-attaching the previous files silently would let a resubmission look like
  new evidence when nothing changed.

### Zoom without a new dependency

The brief asks for full-screen pinch-to-zoom, so an admin can read a licence
number off a photograph. Real pinch needs `react-native-gesture-handler`, and
dependencies are a gated decision in this project. `DocumentViewer` therefore
zooms in three steps on tap and pans with the scroll views it is already built
from — which answers the question the brief is actually asking, using what is
installed. On iOS the ScrollView's own pinch works as well, for free; Android
has no equivalent, which is exactly why the tap steps exist rather than being an
iOS-only nicety.

## Admin phase, package D — the two credential gates (2026-08-25)

This closes a gap that has existed since verification was built: a volunteer
could reach `documents_pending` and stop there forever, because nothing in the
app could advance them and approval was a manual UPDATE typed into the SQL
editor.

### Two gates, and they answer different questions

**Gate 1 belongs to the admin and is platform-wide.** Is the document real,
legible, unexpired, and does it plausibly match the claimed category? Approve
moves the volunteer to `verified`, which unlocks full applications to clinical
outreaches everywhere on the platform. It is explicitly not a judgement about
clinical competence, and the endpoint is deliberately incapable of expressing
one — there is no score and no note about skill, only approved or not, and why.

**Gate 2 belongs to the organisation and is per application.** Should this
person do this clinical role for us? It reads the same document through the
signed-URL endpoint and changes no platform status at all, which is why it has
no endpoint of its own and no approve or reject — it appears as one row on the
applicant card, and what the organisation does with what it reads is the
accept/reject decision it was already making.

### There is deliberately no `rejected` status

The obvious design is a fourth `verification_status`. It was rejected for two
reasons that point the same way. It would need its own separate migration paste
(a new enum value cannot be used in the transaction that adds it) plus a branch
in every screen that reads the status. And it would not be more truthful: a
volunteer whose document was declined IS unverified — that is exactly the state
they are in and exactly what they can act on. `rejected` would be a status
meaning "unverified, and also we are cross about it".

What they actually need is the REASON, which is now a column and is shown on
the verification screen above the upload control. Without it a rejection is
indistinguishable from never having uploaded anything.

### The document survives a rejection

Destroying it would leave the volunteer unable to see what they had sent, and
would erase the evidence behind a decision that was recorded in the audit trail
seconds earlier. They can replace or withdraw it themselves, which they always
could.

### Two smaller decisions worth recording

**The decision re-asserts `documents_pending` in its WHERE clause**, not only in
the read before it. Between the read and the write a volunteer can withdraw
their document; without the re-assertion the update would be a decision about
something that is no longer there, and an already-verified volunteer could be
silently un-verified by a stale screen.

**The queue needed an RLS change, not just an endpoint.** `profiles` and
`volunteer_profiles` are scoped to "my own row, or someone I share an
application with", and an admin shares an application with nobody. Without an
`or is_admin()` clause the queue would have been empty for the only person meant
to see it — while the endpoint's own service-role reads kept working, which is
the kind of half-working state that costs a session to diagnose.

## Admin phase, package E — consent, and what to send (2026-08-25)

### Consent is a gate, not a checkbox

Somebody handing over a photograph of their nursing licence is entitled to be
told, at that moment and in plain language, what happens to it. The brief asks
for this separately from general terms, and that is right: consent buried in a
terms document nobody read is not consent.

What makes it real rather than decorative is that it is REFUSED rather than
assumed. `document_consent_at` is a server-only column, and both upload
endpoints reject a document when it is null and the request does not carry a
fresh agreement. A checkbox in a form proves nothing once the form closes; a
timestamp is the only part that is evidence, and it is written in the same
statement as the document it belongs to, so a consent record can never exist for
an upload that did not happen.

**Nobody was backfilled, deliberately.** Everyone currently holding a document
uploaded it before this text existed, so writing down that they agreed to it
would be recording something untrue. They are asked once, the next time they
upload.

**It is asked once and then not again.** Re-showing the block on every
replacement would train people to tap past it, which is the opposite of
informed.

### One source for the copy

`constants/credential-guidelines.ts` holds the per-category guidance, the
general rules and both consent texts. The guidelines screen and the consent
block on the upload screen read from it, so the two cannot drift into telling a
volunteer different things about the same document.

**No real or sample credential images, anywhere.** The brief says so and the
reasoning is worth keeping: a sample licence is either somebody's real one, or a
forgery template with our name on it. The illustrations are generic icons.

**The named councils are examples, not a closed list.** Each entry carries "or
the equivalent from wherever you are registered", because a Ghanaian-trained
volunteer working abroad, or one registered before a council was reorganised,
holds something that does not match the current name and is not thereby a fraud.

### The guidelines screen leads with the reader's own category

A volunteer opening it has one document to send, not seven. Making them find
their profession in an alphabetical list is a small rudeness repeated on every
visit. The other categories stay on the page because a category can be changed,
and because somebody deciding what to claim needs to see what each one costs.

## Admin phase, package F — moderation (2026-08-25)

The governing principle, from which everything else follows: **suspension stops
future activity and never rewrites the past.** Attendance that happened
happened. Reviews that were written stay written. A V-Score keeps meaning what
it meant. What stops is what has not happened yet.

### A departure from the plan, and the reason for it

`docs/ADMIN_PHASE_PLAN.md` puts `suspended` and `banned` inside
`org_verification_state`, and package C duly added them there. Package F does
not use them, and this is a deliberate departure.

Suspending a VERIFIED organisation would overwrite the column that records we
checked their documents. Reinstating could then not restore it: the reinstating
admin would have to guess whether this organisation had been verified before, or
we would have to keep the previous value in a second column — which is exactly
the "a value that must agree with something else will eventually disagree with
it" problem the same plan warns about two sections earlier, and which the
generated `verified` column was introduced to avoid.

They are two independent facts. "We checked their registration" and "they are
currently allowed to operate" can each be true or false without the other. So
moderation is its own column on `profiles`, which also means one implementation
covers volunteers and organisations rather than two.

The unused enum values stay where they are. Postgres cannot remove an enum
value, and an unused one costs nothing.

### The consequences are asymmetric, because the roles hold different things

An **organisation** holds other people's Saturdays. Suspending it cancels its
open and closed outreaches and tells everyone accepted, waitlisted or pending —
by push and by email, because a volunteer who turns up to a cancelled clinic has
lost a day to our silence. Waitlisted volunteers are told too: they have kept
the date free, and not telling them is the same failure as not telling an
accepted volunteer, just cheaper for us. Drafts are left alone, because nobody
was ever shown them.

A **volunteer** holds a place somebody else could have had. Suspending them
withdraws their live applications and hands each ACCEPTED place to the waitlist
through the same promotion their own cancellation would have used. Only an
accepted place frees a seat — promoting against a withdrawn pending or
waitlisted application would accept somebody into a slot that is still
legitimately full.

### One promotion rule, extracted rather than copied

`maybePromoteWaitlist` lived inside `/api/application-status`. Moderation needs
exactly the same behaviour, so it moved to `server/waitlist.ts` unchanged and
both routes call it. Two copies of a promotion rule would be free to drift, and
the drift would be invisible because both would still appear to work.

### Reinstatement restores the future only

It does not resurrect cancelled outreaches or withdrawn applications. That is
deliberate rather than lazy: the people affected were told those things were
off, and quietly un-telling them days later is worse than leaving them off.

### Two smaller decisions

**The application trigger is INSERT-only.** An UPDATE by a suspended volunteer
is them cancelling something, and a suspended person must always be able to
withdraw — refusing that would trap them in commitments they have been barred
from honouring.

**Moderation is a search, never a directory.** It starts with a complaint about
a specific person. A browsable roll of every account invites looking through
people for its own sake, and would be the one screen where an admin's reach over
ordinary users is casual rather than deliberate. Nothing appears until two
characters are typed. The one list shown unprompted is everyone currently
stopped, so a moderation can be found and undone without remembering a name.

## Admin phase, package G — disputes (2026-08-26)

A volunteer can challenge two things, and only two: being marked absent when
they say they were there, and a review they believe is unfair. Both are records
that cost them something they cannot otherwise get back.

### What upholding does, and what it deliberately does not

Upholding records that the volunteer was right, tells both parties in the same
words, and leaves the record itself alone. It does not recompute a V-Score, and
it does not flip the attendance row or rewrite the review.

That is a limit rather than an unfinished edge, and there are two separate
reasons for it.

**Written before the reversal was approved.** It was approved on 2026-08-26 and
built as package K, so the first sentence of this section is now only half true:
upholding DOES recompute the V-Score. Everything else in it still holds, and the
second reason below is why. See "Package K" at the end of this document.

The first is process: making the V-Score derivable — replaying every event from
70 rather than keeping a running total — is a change to something already built,
working and tested, and it is its own approval gate. Nothing about the queue,
the evidence view or the decision depends on how the score is stored, which is
exactly why disputes could ship first and gain the recalculation later without
any of this changing.

The second is design, and it would hold even if the reversal were approved:
overwriting the attendance row would destroy the record of what happened in
favour of a conclusion about it. That row is service-role-only precisely so
neither party can forge it, and an admin editing it would be the same forgery
with better intentions. The dispute IS the correction, and it sits beside the
record rather than on top of it.

### Both sides, objectively

The admin screen shows the volunteer's statement and, beside it, the record.
For an attendance dispute that is whether a scan exists, what the silent
location check returned, and what the organisation marked. For a review dispute
it is the ratings and the note, plus the volunteer's aggregate history — because
a volunteer with thirty events and one poor review is a different case from one
with two events and two poor reviews, and a statement alone cannot show that.

Reading any of that needed an RLS change: `attendance` and `event_reviews` are
scoped to the volunteer and their organisation, and an admin is neither. Without
`or is_admin()` the screen would have shown a statement with nothing to weigh
it against.

### Raising is an insert; resolving is an endpoint

Nothing about raising a dispute needs a secret, and every column that decides
anything — `status`, `resolution`, `resolved_by` — is withheld by the grant
list, so the worst a crafted call can do is file a dispute the caller was always
entitled to file. The resolution is the half that needs the service role.

**The consequence, stated rather than left as a surprise: a volunteer cannot
withdraw a dispute from the app.** Withdrawing needs `status` in the grant list,
and a client that could write `status` could mark its own dispute upheld. They
can edit their statement while it is open, and an admin can reject one that is
no longer being pursued.

### Where it is offered

On the feedback screen, which is the only place a volunteer sees what was said
about them — a record you can read but cannot answer is worse than one you never
see. Which challenge is offered depends on what the review says: "I was there"
only makes sense against a no-show, "this is unfair" only against ratings.
Offering both everywhere would ask the volunteer to work out which applies.

## Admin phase, packages H, I and J (2026-08-26)

### H — the policy, written to be read

Plain language throughout, per the brief: the readers are nurses and students
giving up Saturdays, not procurement lawyers. Every paragraph says one thing and
says it in the second person.

The location paragraph is the strongest privacy claim this project can make, and
it is true of the code today: `/api/checkin` reads a position once at the scan,
compares it with the venue, and keeps one word — at the venue, near it, or
elsewhere. The coordinates are never stored, so there is no movement record to
disclose, subpoena or leak.

**The standing rule that goes with it: if a claim in the policy stops matching
what the app does, the claim is the bug.** A privacy policy is the one document
in a project that must be edited when the code changes, not the other way round.

It lives at `app/policy.tsx`, outside every role group — the same placement as
the offline screen — because all three roles reach it from three different
Settings screens and from the credential consent block. The auth guard now
treats it as always-open: somebody deciding whether to register has the most
reason of anyone to read it, and bouncing them to welcome would be the app
refusing to explain itself.

### I — statistics, where each number answers a stated question

The brief asks for mobile-appropriate statistics rather than a dashboard, and
names the questions worth answering. Each card therefore carries its question in
words above the figure, because a number with no question attached is
decoration.

The backlog leads deliberately. It is the only figure on the screen about the
admin's own conduct rather than the platform's: everything else can wait,
somebody waiting on a decision cannot.

**Drafts and cancelled events are excluded from the fill rate.** A draft never
recruited anybody, and a cancelled event's empty places are not a matching
failure — including either would drag the rate down for reasons that have
nothing to do with matching, which is the one thing the number exists to
measure.

**Every month in the no-show window is seeded, including empty ones.** A trend
with quiet months missing reads as a line that jumped, when in fact nothing
happened.

The bars are plain Views. A charting library would be a new dependency — gated
in this project — for six numbers, and six bars scaled to the largest is a chart
already.

This package also needed an RLS change rather than only a screen: `outreaches`
and `applications` are both row-scoped, and an admin owns nothing and applies to
nothing, so every count would have come back quietly wrong rather than failing.
Quietly is the problem — nobody re-checks a number that looks plausible.

### J — a whitelist, and deliberately nothing that reads it

Surface only. Nothing reads `vetted_sources`, no listing is fetched, no outreach
is created from one. The ingestion feature stays deferred; this records which
sources would be acceptable while the reasoning is fresh rather than
reconstructed later from memory.

**There is no `last_fetched_at`, no `active` flag and no schedule.** Columns that
exist for a feature that does not are how a schema starts lying: a
`last_fetched_at` that is forever null reads as a broken fetcher rather than an
absent one.

`url` is not validated as a URL and `source_type` is free text — a district
health directorate's noticeboard has no scheme, and the kinds of body are
open-ended. `rationale` is required, because a whitelist without reasons is a
list somebody has to take on trust, and whoever approved each entry will not
always be there to ask.

A removal reads the row before deleting it, so the audit entry can say what was
removed. Once the row is gone, that entry is the only record it ever existed.

And the screen says, in the first paragraph, that nothing is fetched. An admin
who added three sources and saw nothing happen would reasonably conclude the app
was broken and spend a while proving it.


## Admin phase, package K — the V-Score becomes a derived value (2026-08-26)

This was the one item in the twelve-section brief that changes something already
built, working and tested, so it sat behind its own approval gate for the whole
admin phase and was built only after an explicit yes.

### What actually changed, and what did not

**The formula did not change.** A score still starts at 70, and each reviewed
event still moves it by `0.7 × old + 0.3 × event_outcome`, with the outcome
still derived from attendance and the two ratings. Every band boundary, the
reliability multiplier and the ranking are untouched, and the unit tests that
cover them all still pass unchanged.

**What changed is where the number lives.** `volunteer_profiles.v_score` used to
be the truth: each review was blended into whatever was stored, and the previous
value was gone. It is now a **cache** of a value derived by replaying the
volunteer's entire review history from 70. The truth is `event_reviews` plus any
upheld `disputes`.

In plain terms: instead of adding today's review to yesterday's number, the
system now recalculates the whole thing from the beginning every time. For
somebody with a clean history that produces exactly the same answer — and it has
to, which is the safety property the migration was built around.

### Why it was worth doing, beyond the dispute case

The dispute case is the obvious one. A running total has no way back. An upheld
dispute could record on paper that the volunteer was right while changing nothing
about the number the mistake produced, which is a poor kind of vindication.

The less obvious one is that the running total was **already quietly wrong**.
`event_reviews` is upserted on `(outreach_id, volunteer_id)` — meaning a second
review of the same volunteer for the same event overwrites the first rather than
adding a row. But the score arithmetic did not know that. An organisation that
filed a review and then corrected it blended a second time into a score the first
version had already moved, and incremented `events_attended` a second time too.
Nobody had reported this, and nobody would have: the resulting number is
plausible. Replaying makes an edited review produce the score the edited history
implies, and the attendance count to match, with nobody having to notice.

### Filing order, not event date — and why the distinction is not pedantry

The plan said "replay every event chronologically", which is ambiguous. The
replay uses the order the reviews were **filed** (`event_reviews.created_at`,
with `id` breaking ties), not the order the events happened.

The blend is order-dependent: the most recent event is weighted most heavily,
so the same set of reviews in a different order produces a different score. If
the replay used event dates, a January event that an organisation got round to
reviewing in June would be re-inserted *before* events that had already been
counted — moving somebody's score for a reason that has nothing to do with any
error. There is a test asserting that order changes the result, so this is
recorded as a property of the design rather than left as a surprise.

Filing order also buys the property the whole migration rests on: for a volunteer
with no upheld dispute, the replay must reproduce the stored score **exactly**.
That turns the migration's dry run from a leap of faith into a check — any
unexplained movement is a bug in the replay, not a correction, and the report
says which is which.

### Upholding voids the event; it does not invent a better one

An upheld dispute makes that event stop counting. It is not replaced with a
better rating, and this is deliberate. Upholding says "this record should not
have counted against you"; it does not say what the ratings should have been, and
nobody knows. Substituting a number would be exactly the fabrication that the
removed midpoint default was — the 3-out-of-5 that quietly cost good volunteers
points because 60 sits below the 70 everyone starts at.

An upheld **attendance** dispute additionally restores the attendance count,
because being counted as present is the thing they were disputing.

### The one real casualty: the flat penalty endpoint

Making the score derived means there can be exactly one writer of it — the
replay. That forced a decision about `/api/vscore`'s `penalty` action, which
applied a flat deduction (no-show −15, late cancellation −8, on-time −2) by
arithmetic straight onto the stored number.

Under the new model that action is actively dangerous. A penalty written that way
sits in no history, so the next review — or the next upheld dispute, or a re-run
of the recompute — replays from 70 and the deduction vanishes. Silently, after a
screen has already shown it. A deduction that disappears with nobody noticing is
worse than one that was never applied.

The action therefore now **refuses with a 409** and says why. Three things make
this cost less than it sounds:

- **Nothing in the app has ever called it.** The typed client wrapper exists in
  `lib/api-client.ts` and no screen uses it, so no behaviour changed for anyone.
- **The no-show loses nothing.** A review filed with `attended: false` already
  floors that event's outcome to 0, which is the same punishment by the one route
  that survives a replay. CLAUDE.md already required exactly one writer of the
  score so that a single no-show could not be punished twice — this action was a
  second route to the same punishment even before the score became derived.
- **Only the two cancellation penalties are genuinely homeless**, because a
  cancellation produces no review row for the replay to read. Giving them a home
  means a table of score events, which is a schema change and therefore stays
  gated. The client wrapper is marked deprecated rather than deleted, so the
  contract is still visible if that table is ever approved.

### The migration ships as two files, on purpose

`20260903a` adds one nullable column, creates the replay as two SQL functions,
and ends with a **dry-run report** listing every volunteer whose score or
attendance count would move, largest movement first, with a `why` column
classifying each row as `correction` (an upheld dispute — expected),
`review edit` (the double-counting bug above — expected, and fixed by this) or
`INVESTIGATE`. It writes no score and can be run repeatedly.

`20260903b` is the write, and is separate for exactly that reason: the first file
can be pasted freely, the second should be pasted once, on purpose, after the
report has been read. It keeps a permanent backup table of the previous numbers —
the only record of what the running total said — and ends with four verification
figures that should all read zero or match.

`INVESTIGATE` should be empty on this platform. There is precisely one known way
it can be non-empty: a flat penalty applied through the endpoint described above,
which left no record of itself anywhere. That is why the endpoint now refuses,
and why the migration comment names it.

### The SQL is a second implementation of one rule, taken deliberately

`vscore_event_outcome()` in the migration mirrors `computeEventOutcome()` in
TypeScript line for line. Two implementations of one rule is a genuine risk, and
it was accepted for one reason: the report showing how far every score would move
had to be producible in the Supabase SQL editor before any code was deployed.
The TypeScript is the version that runs in production, and the migration says so
— if they ever disagree, the TypeScript is right and the SQL is the bug.


## Admin phase, package L — a home for the flat penalties (2026-08-27)

Package K made the V-Score derived, and in doing so left three deductions with
nowhere to live. This is where they live. The owner's instruction is also the
argument for it: *something does not have to break before we build the fix, and
leaving a designed rule permanently unappliable is worse than the schema change.*

### What was homeless, and why

A derived score has exactly one writer: the replay. That is what makes it
correctable, and it is why an upheld dispute can now reach back to a March event
and undo it. But it also means a deduction written by arithmetic onto the stored
number sits in no history — so the next review replays from 70, and the
deduction vanishes silently, after a screen has already shown it.

Three penalties produce no `event_reviews` row and so had no other route:

- **late cancellation, −8** — cancelling an accepted place inside the window.
- **on-time cancellation, −2** — cancelling an accepted place in good time.
- **the late per-day release**, approved 2026-08-21 — dropping a committed day
  inside 24 hours of it. Two free in a rolling 90 days, then
  −8 × days released ÷ days committed, floored at −2 and capped at −8. This one
  had never had anywhere to live at all; it was computed by a tested function
  that nothing called.

### The no-show is deliberately not among them

This is the single most important line in the migration. An absence already
moves the score through the review path: a review filed with `attended: false`
floors that event's outcome to 0. Adding `no_show` to the new table would create
a second route to the same punishment, and CLAUDE.md has required since
2026-08-07 that one writer owns every score change *precisely* so that a single
no-show cannot be punished twice.

It is enforced rather than documented. `no_show` is not a value of
`score_event_kind`, and `/api/vscore` leaves it out of the action's schema — so
sending one is a validation error naming the two legal values, not a branch
buried in a handler that a later edit could remove.

### The one asymmetry: a penalty stores its number

An `event_reviews` row stores the *ratings* and the outcome is computed at
replay time. A `score_events` row stores the *points*. That looks inconsistent
until you see what each thing is.

A review is **evidence**, and the score is a conclusion drawn from it — so the
evidence is what gets kept and the conclusion is recomputed. A penalty is the
other way round: the deduction **is** the decision. Two consequences follow, and
both argue for keeping the number:

1. Recomputing at replay time would let a later change to the amounts silently
   re-punish cancellations settled months ago, at a figure nobody was ever told.
2. The late-release amount could not be recomputed honestly even in principle.
   It depends on how many late releases were already inside the rolling 90-day
   window **at the moment of the release**, and that window has moved since.
   Deriving it later would produce a different, equally confident, wrong answer.

So a penalty, once applied, means what it meant.

### Where a penalty sits in the replay order

Reviews replay in filing order. Penalties join the same stream on the same rule
— `created_at` — because the score is order-dependent and two separate passes
could not express "the cancellation came before the review". That ordering is
not a detail: it decides how much of the deduction later events blend away.

Ties are broken by a fixed `source_rank` (a review sorts before a penalty at the
same timestamp) and then by `id`. The choice of which sorts first is arbitrary;
that it is *fixed* is not. Without it, two entries written in the same
microsecond would replay in whatever order the rows happened to come back in,
and the score would not be reproducible. The rank exists identically in
`api/src/server/vscoreReplay.ts` and in `vscore_replay()`, and the two have to
move together or the API and the migration would compute different scores from
the same history.

### Retry safety, which is not a nicety here

`dedupe_key`, unique per volunteer, is what makes every write idempotent. A
dropped connection, a double tap or a cron that fires twice would otherwise
charge somebody twice for one act — and unlike most double-writes, this one is
invisible: the second deduction looks exactly like a legitimate one.

A cancellation keys on the application, because an application is cancelled once
and stays cancelled. The kind is deliberately *not* part of that key: if the
timing were somehow reported both ways, the second must be refused rather than
charged on top of the first. A late release keys on the released day **and the
timestamp it was released at**, because a day can be taken back on and dropped
late again, and that second drop is a genuinely new act rather than a repeat.

### Reversal is voiding, not deleting

An admin who applies a penalty wrongly voids it. The row stays. It is the same
argument as everywhere else in this project: the row is the evidence a score is
derived from, and deleting it would leave a score nobody can account for.
A voided row stops counting in the replay — the same treatment an upheld dispute
gives a review.

There is deliberately **no** DELETE-refusing trigger, unlike `admin_actions`.
One would break account deletion: `volunteer_id` cascades from `profiles`, and a
trigger cannot tell a cascade apart from a bad delete. The clients cannot delete
because the privilege is revoked; the service role must not, and the table
comment says so.

### Nothing is client-writable, and reads are narrower than you might expect

No INSERT, UPDATE or DELETE grant exists for `authenticated` at all. A client
that could insert could penalise anybody by name; one that could update could
void its own penalties.

Reads are the volunteer themselves and admins — **not** the organisation. That
is a deliberate line: an organisation already sees the V-Score the record
produced, and seeing the reasons behind somebody's number is a different thing
from seeing their number.

### The endpoint works again, and still nothing calls it

`/api/vscore` regained its `penalty` action and gained a `late_release` one.
Both write a row and then replay; neither does arithmetic on the stored score.

The late-release action takes the *facts* of the release and computes the amount
on the server, never accepting a figure from the client — a client that could
name the number could choose it. It also re-reads `application_days.late_release`
rather than trusting the request, because that column is absent from the
client's grant list precisely so nobody can declare their own lateness.

**Nothing in the app calls either one.** The owner's standing hold of 2026-08-21
— penalties stay uncalled until the app has been device-tested, because a bug
that has already written to reputation data is an audit-and-repair job rather
than a code fix — is separate from whether the machinery exists. It now does,
and wiring it is a decision rather than a build.

### No score moved

The table is created empty, so the replay gains a term that is empty for
everybody. The migration re-runs the recompute anyway and reports how many
scores it changed, which should read zero — because "the cache agrees with the
function" ought to be something that was checked rather than reasoned about.
There is a unit test asserting the same property from the other side: a history
with no penalties replays to exactly what it replayed to before penalties
existed.


## Partial attendance finally reaches the score (2026-08-31)

The multi-day subsystem had been collecting evidence that nothing consumed. A
volunteer says which days of an outreach they will come to (`application_days`),
the organiser resolves each day as it happens (`attendance`), and the scorer
then took one review row and ignored every bit of it: somebody who managed one
Saturday of four scored exactly the same as somebody who managed all four. This
closes that, and it is the largest correctness gap the product had left.

**The rule.** An event outcome is still computed **once per event** — the
0–100 number derived from the review's attendance box and its one or two star
ratings — and it is now **multiplied by the share of committed days the
volunteer was actually present for**. A perfect review of 4 days out of 4 still
scores 100. The same perfect review of 1 day out of 4 scores 25, and blends into
the V-Score at that weight.

**Once per event, never once per day, and that is the whole point.** Scoring
each day separately would let a month-long campaign move a score twenty times
harder than a one-day clinic. That would be the app making a statement about how
long an event ran rather than about the volunteer, and it would let a single
long event dominate somebody's entire history.

### The two ways this could have quietly hurt people, and what stops each

Both were live risks, and both are closed by rules that already existed
elsewhere in the project rather than by anything invented here.

**A released day must not become a penalty.** Per-day release exists so that a
volunteer who cannot make one Saturday of four can say so instead of abandoning
the campaign or taking a no-show. If a released day stayed in the denominator,
using that escape hatch honestly would score 3/4 and cost the volunteer
reputation — rebuilding the exact trap the feature was built to remove. The
denominator therefore counts only days still committed to (`released_at is
null`), which is the same filter every other day count in the app already
applies. Release a day and the commitment becomes 3 of 3, not 3 of 4.

**An organiser's inaction must not become a volunteer's absence.** Attendance is
resolved per day by a human, and plenty of days will never be resolved at all.
`isPresent` already defaults to present for exactly this reason — absence is an
explicit human judgement, never an inference from silence, because a flat phone
or an organiser who never opened the screen is not evidence of anything. The
ratio inherits that: an unresolved day counts as attended, and the ratio falls
only where somebody actually marked a person absent.

Those two together are why the migration's dry run is expected to come back
**empty**. Nobody on the platform has been marked absent on part of a multi-day
event, so every ratio is currently 1.0 and the scaling is a no-op for everybody.
The rule now exists for the first time somebody is.

### Zero attended days is still a no-show, and gets there by arithmetic

The approved shape was "partial attendance takes the ratio; only zero attended
days takes the flat no-show treatment". That did not need a second rule: a ratio
of zero multiplies the outcome to exactly the 0 that a review filed with
`attended = false` already produces. So the no-show case arrives at the same
floor by a second route without a branch, and somebody marked absent on all four
of the days they committed to lands there whatever the review's overall
attendance box says.

### A missing number is not a bad number

`daysAttended` and `daysCommitted` are optional, and `dayCommitmentRatio`
returns **null** rather than zero when either is absent. Null means "do not
scale"; the outcome passes through untouched. Every caller written before this
change, and every path with no day information to hand, therefore behaves
exactly as it did.

This is the same lesson as the removed `DEFAULT_MISSING_SUBSCORE`, which
substituted a midpoint 3/5 for an unrated review and thereby dragged every
volunteer toward 60 from a starting score of 70. Reading an absent figure as a
poor one is how a data gap turns into a reputation loss. A read path with no
days must leave the score alone.

### The ratio is derived on every replay, never stored on the review

A review stores its ratings and the outcome is derived from them, because the
review is evidence and the score is a conclusion. The days are evidence in the
same sense, and unlike the ratings they keep changing after the review is filed:
an organiser who resolves day 3 a week later has produced new evidence, and the
score has to move. Storing a scaled number at review time would freeze a
conclusion drawn before the organiser had finished. So `replayAndStoreVScore`
reads `application_days` and `attendance` on every replay and recomputes the
ratio each time.

This is deliberately the opposite treatment from `score_events.points`, which IS
stored — a penalty's number is the decision itself, not evidence for one, and
the late-release figure depends on a rolling window that has since moved.

### One function, two callers

`attendedRatio` in `lib/outreachDays.ts` had been sitting there for display, with
a comment saying the V-Score consumption was gated. It is now an alias of
`dayCommitmentRatio` in `lib/vscore.ts` rather than a second copy of the same
division, so the figure an organiser is shown on screen and the figure their
volunteer's score is scaled by are provably the same number. The alias points
that way round because `lib/vscore.ts` imports nothing at all and must stay that
way — it is imported by the serverless API, which has no business pulling in a
UI date helper.

`vscore_day_ratio()` in the migration is a third implementation, in SQL, and the
same standing arrangement applies to it as to `vscore_event_outcome()`: it
exists so the owner can see the movement in the SQL editor before anything is
written, the TypeScript is the version that runs in production, and if the two
ever disagree the SQL is the bug.

### Why the ratio is applied at the point of use rather than inside the outcome function

In SQL, `vscore_event_outcome` is `immutable` and takes three scalars. Adding a
fourth parameter creates an *overload* rather than replacing the function, which
would leave two functions that have to agree with each other — the drift this
project keeps closing. So the migration multiplies at the point of use, in the
replay's review branch, and the pair together mirror the single TypeScript
`computeEventOutcome`.

### The bug the tests caught

`replayVScore` rebuilds the review object field by field before blending, rather
than spreading it, because `attended` has to be overridable by an upheld
attendance dispute. That means every field the outcome depends on must be named
explicitly — and the first version of this change named the two new ones in the
interface and forgot them there. The pure function scaled correctly and the
replay did not, so the scaling was silently inert through the only path that
actually runs in production. A test asserting that 1-of-4 ends below 4-of-4
caught it. The comment at that call site now says why the object is rebuilt and
what forgetting a field costs.

## Both ends of a V-Score penalty become visible (2026-08-31)

`score_events` was written by `/api/vscore`, read by the replay, and shown to
nobody. A volunteer could lose points with nowhere to find out what for, and an
admin could neither see a deduction nor undo one. That made the flat penalties
the only irreversible thing left in a score model whose entire point is that it
is derived and therefore correctable — an upheld dispute could already reach
back and void a *review*; nothing could reach a *penalty*.

Two surfaces and one endpoint close that.

### What the volunteer sees

Their own deductions now sit on "My feedback", above the reviews. They are put
outside the intro card on purpose: the reviews are what people said about them,
and a deduction is what the platform did to them, and running the two together
would blur which is which.

Each one shows the points, what kind it was in plain words ("Late cancellation",
"Dropped a day late"), the event, the date, and the written reason.
`score_events.reason` is non-blank by check constraint precisely so there is
always something honest to show.

**The section renders nothing at all when there are none**, which will be almost
everybody. An empty "Score deductions" heading on a good volunteer's screen
implies there is a record to worry about.

### What the admin sees, and why it is a list rather than a search

The moderation screen is deliberately a search with no browsable directory,
because moderation starts with a complaint about a specific person and a roll of
every account invites looking through people for its own sake. This screen is
the opposite and for a reason that does not contradict it: it browses
**decisions the platform has already made about somebody's number**, not people.
It is the same kind of thing as the activity log, the table only ever holds rows
that moved a score, and an admin has to be able to find a wrong deduction
without already knowing whose it was.

It is capped at 200 rows. If it ever grows past that, the cap is the bug and the
fix is paging — never a silently truncated list an admin believes is complete.

### Reversing one

`/api/score-event` sets `voided_at` and `voided_reason`, replays, writes the
audit row, then tells the volunteer.

**It is an UPDATE, never a DELETE.** The row is the evidence behind a number
somebody was shown; a voided row simply stops counting in the replay, which is
exactly the treatment an upheld dispute gives a review. Both the volunteer and
the admin keep seeing it, marked reversed. Hiding it would mean somebody who had
been told about a penalty could later find no trace of it — which reads as the
app having lost the record rather than as the penalty having been withdrawn.

**The score is REPLAYED, not adjusted.** Adding the points back onto the stored
number would be wrong twice over: the clamp to [0, 100] may already have
swallowed part of the deduction, and every review filed since has blended it
forward at 0.7x apiece. Only replaying the history without it produces the score
the corrected history implies. That is also why the toast reports both numbers —
how far a score actually moves depends on what was filed after the penalty, and
an admin told only "done" cannot tell a working reversal from a no-op.

**It is one-way.** There is no un-void. Re-applying a deduction an admin decided
was wrong needs its own justification and its own audit row, and the honest way
to express that is a new penalty rather than the resurrection of a reversed one.
The dedupe key would refuse a duplicate anyway.

**The volunteer is told, with the amount and the new score named.** A reversal in
silence is indistinguishable from a score that drifted, and the person the
points were taken from is the one with the most reason to know they came back.
The push reuses the existing `application_status` notification type rather than
adding a new one — the type is a column with a CHECK on it, and a new value
would be a migration for a message the volunteer reads as ordinary news about
their standing. The dispute decision made the same call for the same reason.

### The migration that had to ship with it

`admin_actions.target_type` is a CHECK constraint rather than an enum, and
20260825b said in as many words that this was so later packages could extend it
with a plain drop-and-add instead of the two-paste enum dance. `20260907` is the
first time that decision was collected on.

It has to land with the endpoint rather than after it: `recordAdminAction`
throws when the insert fails, which is the correct behaviour for a decision that
cannot be recorded, and would make every reversal fail until the constraint knew
the word.

### One stale doc line fixed in passing

`resolveDispute` in `lib/api-client.ts` still said upholding "does NOT recompute
a V-Score" and called that "a separate, gated change". It was approved on
2026-08-26 and has recomputed ever since. The endpoint was right and its client
wrapper was describing a world that had stopped existing.

## V-Score penalties go live (2026-08-31)

The two flat deductions — withdrawing from an outreach, and dropping a committed
day inside 24 hours of it — now actually move a score. The formulas were
approved and built long ago and called by nothing; this is the wiring, and
almost all of the work turned out to be about *where* a penalty can honestly be
applied rather than how much it should be.

### The fact with a lifetime of one request

A withdrawal is only fair to penalise when the volunteer held an **accepted**
place. Pulling out of something you were merely pending or waitlisted for costs
nobody anything: no place was held, no organiser was left short, and it is
exactly the behaviour the app wants instead of somebody going quiet. Charging
for it would punish the honest version of changing your mind.

But `applications` does not record what a cancelled row used to be. The moment
`status` reads `'cancelled'`, nothing on the row can distinguish an abandoned
accepted place from a withdrawn pending application. **That distinction exists
for the length of one request and then it is gone.**

Everything else follows from that single observation.

**The client stopped cancelling the row itself.** `useCancelApplication` used to
write `status = 'cancelled'` directly through RLS and then call
`/api/application-status` afterwards as a best-effort nudge to promote the
waitlist. That order destroyed the previous status before the server ever saw
it: by the time the endpoint ran, it fell into its idempotent no-op branch with
nothing left to judge. The endpoint now performs the whole withdrawal — reads
the current status, writes the cancellation and the reason together, lets the
trigger stamp `cancelled_at` and `late_cancellation`, records the deduction,
replays the score, and offers the freed place to the waitlist.

**`/api/vscore`'s `penalty` action was removed rather than fixed.** It could be
called at any time after a cancellation, which means it could never tell a fair
penalty from an unfair one. An endpoint that cannot answer the question it
exists to answer should not exist; leaving it as a second door would have meant
the unfair path stayed reachable forever.

**The failure behaviour changed with it, and improved.** Before: a failed API
call left the application withdrawn and the waitlist un-promoted — a half-done
withdrawal nobody could see. Now the request either does all of it or none of
it, and the volunteer is told to try again. The deduction alone is best-effort
*inside* the endpoint: a withdrawal must never be reported as failed because a
penalty could not be written, or the volunteer will withdraw twice.

### The late release, and why it needed a sweep

Releasing a day is a direct client write — the volunteer updates
`application_days.released_at` and a database trigger decides whether it was
late. The deduction needs the service role, so the app calls `/api/vscore`
afterwards. **That call can simply not happen**: the network drops, the app is
closed, or a crafted client omits it deliberately. Without a backstop, "penalties
are live" would really have meant "penalties are live for volunteers whose phone
cooperated", which is worse than not having them at all.

So a fifth pass was added to the existing daily cron. It finds late releases on
accepted applications with no deduction against them and charges them. It is
safe to run every night and twice, because the deduction is deduplicated on the
released day *plus the moment it was released* — a release the app already
charged is a no-op.

**The cancellation deliberately has no equivalent sweep**, and that asymmetry is
worth stating so nobody later "fixes" it: the cancellation penalty is applied
inside the same request that performs the cancellation, so there is no window in
which one exists without the other. There is nothing left to detect afterwards.

**`PENALTIES_LIVE_FROM` is a permanent floor, not a rolling window.** Releases
made before penalties went live are never charged. Charging somebody for a day
they dropped while the app was telling them nothing would happen is retroactive
punishment, and it would arrive as a score drop with no act attached to it.

### The amount stopped being something a client could choose

`/api/vscore`'s late-release action used to take `daysReleased` and
`daysCommitted` in the request body. Its own doc comment said the amount was
"never sent by the client" — but those two numbers *are* the numerator and
denominator of the amount. A crafted call could send a denominator of 400 and be
charged the floor instead of the real figure.

Both are now counted server-side, along with the rolling allowance, from rows
the client has no write grant on. What they mean took some deciding:

- **`daysCommitted` is every `application_days` row, released or not.** That is
  the promise the volunteer originally made, and it is the denominator the
  approved formula was calibrated against ("1 of 4 days → −2"). Counting only
  the days still live would shrink the denominator with each drop and make the
  third drop cost more than the first for no stated reason.
- **`daysReleased` is always 1.** Each late release is one act, charged for
  itself. Charging the running total would re-charge days already paid for, and
  the dedupe key is per-day-per-moment precisely because each act is its own
  event. The consequence is worth having: four single-day drops of a four-day
  commitment total exactly −8, which is the withdrawal figure the formula was
  built to meet at its own edge. There is a unit test asserting that
  composition, so a change to the wiring that broke it would fail rather than
  quietly overcharge.
- **The prior-releases count is taken as of `released_at`, strictly before it**,
  rather than as of now. That makes the figure reproducible: the sweep catching
  a release from yesterday computes the same number the live call would have,
  instead of a different and equally confident one. It also removed the "count
  including this one, then subtract one" fudge the endpoint used to do.

### One judgement that is not in the approved formula — CONFIRMED BY THE OWNER

**A late release is only charged on an accepted application**, the same rule as
a cancellation. Nothing in the approved deduction says this — it was written
before per-day release had a status to check — but the reasoning is identical: a
pending or waitlisted volunteer dropping a day has taken no place from anybody.

Flagged as a judgement rather than presented as spec, and **confirmed by the
owner on 2026-08-31**, in her words: a pending or waitlisted volunteer "has
taken no place from anybody and left no organiser short, so there is nothing to
charge for." It is settled policy now, not an assumption.

### Saying it out loud

Both deductions are reported at the moment they happen, with the amount and the
new score named, and both appear on the volunteer's My feedback screen
afterwards. The release sheet already warned *before* the tap that a day inside
24 hours counts as a late cancellation, but it cannot name a figure — the amount
depends on how many late releases are already in the rolling window, which only
the server knows. The toast is where the number gets said.

**Nothing is said when nothing was charged.** A withdrawal from a pending
application says only "Withdrawn", and a free release says nothing about a score
at all. "That cost you 0 points" reads as a punishment.

### The extraction

`recordPenalty` moved out of `/api/vscore` into `api/src/server/scorePenalties.ts`
unchanged, for the same reason `server/waitlist.ts` was extracted for
moderation: three callers now write penalties — the vscore endpoint, the
cancellation path and the nightly sweep — and two copies of a rule drift while
both continue to look like they work.

## Account closure: the promise the product could not keep (2026-08-31)

`constants/policy.ts` promised "You can ask V-HUB to close your account, and
closing it removes your profile." No path existed anywhere in the app, and no
contact address either, so the promise was unactionable twice over — the only
written commitment the product could not keep.

Building it turned out to be almost entirely a question of *what closure means*,
and the answer was already written two lines further down the same policy.

### Deleting would have broken a different promise, and other people's scores

Every table hangs off `profiles` with `on delete cascade`. Deleting a profile
row destroys the profile, the role profile, applications, committed days,
attendance, event reviews, disputes, score deductions, push tokens and
notifications. For an organisation it also destroys every outreach it ever ran,
and everything hanging off those — including **other people's** attendance and
reviews.

The policy already forbade that:

> "Records of events you actually took part in — that you attended, and reviews
> written about that work — are kept, because an organisation's record of who
> worked at its clinic is its record too, not only yours."

And the consequence was worse than a broken promise. A V-Score is now derived by
replaying `event_reviews`. One organisation closing its account would delete
every review it ever wrote, and on the next replay every volunteer who worked
for it would silently lose those events — someone with twelve events, eight of
them with that organisation, drifting back toward 70 and showing four events
attended, with nothing anywhere explaining it. Their upheld disputes would go
too, taking the corrections those disputes were holding in place.

**A warning that applies regardless of this feature: deleting a user from the
Supabase dashboard takes exactly that path.** It is not reachable from the app,
but it is reachable from the console.

### So closure anonymises and revokes

The person is removed; the record of work is kept; the private evidence is
destroyed; the login is banned. What survives is decided by one test — **is this
a record of somebody's WORK, or a record of the PERSON?**

Outreaches, applications, attendance, reviews, disputes and score events are the
first, and are untouched. Names, contact details, photographs, biographies,
skill lists, credential documents, organisation documents, registration numbers,
push tokens and stored notifications are the second, and go.

`v_score` and `events_attended` are deliberately **kept**. They are derived from
the reviews that are being kept, so clearing them would leave the cache
disagreeing with the history the next replay reads.

### The login could not simply be deleted

`profiles.id` references `auth.users(id) on delete cascade`. Deleting the login
would take the entire profile with it and destroy everything the design just
decided to keep.

So the login is **banned** instead — `ban_duration: '876000h'`, which is the
hundred years Supabase's own documentation uses. I checked that the parameter
exists in the installed `@supabase/supabase-js` 2.110.1 rather than assuming it,
so the fallback (scrambling the password) was not needed.

The stored email is scrambled to `closed+<id>@accounts.invalid` in the same
call, and that does two useful things at once: password reset can never recover
the account, and the person's real address is freed, so somebody who closes an
account and later changes their mind can sign up again as a genuinely new user
rather than finding their own email permanently taken.

### The order of operations is load-bearing

1. **Stop the future first.** An organisation's cancellation emails name the
   event, and a waitlist promotion has to reach a real organisation record.
   Anonymising first would send everybody a message from "Closed account" about
   an event nobody could identify.
2. **Destroy the private evidence.** Credentials and organisation documents are
   the one category destroyed outright rather than anonymised, because unlike an
   attendance row they are not a record of anyone else's work — they were only
   ever evidence for a decision already made.
3. **Anonymise.**
4. **Delete the delivery plumbing.** Push tokens left in place would keep
   receiving notifications for an account nobody can sign into.
5. **Revoke the login last.** If anything above fails, the account is still
   reachable and the closure can be retried. Banning first would lock somebody
   out of a half-closed account they could no longer act on.

### No V-Score penalty, and that needed saying in code

Closure withdraws live applications, and penalties went live earlier the same
day. Those withdrawals go through `server/accountStop.ts`, which writes to
`applications` directly rather than through `/api/application-status`, so they
never reach the cancellation deduction. Somebody leaving the platform is not
abandoning an event, and a parting deduction on an account nobody will ever look
at again would be spite. It is now stated in the extracted module rather than
being true by accident of which function calls which.

### The extraction

`stopOrganisation` and `stopVolunteer` moved out of `/api/moderation` into
`api/src/server/accountStop.ts` unchanged. Closure needs exactly the same two
operations, and the asymmetry between them is the same one moderation
documented: an organisation holds other people's Saturdays, a volunteer holds a
place somebody else could have had.

This is the third time this call has been made in the project, after
`server/waitlist.ts` and `server/scorePenalties.ts`, and the reasoning does not
change: two copies drift, and the drift is invisible because both copies still
look like they work — one of them simply stops telling somebody their Saturday
was cancelled.

### An admin cannot close their own account from the app

They do it in the SQL editor, where admins are made in the first place. Beyond
the symmetry, the operational reason: an admin closing themselves through the
app could leave the platform with no administrator at all, the credential and
dispute queues unreachable, and no way back except the SQL editor anyway.

### Where "closed" has to be filtered

The profile row survives, so every surface that treats a profile as a *live
person* has to exclude it: both public profile views (filtered in the migration
itself, because they are `security_invoker = false` and bypass RLS entirely),
the new-match notification pool, the under-subscription escalation pool, and both
admin account searches. Historical rows are untouched — a closed volunteer still
appears in an organisation's past attendance, without a name.

### One knowing limitation

**The avatar's Cloudinary asset is orphaned.** `profiles.avatar_url` stores a
delivery URL rather than a `public_id`, so there is nothing to address a delete
with. The column is cleared, so the image leaves every screen in the app, but
the file itself remains in Cloudinary at a URL nothing links to. Recorded here
rather than left to be discovered. Fixing it properly means storing the
`public_id` alongside the URL, which is a schema change for a small gain and was
not worth bundling into this.

### The policy was rewritten to match

Package H's rule is that if a claim stops describing the code, the claim is the
bug. "You can ask V-HUB to close your account" was wrong twice over — there was
nobody to ask, and now there is nothing to ask, because the app does it. The
section now says plainly that the person is removed, that anything still ahead
is cancelled and the people affected told, and that records of real work are
kept with the name removed — including the reason, which is that other people's
V-Scores are worked out from those same records.

## The migration's own check caught a claim I got wrong (2026-08-31)

`20260908` added `profiles.closed_at` and asserted, in a comment, that the
column "protects itself by construction rather than by a revoke" — because
`profiles` is granted as "revoke the whole table, then grant back the named
columns", so a column added later is not in the list and is not writable.

**That is true of UPDATE and false of INSERT**, and the migration's own
verification said so: `client_write_grants` came back **1** where it asserted 0.

The grant block at the bottom of `schema.sql` does `revoke update on profiles`
and then names six columns. It never revokes INSERT, because the insert path is
what lets signup create the row. Supabase grants `authenticated` a TABLE-LEVEL
insert on everything in `public` by default, and **a table-level grant covers
every column, including ones added years later**. So every server-only column
added to `profiles` since — `closed_at`, and before it `moderation_state`,
`moderation_reason`, `moderated_at` — has been silently settable in the single
insert that creates a profile at signup.

**`profiles` was the only table in the schema with this gap.**
`volunteer_profiles`, `organisation_profiles`, `outreaches`, `applications` and
`disputes` all do `revoke insert ... grant insert (columns)`.

### How bad it actually was

Narrower than the raw number suggests, and worth stating precisely rather than
either minimising or inflating. `profiles_insert_own`'s with-check is
`auth.uid() = id and role <> 'admin'`, so the two attacks that matter were never
available:

- **Closing somebody else's account** — impossible. The insert has to carry the
  caller's own id, and their row already exists, so it would collide with the
  primary key.
- **Reopening a closed account** — impossible. Clearing `closed_at` needs
  UPDATE, and UPDATE *is* correctly column-listed without it.

What was available: a brand-new user could set `closed_at` or the moderation
columns in the one insert that creates their own profile. Closing yourself at
birth is self-harm rather than an attack, and pre-setting `moderation_state`
buys nothing because an admin's later suspension overwrites it. **Nothing was
exposed and no data needs repairing.**

### Why it is still worth a migration

A column list is the difference between "no attack exists today" and "no attack
can exist". The specific risk was forward-looking: the next server-only column
added to `profiles` would have inherited the same hole, silently, with a comment
above it confidently saying it was protected.

`20260909` adds the missing list — exactly `id, role, full_name, email`, checked
against both of the app's insert paths — and revokes anon's write grants for
symmetry with every other table. `schema.sql` carries the same block so a fresh
install is not born with the gap, and `20260908`'s comment is corrected in place
rather than quietly edited, the same treatment `20260903b` got when its missing
RLS was found.

### The lesson

**The verification query was worth more than the reasoning above it.** The
comment was written from a correct general principle applied to the wrong half
of the grant model, and it read as authoritative. The only reason it did not
become permanent documentation of a false claim is that the file asserted a
number and the number disagreed.

Write the check even when the reasoning feels airtight — especially then.

## Rate limiting on the serverless API (2026-09-01)

Queue item 5, and the last unmitigated security gap on the list. Every route in
`api/` is a public URL: anyone who knows the address can send it a request, and
the API will do work deciding whether to refuse them. Until now there was
nothing anywhere that noticed the same caller doing that ten thousand times.

### What the gap actually was

Not stolen data. The access rules were already right, and none of them changed
here. The gap was **cost**, and on a free tier cost is availability.

Every endpoint's first act is to verify the caller's token, and that
verification is itself a network call to Supabase Auth plus a `profiles` read.
So a stranger with no account at all could make this project spend Supabase
Auth requests and Vercel invocations just by sending a stream of POSTs carrying
a junk token. Every one of them would be correctly refused, and every one of
them would cost something. Past the free tier's ceiling the app stops working
for the people it is for.

Three endpoints are worse than the rest, for their own reasons: `/api/match`
can spend Gemini's roughly 1,500-requests-a-day allowance, `/api/document-url`
mints a working link to somebody's identity document, and `/api/vscore` writes
reputation data and replays a volunteer's whole score history.

### Three counters, doing three different jobs

**Per IP address, 120 a minute, across every route.** Deliberately loose. A
single real user of the app makes a handful of these calls a minute at most —
nearly every data read goes straight to Supabase under RLS and never touches
this API — but **dozens of real users in Ghana can share one carrier-grade NAT
address**, so a tight limit here would lock out a whole neighbourhood for one
person's behaviour. This one exists to stop a flood measured in thousands, not
to shape normal traffic.

**Per IP address, 20 a minute, counting only requests that FAILED
authentication.** This is the counter that actually bites, and it can afford to
be strict for a reason worth stating: a working client does not fail
authentication. It holds a live session and refreshes it before calling. So
repeated failures from one address mean a probe or a badly broken client, and
neither needs more than twenty tries a minute. A signed-in user never enters
this counter at all, which is what makes it safe to set low.

**Per signed-in user, per endpoint.** 60 a minute by default, and tighter where
one request costs real money or touches something sensitive: match 20,
document-url 20, upload-signature 20, vscore 30, account-closure 5. These bound
what a single compromised or looping account can spend. Both the default and
the specific limit apply, and the tighter one bites first — the default is a
backstop, not an allowance the specific rule replaces.

### Where it is enforced, and why in three places

- **First statement of every route handler**, ahead of reading the body.
  Without that, a flood of *malformed* bodies would be thrown out by validation
  before any limiter ran, and would never be counted at all.
- **Again inside `authenticate()` and `assertCronSecret()`**, which between
  them every route already calls. This is the belt-and-braces half: a route
  added next month is covered even if whoever adds it forgets the first line.
- Calling it twice in one request **counts once**. A `WeakMap` keyed on the
  request object holds the decision, so the two call sites cannot silently
  halve the limit. Without it, 120 a minute would really have been 60.

The cron route is the one that never calls `authenticate()`, so
`assertCronSecret()` carries the same two counters — otherwise
`/api/cron/event-reminders` would have been the single public URL in this API
with no limit on it whatsoever. A wrong cron secret counts as a failed
authentication, for the same reason a bad token does: it is somebody guessing.

### The honest limitation, which is written into the code

**The counters live in memory, so they are per serverless instance.** Vercel
keeps a warm instance between requests, so a sustained flood from one source is
genuinely throttled — but instances are created and destroyed freely, several
run at once under load, and a cold start begins with an empty count. An
attacker spread across instances gets some multiple of these limits.

This is a real mitigation, not a guarantee, and the module says so in those
words rather than leaving a future reader to assume it is airtight.

The durable version is a small Postgres table plus one atomic function, so
every instance counts against the same row. That is a schema change, which is
gated on the owner's approval, so it is deliberately not done here. It is also
a one-function change when it is approved: the rules, the placement and the
arithmetic all stay exactly as they are — only `hit()` learns to count
somewhere else.

The same limitation is why there are **no daily quotas**, only per-minute
windows. An instance that will not live a day cannot honestly enforce a daily
cap, so the module does not pretend to offer one.

### Fixed windows, and the burst that allows

A window opens on the first request and lasts a minute; the count resets when a
request arrives after it has expired. The known property is a boundary burst: a
caller who spends their whole allowance in the last second of one window and
again in the first second of the next has made twice the limit in barely over a
second. That is accepted on purpose. These limits exist to stop floods lasting
minutes, and a doubled burst across one boundary is still the same order of
magnitude. A sliding window would need the previous window kept and weighted —
more state, more ways to be wrong, for a difference this app cannot feel.

**A refused request still counts.** If refusals did not increment, a caller
hammering the endpoint would sit at exactly the limit and the window would
expire on schedule, which rewards the flood by letting it through as a steady
trickle. Counting refusals means the pressure an attacker applies is the thing
holding the door shut.

### Reading the client's IP, and the header that must be read first

`x-vercel-forwarded-for` is read before `x-forwarded-for`, and the order is the
whole point. Vercel sets its own header and overwrites anything the client
sent; `x-forwarded-for` can carry client-supplied entries. Preferring the
spoofable one would let an attacker rotate a fake address and skip the limit
entirely. When no header identifies the caller at all, everything falls into a
single shared "unknown" bucket — unidentified traffic gets limited together
rather than waved through individually, which is the safe direction to fail.

### What the app does with a refusal

A 429 comes back as an `ApiClientError` with `isRateLimited` true and
`retryAfterSeconds` read from the `Retry-After` header, so a screen can say
"wait a moment" rather than "that failed" — the request was valid and will work
shortly, and those are different things to tell somebody.

One specific case was worth handling: `pingApi()` deliberately sends an
unauthenticated request to `/api/match` and treats the 401 as proof the
deployment is reachable. It now treats a 429 the same way. Only our own limiter
produces one, and it produces it before the handler runs — reporting
"unreachable" would have sent somebody off to check DNS and their base URL over
a limit that clears itself inside a minute.

### The split, and why the arithmetic is tested separately

`lib/rateLimit.ts` is pure: given the window a caller is inside, the rule and
the time, it returns the decision and the window to store back. It reads no
clock and holds no state. `api/src/server/rateLimit.ts` holds the counters, the
IP extraction and the throwing. That is the same split `lib/roster.ts`,
`lib/underSubscription.ts` and `lib/dayCoverage.ts` already follow.

It earns its keep here because window arithmetic is exactly the kind of code
that is wrong by one and looks right. Eleven unit tests pin the behaviour that
would otherwise only be visible under load: that the limit allows exactly N,
that a window does not reset one millisecond early, that `Retry-After` rounds
up and is never zero, and that refusals keep the window open.

## Forgot password: the way back into an account (2026-09-01)

Queue item 6. `app/(auth)/login.tsx` had a "Forgot Password?" link that did
nothing — a deliberate no-op with a TODO on it since Phase 1. Somebody who
forgot their password had no route back into their account by any path: no
screen, no email, and no contact address anywhere in the app to write to.

### What was built

Two screens and one hook file.

`app/(auth)/forgot-password.tsx` is the designed screen
(`design-refs/Forgot Password.png`): back arrow, wordmark, illustration panel,
"Reset Password", one email field, the dark action button, "Back to login".

`app/(auth)/reset-password.tsx` takes the six-digit code from the email plus
the new password and its confirmation, and finishes the job.

`hooks/usePasswordReset.ts` holds the two mutations. It is deliberately
separate from `useAccountSecurity`, which changes the password of somebody who
is **signed in and can prove they know the current one**. This is for somebody
signed out who can prove nothing except that they can read the account's email.
Different problems, different proofs — conflating them is how an app ends up
letting one stand in for the other.

### A code, not a link — and this departs from the design

The design says "Enter your email to receive a recovery link", and that is the
only screen it draws. Whatever happens after the email arrives was never
designed, in either approach, so a second screen had to be invented either way.

**The link route means deep-link plumbing that does not exist yet.** A recovery
link has to reopen the app through the `vhub://` scheme, and the app then has
to pull session tokens out of the URL fragment itself and call `setSession` —
because password recovery genuinely needs the session in order to write the new
password. Nothing in this app parses a deep link today. The one other emailed
link, the login-email change in `useAccountSecurity`, is verified entirely on
Supabase's side; the app only has to reopen, never to read anything out of the
URL. So the link route is new machinery whose failure modes all sit where we
cannot see them: a scheme that differs between the dev client and a real build,
Android mail clients that treat custom schemes inconsistently, and a redirect
allowlist that fails silently by falling back to the project's Site URL.

**A code is typed into a screen we control.** It behaves identically in the dev
client and in a production build, needs no allowlist entry, and the flow never
leaves the app. The layout the design does specify is unchanged; only the word
"link" becomes "code".

**What it costs, and this is the one thing that needs doing outside the code:**
Supabase's default recovery email template contains only the link. The template
must include `{{ .Token }}` or the email arrives with no code in it and the
screen cannot work. That is one line in Authentication → Email Templates →
Reset Password.

**That line could not be added for a month, and the reason turned out to be the
bigger story.** Supabase locked email-template editing for new free-tier
projects on its own mailer, so the field was not editable at all. Unpicking
that surfaced a much larger problem sitting underneath it - see "Email
delivery" at the end of this document. The template line is in place as of
2026-09-01 and the reset flow works as designed.

If the link route is preferred after all, the change is confined to one screen
plus the deep-link handling — the request half is identical either way.

### The code and the new password are on ONE screen, on purpose

Verifying the code **signs the person in**. At that instant they hold a real
session, opened with a code from an email rather than a password. Splitting the
steps across two screens would create a state where somebody is signed in on a
recovery code and has not yet chosen a password — worth not having at all.
Asking for both at once makes the verification and the new password a single
submission, so that state never exists.

The auth guard leaves the screen alone while this happens. `AUTH_ENTRY_SCREENS`
in `useAuthGuard` is welcome/login/register only, so a session appearing
mid-flow does not yank the user into their tab group before the password is
written. That exclusion already existed for the onboarding wizard, which needs
it for exactly the same reason — this is the second thing to rely on it, and
neither needed a change to make it work.

On success the screen sends the user to the root rather than to a role home, so
the guard routes them the way it routes any other sign-in — including a
volunteer whose onboarding is unfinished, who belongs on welcome and not in the
tabs.

### What is deliberately not revealed

`resetPasswordForEmail` succeeds whether or not the address has an account, and
the screen says something true either way ("if that address has a V-HUB
account…"). An app that answered differently for a known address would let
anybody test whether a particular nurse has signed up here. It is the same
reasoning as `/api/document-url`'s flat 403.

The same applies to a bad code. Supabase reports a wrong code, a used code and
an expired one with one message, and the screen keeps them as one message:
telling somebody which of the three it was tells a stranger the same thing.

### Two smaller things

**The illustration is drawn, not dropped in.** The design's artwork is not among
the exported assets, and a stock illustration would put a look in the app that
exists nowhere else in it. The panel uses its own tinted ground, two off-edge
discs and one icon from the family every other screen draws from — the same
treatment the no-flyer outreach banner already uses.

**The validation messages are derived from state, not written into it on
submit.** That is the Create Outreach wizard's bug, fixed there in August: a
snapshot taken at submit time leaves a message on screen describing a field the
user has since corrected.

### Not built, and worth knowing

Supabase limits how often it will send a recovery email — a handful an hour on
the free tier's built-in mailer. That error is surfaced as-is rather than
softened, because "try again later" is the only honest thing to say and the
user needs to know the email is not simply lost. There is no in-app throttle on
top of it: a second one would have to guess at a number Supabase already knows.

---

## Email delivery - the Gmail SMTP route (2026-09-01)

Everything in this section came out of a single question: why could the
password-reset template not be edited? The answer was a Supabase policy change,
but chasing it uncovered that **no V-HUB email had ever reached anybody except
the project owner**, in either of the two independent systems that send it.

### There were two email systems and both were broken, in different ways

**Supabase Auth** sends the signup confirmation, the password recovery code and
the login-email-change confirmation. These never touched Resend. They went
through Supabase's own built-in mailer, which **refuses to deliver to any
address that is not a member of the project's team** and rate-limits to two
messages an hour. Because "Confirm email" is ON, the consequence was not a
degraded feature but a closed front door: **a stranger could not register at
all.** They submitted the form, an auth user was created, no email arrived, and
they were left on "Check your email" with no way forward and nothing on screen
to explain it.

**The V-HUB API** sends the application decision emails, the waitlist promotion
and the outreach-cancelled notice. Those went through Resend. Resend will only
send from a verified domain; without one the single usable sender is
`onboarding@resend.dev`, which delivers **only to the address the Resend account
itself was registered under** and refuses every other recipient with a 403.

**Neither failure was visible anywhere.** Both API send paths log the error and
swallow it - correctly, because a Resend outage must never fail an accept
decision that the database has already recorded - so total, permanent delivery
failure looked exactly like everything working. This is worth stating plainly
in the report: the fault was not in any of the code, and no test could have
caught it, because every component behaved as designed.

### The decision: no domain

A verified domain would have fixed both systems at once and is the correct
answer for a production service. It was ruled out on cost - this is a free-tier
project throughout, and a recurring registration fee is not part of it.

That constraint eliminates Resend entirely, because Resend has no usable sender
without one. The remaining free option is a mail server that will accept us on
account credentials alone, which in practice means Gmail.

**A dedicated Google account was created**, `vhub.notifications@gmail.com`, with
the account name set to V-HUB and 2-Step Verification enabled so that an app
password could be generated. A dedicated account rather than a personal one for
two reasons that happen to agree: a Google **app password** grants full access
to the mailbox it belongs to - read as well as send - so pasting one into two
dashboards should never expose a personal inbox; and a clean account keeps the
project's sending reputation separate from anybody's ordinary mail.

### What changed, in two halves

**Supabase's half is configuration only.** Custom SMTP now points at
`smtp.gmail.com:465` authenticated as that account. This lifted all three
limitations in one move: delivery to any address, the hourly cap raised from
two, and - the original question - **email templates became editable again**,
because the lock only ever applied to Supabase's own mailer. `{{ .Token }}` went
into the recovery template and the six-digit reset flow works as built.

**The API's half replaced Resend with `nodemailer`.** `server/resend.ts` became
`server/email.ts`, and a new `server/mailer.ts` holds the transport. **Not one
word of any email changed**: the module was already split so that `subjectFor`
and `bodyFor` build the content while the exported functions send it, so the
swap touched the transport and nothing else. `resend` came out of
`api/package.json` - which removed eighteen packages - and `RESEND_API_KEY` /
`RESEND_FROM` were replaced by `GMAIL_USER`, `GMAIL_APP_PASSWORD` and an
optional `MAIL_FROM_NAME`.

Two things improved on the way through rather than merely being ported:

- **A failed message no longer takes the batch down with it.** The Resend
  implementation posted up to 100 messages as one `batch.send` inside a single
  try/catch, so one bad address discarded every remaining message in the chunk,
  silently. SMTP has no batch verb, so the replacement is a loop over one
  pooled connection with each message its own attempt. An organisation
  accepting forty applicants can no longer lose thirty-nine emails to one
  malformed address.
- **A stale pooled connection is retried rather than reported as a lost
  email.** A connection cached on a warm serverless instance can be frozen
  between invocations and dead on the next one while still looking open. Every
  send now retries once through a rebuilt transport, which is
  indistinguishable from a real failure at the call site otherwise.

**The sender address is not a setting and cannot be one.** Authenticating to
`smtp.gmail.com` as one account and sending as another makes Gmail overwrite
the From header with the authenticated address, unless the other address is a
verified "Send mail as" alias - and verifying an alias means proving control of
a domain, which is the thing being worked around. Only the display name is
ours, which is why `env.mailFrom` composes `"V-HUB" <the gmail address>` rather
than reading a whole address from an environment variable that could be set to
something Gmail would silently rewrite.

### The confirmation link had nowhere to land

Supabase sends every auth email's link to the project's **Site URL**, which was
still `http://localhost:3000`. A volunteer clicking "confirm your email" landed
on a browser connection error. Their address **was** confirmed at that moment -
Supabase verifies the token before redirecting - but everything visible said
the app was broken, and the natural response to that is to give up rather than
to go back and log in.

The project has no website. The only address available to point at is the
Vercel deployment serving the API, whose root returned a bare 404, which is no
improvement. So `api/src/app/page.tsx` was added: one static page at that root,
in the app's own palette, saying the address is confirmed and to go back to the
app and log in.

**The mark on it is the real logo, and it is not a second copy of the file.**
`api/tsconfig.json`'s `@/*` alias points at the repo root and
`outputFileTracingRoot` already declares that root in scope for Vercel's
bundler - the arrangement that lets this project import the single copy of the
scoring math rather than mirroring it. The page imports `assets/logo.png`
through it, so it renders the same file every screen in the app renders, and a
future change to the logo reaches the page without anybody remembering to
update it. The conventional answer, a copy under `api/public/`, was rejected
for the usual reason: two copies of an asset are two things to keep in step,
and the one nobody looks at is the one that goes stale. It is drawn with a
plain `<img>` from the static import's `.src` rather than `next/image`, which
would route a fixed-size logo through Vercel's metered image optimiser to no
benefit; the static import already yields a content-hashed, immutably cached
URL.

**It confirms nothing itself** - by the time the browser arrives, Supabase has
already done the work - which is why it is safe as a plain page with no session
and no Supabase client of its own. Two details are deliberate. It **reads the
error out of the URL before asserting anything**, because an expired or
already-used link is the likeliest non-success and telling somebody their
address is confirmed when it is not sends them to a login that will refuse them
for no visible reason. And it **clears the URL fragment** after reading it: a
successful confirmation arrives with real session tokens in the fragment, and
leaving them in the address bar puts working credentials into browser history -
the same instinct as never storing a signed document URL.

### Stated limitations

These are consequences of the no-domain decision, not defects, and they belong
in the report as such.

**A hard daily ceiling of roughly 500 recipients per rolling 24 hours.** That is
a free Gmail account's limit; some sources put the figure for SMTP specifically
lower. It counts **recipients**, not messages, and it is a rolling window rather
than a midnight reset. Supabase's auth emails and the app's own emails now draw
on the same allowance. Nowhere near binding at this project's scale - a busy day
is tens of messages - but it is a real ceiling, and V-HUB could not be operated
at national scale on it without moving to a domain and a proper provider. Moving
would be a change of transport only: `server/mailer.ts` is the single place that
would change.

**Deliverability is materially worse than a branded domain would give.** Mail
sent through Google's servers from a real Gmail address carries valid SPF and
DKIM and aligns with DMARC, so none of it is forged-looking and none of it is
rejected outright. The residual risk is filtering, and it falls unevenly:

- The **signup confirmation is the most exposed message in the system**, and it
  is the one gating registration. It goes to somebody who has never heard from
  the sender and it contains a link - the shape of a phishing email, scored
  accordingly - and institutional mail systems (`ug.edu.gh`, hospital and NGO
  domains, precisely V-HUB's users) filter harder than consumer Gmail.
- The **display name says V-HUB while the address says gmail.com**. Legitimate
  services rarely do that and impersonation does it constantly, so filters
  weight the mismatch.
- A **new account has no sending reputation**, and Google may throttle one that
  suddenly emits bursts of near-identical automated mail.
- The **password reset code is the least exposed of them**, because the
  code-not-link decision means that email contains no clickable link at all.
  That choice was made for deep-linking reasons and turns out to help here too.

What reduces it, and was done: the dedicated account with a consistent display
name, low and unbursty volume, plain-text bodies with no links beyond the one
Supabase requires, and a spam-folder line on both screens that wait for an
email - `reset-password.tsx` already had one, and the register screen's
confirmation state was given the same wording. What cannot be had without a
domain: DMARC alignment with a V-HUB domain, a branded sender, and a warmed
domain reputation.

**One operational trap worth recording.** Changing that Google account's
password revokes every app password it has issued. All V-HUB email - the app's
and Supabase's alike - stops at that moment, and the failure looks like Supabase
breaking rather than like a revoked credential. Recovery is generating a new app
password and pasting it into both Supabase's SMTP settings and Vercel's
`GMAIL_APP_PASSWORD`.

## Notification retention: the table that only ever grew (2026-09-08)

**Build-queue item 10.** `notifications` had no expiry, no delete policy and no
cleanup of any kind. Every accepted application, every reminder, every
escalation and every high-match scan wrote rows and nothing had ever removed
one. The fan-out writers are what make that a real problem rather than an
untidy one: a `new_match` scan writes one row *per matching volunteer per
outreach*, and the under-subscription ladder does the same up to three times
for a single event. The row count therefore grows with volunteers multiplied by
outreaches, not with either on its own — and on a free-tier database that shows
up as a bill and a slow Notifications screen, both of which arrive without
announcing themselves.

**What was built.** `lib/notificationRetention.ts` (pure, 9 tests) holds the
window arithmetic and the safety filter; `api/src/server/notificationRetention.ts`
does the queries; the sweep is now the **sixth pass of the existing nightly
cron**. No migration, no schema change, no new dependency.

**The retention window is 180 days.** Six months. The screen groups by day and
is read by scrolling from the top, so nobody reaches back half a year — and
nothing that matters is reachable *only* through a notification. An accepted
application is in `applications`, a verification decision is in
`volunteer_profiles`, a deduction is in `score_events`, and each has its own
screen. The window is about the size of the table, not about hiding anything.

**The trap, and it is the whole reason this needed care.** A row in
`notifications` is two different things at once. It is a message somebody may
want to read — and, for two of the cron passes, it is the *only* memory that a
notification has already been sent. `sendCheckinReminders` and
`escalateUnderSubscribedOutreaches` both dedupe by reading their own rows back
(`data->>'stage'`, plus the outreach day id). Delete one of those while it is
still doing that job and the pass sends the notification a second time — a bug
that would surface as duplicate pushes to real volunteers, weeks after the
deletion that caused it, with nothing on any screen connecting the two.

**Two independent defences against it, not one.**

1. **A row attached to an unfinished outreach is never deleted, whatever its
   age.** "Unfinished" is decided by reading `outreach_days` for a day on or
   after today — never `outreaches.date`, which is only the FIRST day and would
   call a four-week campaign finished on the evening of day one. If that check
   cannot be run at all, the sweep fails closed and protects everything: skipping
   a night of cleanup costs nothing, and deleting a live marker pushes a
   duplicate to a real person.
2. **The sweep runs LAST in the cron**, after every pass that reads this table.

The age test alone would very probably have been enough — a stage marker is
written at most 7 days before the day it covers, and the window is 180. But
"very probably" is the wrong standard for a destructive job that runs unattended
every night against campaigns of unknown length.

**It deletes by id in bounded batches rather than with one `where created_at <
cutoff`.** The single-statement version is shorter and is wrong twice: it takes
an unbounded lock inside a function that has five other passes to finish, and it
has no way to express the protection rule above. 500 rows per batch, 20 batches
per night; a table that is behind catches up over consecutive runs.

**Pagination skips kept rows by offset, not by a `created_at` cursor**, and that
is a deliberate correction of the obvious approach. `notifyUsers` writes a whole
fan-out in ONE batched insert, so hundreds of rows share a timestamp to the
microsecond — a strictly-greater cursor would step over the rest of that group
and leave it permanently unswept. Deleted rows vanish, so after each batch the
oldest remaining rows are exactly the ones that were protected; skipping that
many is what stops the next batch re-reading them forever.

**A dry run exists, and it is not decoration.** The real window is six months
and this repository is younger than that, so on the live database this pass will
find nothing to do until well into 2027. Without a way to exercise it, a
destructive job would sit unverified for months and then run for the first time
unattended. `POST /api/notifications { "action": "sweep-notifications",
"dryRun": true, "retentionDays": 30 }` reports exactly what it would remove and
removes nothing. **`retentionDays` is ignored unless `dryRun` is true** — so it
is possible to ask what a shorter window would take without creating any way to
actually take it. Cron-secret protected, like every other pass that writes other
people's rows.

**Known limitation, stated rather than left to be found.** The batch query
(`created_at < cutoff`, ordered ascending) is not served by the existing
`(user_id, created_at desc)` index, so it is a sequential scan. That is accepted:
it runs once a day, off every user's request path, and nobody waits on it.
Adding an index would be a gated schema change for a job with no reader.

## Per-day hours: the columns that had never had a writer (2026-09-08)

**Build-queue item 11.** `outreach_days.start_time` and `end_time` have existed
since the multi-day migration in August, and have always meant "this day runs to
its own hours" with NULL meaning "the same as the event". `dayStartTime()` and
`dayEndTime()` have always read them, and the day picker and the day-release
sheet have always displayed them. **Nothing in the app could ever set them.** A
campaign whose Saturday ran a half day could describe every day as running the
same hours or say nothing at all.

**No migration.** The columns exist, and both are already in `outreach_days`'
INSERT and UPDATE grant lists (`20260818_multi_day_app_support.sql`). This is
entirely app-side work: `lib/outreachDays.ts`, the day field, the two
organisation forms, one new hook, and two detail screens.

### The one design decision that mattered: one structure, not two

The form used to hold `days: string[]`. The obvious way to add hours was to
leave that alone and hang a `Record<day, hours>` beside it. **That is the same
mistake this project refuses everywhere else** — there is no `is_multi_role`
boolean, no `is_multi_day` flag, for exactly this reason: two things that must
agree will eventually disagree. Here the disagreement has a specific and nasty
shape. Remove a day from the list and its hours stay behind in the map; add a
different day later and, depending on how the map is keyed, those orphaned hours
silently apply to it. Nobody would connect the two actions.

So a day in the form is now one object — `OutreachDayDraft { day, startTime,
endTime }`. Removing the day removes its hours because they are the same value.

**NULL is not "unset" and must never become an empty string.** On the outreach
itself, `''` is the form's way of saying no time has been chosen. On a day, NULL
is the database's way of saying "run to the event's hours" — the ordinary state
of every day of almost every outreach. Flattening one into the other would make
every normal day look like an override that had been deliberately cleared.
`trimClockSecondsOrNull` exists solely to keep them apart.

### Why the control is hidden until it is asked for

The straightforward build is a start and an end picker on every day chip. On a
twenty-day campaign that is forty controls, for a case that almost never arises,
and — worse — it invites every organisation to fill in hours they had no
intention of varying. A day is therefore a chip until it is tapped, and tapping
one opens a panel for that day alone. The panel names the hours the day will
inherit, so the ordinary answer is visible without being editable by accident,
and clearing an override is one button rather than blanking two fields.

The label inside the chip is the control that opens the panel, not the whole
chip. The remove cross lives inside the chip too, and a Pressable wrapping
another Pressable turns a mis-tap on the cross into "open the hours panel".

### Why the write is separate from `save_outreach()`

`save_outreach()` is one transaction because `outreaches.role_type` and
`slots_total` are DERIVED from the role rows: a role write that failed after the
details had been saved left an outreach enforcing a requirement it no longer
stated. **Nothing on `outreaches` is derived from a day's hours.** They are an
override, read through `dayStartTime`/`dayEndTime`, and a write that fails
leaves every day inheriting the event's hours — which is visible on the screen,
fixable in the editor, and is exactly the state the outreach was in a moment
earlier. This is the same call the event gallery makes, and it avoids widening
the RPC's signature, which would be a gated migration for a write with nothing
to keep in step.

**`useSetOutreachDayHours` does one UPDATE per changed day and deliberately not
an upsert.** `.upsert(payload, { onConflict: 'outreach_id,day' })` compiles to
`ON CONFLICT DO UPDATE SET` over every payload column including the conflict
columns — and `outreach_id` is deliberately absent from `outreach_days`' UPDATE
grant list, because a day may be re-timed but never moved to another event. The
upsert would fail with `permission denied for table outreach_days` on a call
that reads perfectly reasonably. This is the `.upsert()` rule in CLAUDE.md
biting for the second time.

**Day one always needs a follow-up write.** `trg_outreaches_default_day` creates
that row inside the outreach's own transaction and always with null hours, so an
override on day one cannot ride along with an insert the way days 2..n can. On
the create screen the hours are therefore written for every overridden day, day
one included; re-stating days 2..n is a no-op update and means one place owns
this rather than a rule about which day came from which path.

**Clearing an override is a write of NULLs, not an omission.** `changedDayHours`
returns cleared days carrying nulls. Filtering them out for "having no hours"
would make removing an override work in the form and change nothing in the
database — the failure that looks like the feature working.

### The reader that had to exist with the writer

Building the setter alone would have left the app contradicting itself. The
volunteer's outreach detail printed `Oct 3 – Oct 6 · 9:00 AM – 3:00 PM`, and
that middle dot is a claim about all four days. The moment one day overrides,
it is a confident false statement on the screen a volunteer decides from.

Both detail screens now ask `hoursVaryByDay()` before printing a range, and say
**"Hours vary by day"** where they differ; the per-day detail is in the day
picker and the release sheet, which have read the real per-day hours all along.
The helper compares the RESOLVED hours rather than merely checking whether an
override exists — a day that overrides with exactly the event's own hours varies
from nothing, and announcing a variation nobody can see is worse than silence.
The hint under the time pickers on both forms changed from "These hours apply to
every day of the outreach" for the same reason: it had stopped being true.

### Buckets

- **Built and working:** the day-draft model, the per-day hours panel, both
  write paths (create and edit), the "Hours vary by day" summaries, 22 new unit
  tests. 510 tests / 17 suites green, both typechecks clean.
- **Built but untested on a device:** the panel's layout on a narrow phone, and
  the native time picker opening inside the day list rather than beside the
  event's own time fields.
- **Not built:** nothing from this item. Per-day hours are complete.

## Error monitoring: knowing before the user tells you (2026-09-08)

**Build-queue item 9.** An endpoint failing in production was invisible.
`errorResponse()` — the one function every route's catch block ends in — reacted
to an unexpected error with a single `console.error` string and nothing else. On
Vercel's Hobby plan, runtime logs are a live tail with roughly an hour of
retention and no alerting on them, so a route that started failing at two in the
morning left no trace by breakfast. The way anybody found out was a volunteer
saying the app did not work.

**What was built.** `lib/errorMonitor.ts` (pure, 13 tests) holds the grouping and
throttling; `api/src/server/errorMonitor.ts` holds the counters, writes the log
line and sends the alert. No migration, no schema change, no new dependency, and
no service signed up to.

### It hangs off one function, and that is the whole design

Every route handler in `api/` already ends with `return errorResponse(err)`.
That makes it the complete set of places a failure becomes a response — so
observing there means a route added next month is monitored without anybody
remembering to add anything. The same argument put the rate limiter inside
`authenticate()` rather than in twenty route files. The only change to the
routes themselves is that each now passes its `req` along, so the record can
name which endpoint failed.

### It ships switched off, deliberately

With no `ALERT_EMAIL` environment variable set, **nothing is sent**. The only
difference in production is that the log line becomes structured JSON instead of
prose. Turning alerting on is one variable in the Vercel dashboard and needs no
deploy.

This is not caution for its own sake. Whether an inbox should be receiving
production alerts is an operational decision about a real mailbox, and it does
not belong committed in a repository — nor should it wait on a code change when
the answer changes.

### Only 5xx alerts. Everything is logged

A 400, 401, 403, 404, 409 or 429 is **the API working**: refusing a malformed
body, an expired token, somebody else's document, a flood. Alerting on those
would produce a steady trickle of mail about normal operation, and the one
message that mattered would arrive in the middle of it and be ignored. A 5xx is
the only class that means "this failed and it was our fault".

Every status is still written to the log, though, because that is what makes
"how often is this 403 actually happening?" a question with an answer. The line
is one piece of JSON behind a `[api-error]` tag, so it can be filtered on a
field rather than grepped for a substring.

### The fingerprint is what makes the throttle work at all

Alerts are throttled to one per kind of failure per fifteen minutes. That only
means anything if two occurrences of one bug are recognised as the same kind —
and raw messages are not, because they carry the row id, the port, the column
name that differed on that request. So uuids, quoted values and bare numbers are
normalised out before grouping.

Without that step every occurrence is its own kind, the throttle never engages,
and a broken endpoint still sends one email per request: hundreds of identical
messages, straight through a Gmail allowance shared with the app's real mail,
drowning the very notification they were meant to be.

The suppressed count travels with the next alert ("14 more of the same since the
last alert"), so throttling hides nothing. A first occurrence always alerts —
the point is to hear about a new fault immediately, not after a window.

### Where the line is drawn on what leaves the server

**The user id goes in the log and never in the email.** The log stays inside
Vercel, which is already the owner's; the email leaves for a third-party
mailbox. An opaque uuid is not much, but "not much" is not a reason to send it
somewhere it does not need to go — and it is only useful next to the database it
resolves against anyway. `authenticate()` records the caller in a WeakMap keyed
on the Request, the same arrangement `server/rateLimit.ts` already uses, so the
entry disappears with the request and nothing has to clean it up.

**A validation error's flattened detail is not recorded at all.** It echoes the
request body back, and on these endpoints that body can contain a dispute
statement or a rejection reason — somebody's own words, in a log they never
agreed to be in. The alert email carries the route, the code and the message,
and says in its own text that it carries nothing else on purpose.

### Two failure modes it must not have, and does not

**It must not take down what it observes.** `observeError` is called from inside
the function that turns errors into responses, so an error there would replace a
clean 500 with a crash. It cannot throw.

**A failed alert must not become an alert.** If the email cannot be sent, that is
one plain log line and nothing more — otherwise a mail outage becomes a loop of
failures about failing to report failures.

The send runs inside Next's `after()`, so a failing request is not also a slow
one. A floating promise would not do: Vercel may freeze the instance the moment a
response is returned, and the email would go out on some later request or never.

### Known limitation, stated plainly

**The counters are in memory and therefore per serverless instance** — the same
limitation `server/rateLimit.ts` documents and accepts. Several warm instances
mean a widespread fault can send one alert per instance rather than one in total.
That is noisier than intended and never quieter, which is the right way round for
something whose job is to tell you about a fault. The durable version is a
Postgres table, which is a gated schema change and deliberately not taken.

### Buckets

- **Built and working:** structured logging on every failure, fingerprinting,
  throttling, the alert email, the caller WeakMap, 13 unit tests. 523 tests / 18
  suites green, both typechecks clean, `api` builds.
- **Built but unproven in production:** the alert email itself, because it
  requires `ALERT_EMAIL` to be set in Vercel and a real 5xx to occur. The
  structured log line takes effect on the next deploy either way.
- **Not built:** anything durable across instances, and any dashboard. Both need
  either a dependency or a schema change, and both are gated.

## Continuous availability: the matcher stops judging a campaign by its first day (2026-09-08)

**Build-queue item 8, owner-approved.** The availability component of the match
score was all-or-nothing, and worse than that description suggests. It read
`outreaches.date` — the FIRST day of the event — and nothing else.

**What that actually meant on a multi-day event.** A twenty-day campaign starting
on a Monday: a volunteer free on Mondays scored the full 15 availability points
regardless of the other nineteen days, and a volunteer free for days two through
twenty scored ZERO. Neither number described anything real about either person.
The whole multi-day subsystem — day rows, per-day commitment, per-day attendance,
per-day release — had been built around the fact that people take part in some
days and not others, and the matcher was still asking a yes-or-no question about
one date.

### The rule

The availability component is now **the share of the outreach's days the
volunteer is free for**, scaled so that covering half of them or more scores a
full 1.0. Below that it is proportional: 1 day of 4 scores 0.5, 3 days of 20
scores 0.3.

A day counts as covered on the same test as before — the volunteer holds a
`"{weekday}_{slot}"` token whose weekday matches that day and whose slot overlaps
that day's hours. What changed is that the question is now asked once per day and
the answers are averaged, rather than being asked once about the first day.

**Neither extreme was acceptable, and this is why the shape has a cap in it.**
Requiring every day would exclude precisely the Saturday-only nursing student
this platform exists to include. Accepting any single day would score 1-of-20
identically to 20-of-20, which is the thing the change was asked for. And an
*uncapped* fraction would be wrong in a third way: a volunteer who can give ten
days of a twenty-day campaign would get half marks for a substantial, real
commitment — a statement about how long the event is, not about the volunteer.
That is the same error the V-Score avoided when it decided to compute an outcome
once per event rather than once per day.

**Why half, specifically.** It has to be high enough that covering more days
genuinely helps, or the change achieves nothing. It has to be low enough that
somebody giving a serious share of a long campaign is not filed as a partial
candidate. And a half is the value that needs no argument about which side of it
anybody falls on: covering most of an event is full availability, covering a
minority is scored on the share. The constant is `AVAILABILITY_FULL_COVERAGE` and
a test pins it, so changing it has to be a deliberate act rather than a silent
re-ranking of every multi-day feed in the app.

### The property that made this safe to ship

**No score on a single-day outreach moves, at all.** With one day the coverage is
1 or 0, and the scaling leaves both values exactly where they were. That is not a
happy accident of the arithmetic — it is the reason this could be a pure code
change with no recompute, no migration and no backfill, and there is a test
asserting it. All 89 pre-existing matcher tests passed unchanged.

The same property protects a caller that has not loaded the day rows. An omitted
or empty day list means **"not loaded", never "this event has no days"** — every
outreach structurally has at least one row, so an empty list can only mean a read
that did not happen. The scorer then falls back to `date` as the single day,
which is precisely the old behaviour. A failed day query therefore degrades to
what the app did yesterday, rather than scoring everybody at zero.

### Two decisions inside it worth naming

**Each day is judged against its own hours.** This is the reader that the per-day
hours work needed. A campaign whose Saturday runs 5pm–9pm while the rest of the
week runs 9am–3pm is a genuinely different question for a Saturday-morning
volunteer than for a Saturday-evening one, and a single event-wide time window
could not express that at all.

**A day whose date cannot be parsed is excluded from the denominator, not counted
as unavailable.** If the date is malformed we cannot tell which weekday token to
look for, so it is a day we cannot judge — and treating a number we do not have
as a bad one is exactly the mistake the removed `DEFAULT_MISSING_SUBSCORE`
constant made in the V-Score. Charging a volunteer availability points for the
organisation's typo would be that error again. If no day at all is judgeable the
function still fails closed at 0, which is the long-standing behaviour for an
outreach with no usable date.

### Where the days come from

`fetchDaysByOutreach` in `api/src/server/outreachInput.ts`, beside the existing
`toOutreachInput` mapper and for the same stated reason: five call sites need it,
and five copies of a query is five places for one to fall quietly behind. (That
mapper's own comment records a real bug of exactly that kind — an earlier copy
omitted `role_type` and silently disabled the support-role category override.)

It is **one batched query per set, never one per outreach** — the ranked feed
scores every open outreach in a region, so a per-row query would turn one request
into dozens. A failure logs and returns an empty map, which degrades each affected
outreach to first-day scoring; the same call `fetchRolesByOutreach` already makes
for roles, on the same reasoning that a feed with slightly coarser scores beats no
feed.

Wired into all four `/api/match` paths (applicant scoring, the single-application
explanation, the ranked feed, and the new-match notification scan) and into the
under-subscription escalation. That last one matters more than most: an escalation
happens precisely because a long event is short of people, and judging every
volunteer on its first day alone is what made a Saturday-only student invisible to
a campaign with three Saturdays in it.

### One duplication, deliberate and cross-referenced

The day-hours inheritance rule (`day.start_time ?? outreach.start_time`) is
restated inside `layer1.ts` rather than imported from `lib/outreachDays.ts`, where
it canonically lives. `layer1.ts` deliberately imports nothing but types and one
constant — it is consumed by the serverless API — and importing `outreachDays`
would pull a `components/` path into that bundle for a single `??`. Both sites say
so and name each other, so if the rule ever changes it cannot be changed in one
place only.

### Two documentation claims that had gone stale

The prompt asked me to fix a contradiction in CLAUDE.md and to check for others.
Both found:

1. **The one reported.** One line called continuous availability "still gated and
   NOT built"; the very next paragraph called it "gated, approved, not yet
   implemented". Both were true when written and neither was updated when the
   other changed. Replaced with a single accurate paragraph, plus a standing note
   that when a gate opens or closes, every mention of it in the file has to be
   searched for — a stale second statement is worse than none, because it makes
   the reader stop and work out which line to trust.
2. **A second, of the same kind.** The admin-role section still said "the review
   queues are packages B onwards and are NOT built" — while the same file carries
   nine section headings reading "package B ... built 2026-08-25" through
   "package J ... built 2026-08-26". Corrected.

**And one claim in the app itself.** The Info Hub told volunteers they get "full
points when the event falls in a day and time slot you marked yourself free for" —
which stopped being true for multi-day events the moment this shipped. It now
explains the share and the half-way cap in plain words, and says that being free
for some of a long event is always worth more than none. Package H's rule is that
a claim which stops describing the code is the bug, and that applies to the copy
explaining the matcher as much as to the privacy policy.

### Buckets

- **Built and working:** the continuous availability rule, per-day hours in
  scoring, the batched day loader, all five call sites, the CLAUDE.md and Info Hub
  corrections. 11 new tests; 534 tests / 18 suites green, both typechecks clean,
  `api` builds. The 89 pre-existing matcher tests pass untouched, which is the
  evidence that single-day scoring did not move.
- **Built but unproven against real data:** whether multi-day feed rankings *look*
  sensible to a person, which needs the device round being held. Nothing about the
  weights or the other four components changed, so any movement is confined to
  multi-day events.
- **Not built:** nothing from this item.

## Lint cleanup, and the real bug hiding in it (2026-09-08)

**Build-queue item 13, deliberately last** because it touches many files and
doing it earlier would have guaranteed merge noise against everything above it.
The app went from **47 errors and 7 warnings to zero**, and `api/` — which had
never been part of the tracked baseline — from 2 errors and 14 warnings to zero.

Nothing here was expected to change behaviour. One finding did, and it was a
genuine crash waiting to happen.

### The one that was not cosmetic: three hooks called after an early return

`app/(volunteer)/outreach/[id].tsx` called `useApplicationDays`,
`useMyLateReleaseCount` and `useReleaseCommittedDay` **below** its
`if (outreachQuery.isLoading) return ...` and `if (outreachQuery.isError) return
...` blocks.

**Why that is a bug rather than untidiness.** React identifies hooks purely by
the ORDER they are called in. While the outreach was loading, the component
returned early and those three hooks were never reached; on the render after the
query resolved, they suddenly were. React then sees a component that called three
more hooks than it did last time, which is the "rendered more hooks than during
the previous render" crash — and the near misses, where it does not throw, are
state read from the wrong hook entirely.

It only ever appeared to work because the early return happened to unmount the
subtree before React compared the two lists. This is the volunteer's outreach
detail screen: the one every application is made from.

**The fix was a move, not a rewrite.** Nothing in those three lines depends on
`outreach` — only on `application`, which is resolved well above the early
returns. They now sit there, with a comment saying why they must stay and what
happens if anyone moves them back down. `canChangeDays` genuinely does read
`outreach`, and it stays below.

### `useRef(new Animated.Value(0)).current` — 18 of the 27 ref errors

The long-standing React Native idiom for an animated value reads `.current`
during render, which React's current rules refuse outright. Replaced throughout
with `useState(() => new Animated.Value(0))`: the lazy initialiser constructs the
value exactly once and the instance is stable for the life of the component,
which is the entire guarantee an `Animated.Value` needs. No ref is read during
render and nothing about the animations changed. Toast, ListSkeleton,
FlyerBackground and the welcome carousel.

### The remaining ref errors: a handler factory called during render

Create Outreach measured each field's position with
`onLayout={captureFieldTop('title')}` — a function **called during render** whose
body writes a ref. React's rule is that refs may be touched in event handlers but
not during render, and from the outside those two are indistinguishable here: the
call happens in render even though the write happens later on layout.

`captureFieldTop` now takes the field *and* the event, and each of the nine sites
passes an inline arrow. The ref write is now unambiguously inside the handler,
which is where it always actually ran.

### `Date.now()` in a component body, and a duplicated rule

The admin organisation queue computed "how many days has this been waiting" twice
from the same date: once as words, once to decide whether to show an overdue
badge. Two copies of one rule are two chances for them to disagree — an "overdue"
badge beside the words "Submitted today" would have been the visible result.

Now one `daysWaiting()` helper feeds both. It still reads the clock, and that is
inherent to the question; it lives outside the component with a note saying that
a re-render turning a 6 into a 7 is the answer being right, not the component
being unstable.

### Where I suppressed instead of refactoring, and why

Twelve `react-hooks/set-state-in-effect` errors remained, and they are all the
same legitimate shape: **local state seeded or reset from something outside
React** — a resolved query, a route parameter, a `visible` prop — where the
user's own edits must survive afterwards.

React's suggested alternative is to adjust state during render behind a sentinel
value. That is a real refactor of each of the twelve, and each of these effects is
already tuned against a specific failure that its own comment names: *"a plain
'set it every time days changes' would snap the organiser back to today every
time the query refetched, mid-way through marking day two."*

**Rewriting twelve carefully-tuned state-seeding effects across the organisation
screens, while the device test round is on hold and none of it can be checked by
hand, is exactly the wrong trade for a cleanup whose whole premise is that
behaviour does not change.** So the rule is disabled **at each site with its own
one-line reason**, never in the config. A new, accidental setState-in-effect
anywhere else in the codebase still fails the lint — the signal is kept, only the
twelve known-deliberate cases are exempt.

They are listed here so the decision is revisitable rather than buried: the
applicants outreach picker (twice), the attendance day picker, the organisation
profile form, the created/saved route flags on the outreach screen, the reviews
outreach picker, the verification resubmission prefill, the volunteer's day
tick-list, the review sheet's reset-on-open, the category checklist's initial
expansion, and the document viewer's zoom reset.

### `api/` was never in the tracked baseline

Running the lint over `api/src` for the first time turned up 16 findings,
including one that was purely a configuration artefact.

**`api/` has no ESLint config of its own.** It is a separate Next.js project
inside the repository, and it was being linted by the repository root's *Expo*
config — which does not load Next's plugin. So the perfectly correct
`{/* eslint-disable-next-line @next/next/no-img-element */}` directive on the
confirmation page's logo was itself reported as an error: *"Definition for rule
'@next/next/no-img-element' was not found."* The directive is gone and the reason
for the plain `<img>` (a fixed-size logo that would otherwise go through Vercel's
metered image optimiser for nothing) is now stated in prose, with a note to put
the directive back if Next's own lint config is ever added here.

The other 13 were `Array<T>` where the project's style is `T[]`, auto-fixed. One
unused import in the under-subscription pass. And the confirmation page's own
effect, which reads the URL fragment — an external system that genuinely does not
exist during render, because the page is prerendered — suppressed with that
reason.

### Buckets

- **Built and working:** app lint 47 errors / 7 warnings → **0/0**; `api/` lint
  2 errors / 14 warnings → **0/0**. 534 tests / 18 suites green, both typechecks
  clean, `api` builds. The hook-ordering bug on the volunteer outreach screen is
  fixed.
- **Built but untested on a device:** nothing new, but the four animation
  components (Toast, ListSkeleton, FlyerBackground, the welcome carousel) had
  their animated values reconstructed a different way. The guarantee is
  identical and there is no behavioural difference to look for, but they are
  worth a glance whenever the device round happens.
- **Not built:** the twelve set-state-in-effect sites are suppressed, not
  rewritten — see above for the reasoning and the full list.

## New brand mark, and a reproducible icon pipeline (2026-09-10)

The owner supplied a redrawn V-HUB mark in two forms — the mark on nothing, and
the same mark centred on a white square — and asked for it everywhere, with the
white version used for the icon that appears on the phone's home screen.

**One master, six derived files, one script.** The app draws its brand mark from
six PNGs: `assets/logo.png` (every in-app placement, sized through
`getLogoSize()`), `assets/icon.png` (the iOS launcher icon and Expo's fallback
elsewhere), `assets/favicon.png` (the web tab), and the three halves of the
Android adaptive icon (`android-icon-foreground.png`,
`android-icon-background.png`, `android-icon-monochrome.png`). Cropping and
resizing six files by hand in an image editor is how a set like that drifts: the
mark ends up a slightly different size in each, and nobody can tell afterwards
which file was regenerated and which was left behind. `scripts/generate-icons.js`
builds all six from the transparent master, so the fill ratios written in that
file *are* the specification.

**The fill ratios were measured off the old files, not chosen.** 0.86 of the
canvas for the in-app mark, 0.54 for the launcher icon, 0.66 for the favicon,
0.42 for the Android adaptive icon. Reusing the previous artwork's geometry is
what kept every placement in the app at the same optical weight while the
drawing underneath it changed — nothing needed re-tuning after the swap.

**No new dependency.** `scripts/lib/png.js` is a small PNG reader and writer
built on node's own `zlib`. The conventional answer would have been `sharp`;
that was rejected because dependencies are a gated change under CLAUDE.md, and
installing a native-binary image library for six files that change roughly never
is a poor trade.

**Alpha is premultiplied before downscaling, and this is not optional.** The
transparent regions of the master are stored as `(0, 0, 0, 0)` — transparent
*black*. Averaging raw RGB when shrinking 1203px of artwork down to 96px would
blend that black into every edge of the mark and leave a visible dark halo all
the way round it. The resizer premultiplies by alpha, averages, then undoes it.

**The knockouts are transparent, so they take the colour behind them.** The ECG
line through the heart, and the gap between the heart and the V, are not painted
white in the artwork — they are holes. On the white launcher icon they read
white; on the near-black splash (`#0B0B0F`) they read near-black. That is the
same behaviour the previous mark had and it looks deliberate in both places, but
it is why `assets/android-icon-background.png` and
`android.adaptiveIcon.backgroundColor` in `app.json` must always agree: they now
both say white, and if one is changed without the other, the holes in the mark
show the wrong colour on Android.

**The masters live in `design-refs/`, which is gitignored.** That is where this
project already keeps every piece of source artwork, the Figma exports included,
and none of it is committed. So the script runs on the design machine and not on
a bare clone; it exits with an explanatory message rather than a stack trace when
the master is absent. The six generated files *are* committed, which is what a
build actually needs.

**Onboarding slide 3 was replaced with a supplied photograph**, kept as JPEG
(`assets/images/onboarding-3.jpg`, 132KB) rather than converted to PNG to match
its two neighbours. A photograph has no flat colour for PNG's lossless
compression to exploit, so the conversion would have cost roughly a megabyte for
an identical picture — and every byte of a carousel slide is fetched and decoded
before the carousel is allowed to appear.

- **Built and working:** all six icons regenerate from the master and are
  committed; `app.json`'s adaptive-icon background is white to match; slide 3
  points at the new JPEG. Type-check, both lint passes and all 534 tests are
  clean.
- **Built but untested on a device:** how the launcher icon actually looks once
  a real Android launcher masks it (circle, squircle, teardrop) and once iOS
  rounds its corners, and how the themed monochrome icon tints on Android 13+.
  Both need an EAS build to see — a Metro reload will not change an app icon.
- **Known, not a defect:** the new photograph is 2:3 where the other two slides
  are nearly 1:2.3, so `resizeMode="cover"` crops roughly 15% off each side of
  it on a tall phone. The centre of the action sits in the middle and survives
  the crop, but it is a tighter framing than slides 1 and 2 get.
- **Resolved the next day**, see the carousel entry below: slides 1 and 2 are
  JPEG now too and the three together are ~530KB instead of 4.65MB.

## The onboarding carousel finally glides (2026-09-11)

The owner had reported four times that the intro carousel "jumps between slides
instead of gliding", and three previous attempts had not fixed it. She asked,
before any more code was written, for three specific answers: is the slide change
driven by a state index or by scroll position, is anything animating and is it on
the native driver, and are the images preloaded. **All three came back clean** —
which is precisely why the previous fixes did not work. They had each made the
*dots* smoother. The dots were never the problem.

### What was actually wrong

**A fixed duration for a variable distance.** Autoplay chose its next slide with
`(activeIndex + 1) % SLIDES.length`, so going from the last slide it returned to
the first — a journey of TWO screen widths. It was handed to
`scrollTo({ animated: true })`, which is a built-in native scroll of roughly
250ms on Android and 300ms on iOS, **fixed, taking no duration argument**. Two
widths in the time of one is double speed: the middle slide flashes past and the
whole thing reads as a snap back to the beginning. On a four-second interval
that is a visible jerk **every twelve seconds, forever** — which fits "it still
jumps" exactly.

**And even a normal advance was too fast.** A quarter of a second to move a
full-screen photograph is abrupt no matter how smoothly it is drawn. A swipe
feels like a glide because a finger is controlling it. There is no prop that
slows `scrollTo` down; the only way to own the timing is to stop using it.

### The fix

**The offset is now driven by an `Animated.timing` we control** — 650ms with
`Easing.inOut(Easing.cubic)` — whose listener pushes each frame's value into the
scroll view with `scrollTo({ animated: false })`. The duration scales with the
distance actually travelled (capped at 1.6×), so SKIP's two-slide move stretches
in time rather than doubling in speed.

**A SECOND `Animated.Value`, not `scrollX`.** `scrollX` is attached to the scroll
view's own `onScroll` through the native driver, so the native side writes it
every frame; animating it from JS as well would be two writers fighting over one
value. The new `glideX` is purely an output. `scrollX` still reports back what
actually happened, so **the dots are untouched and stay on the native thread.**

**`useNativeDriver: false` on the glide, and it cannot be otherwise.** The native
driver only writes style properties, and this value is not a style — its listener
calls a method. A native-driven value does not fire JS listeners at all, so the
carousel would simply sit still. The cost is one `scrollTo` per frame on the JS
thread; the slides are completely static and nothing re-renders during a move,
so there is nothing for it to contend with. The genuinely native alternative is
Reanimated's `useAnimatedScrollHandler` + a `scrollTo` worklet, which is a gated
dependency and disproportionate here.

**Autoplay reverses at each end** (1, 2, 3, 2, 1, 2 …) instead of rewinding.
Every move is then exactly one slide wide, which is what makes a constant speed
possible at all. A true infinite loop was considered and rejected: it means
cloning the first and last slides and silently teleporting the offset when they
scroll into view — a lot of machinery, and one more thing to get wrong, for three
slides a user sees once.

**A second, unrelated bug went with it.** Autoplay was paused on
`onScrollBeginDrag` and restarted ONLY by `onMomentumScrollEnd`. A slow drag
released with no velocity does not reliably produce a momentum phase — and when
it did not, **autoplay was paused for the rest of the session** with nothing on
screen to explain why. `onScrollEndDrag` is now a second restart path.

**`flex: 1` came off the slide style.** A slide's width is set inline from the
window width, and `flex: 1` also sets `flexBasis: 0` on the main axis — which
inside a horizontal scroll view *is* the width. Two rules arguing over the size
of a paging slide is how a page boundary ends up a pixel or two off. Not believed
to have been causing anything; removed because it is ambiguous.

### The images, which were the other half

Slides 1 and 2 were photographs stored as **PNG — 2.3MB and 2.2MB**. PNG is
lossless and has no flat colour to exploit in a photograph, so it was storing
camera sensor noise byte for byte. Under Metro (`--dev-client`, which is how this
is tested) `require()`d assets resolve to an http URL on the dev server and are
fetched over the network, and 4.5MB does not arrive inside the 1500ms
`PREFETCH_TIMEOUT_MS` on a phone-to-laptop connection. **So the carousel was
being released while its own images were still downloading** — the prefetch gate
was working exactly as designed and still letting through a half-loaded screen.

Re-encoded to JPEG at quality 82: **204KB and 205KB**, with slide 3 at 129KB, so
all three together are ~530KB against 4.65MB. Inspected at full size before and
after; no visible artefacts, including in slide 2's large smooth skin and
background gradients, which is where JPEG banding would show first.

**No dependency was added to do it.** `jimp-compact` is already present in
`node_modules` as a transitive dependency of `@expo/image-utils`. It was used
once, from a throwaway script outside the repository, and the *output* is what is
committed — nothing in `package.json` changed and nothing new ships in the app.
A committed script would have been the wrong call here: it would make the build
depend on a package this project does not actually declare.

- **Built and working:** type-check clean, both lint passes clean, all 534 tests
  pass. The logic is verifiable by reading — reversing direction, distance-scaled
  duration, both autoplay restart paths.
- **Built but untested on a device:** the thing that actually matters, which is
  whether 650ms with a cubic in-out *feels* right in the hand. That is a taste
  judgement and needs a phone. `SLIDE_GLIDE_MS` is a single constant at the top
  of the file if it wants to be slower or faster.
- **Known, not a defect:** autoplay now ping-pongs, so the dots travel back as
  well as forward. That is honest about what the carousel is doing and is what
  makes the constant speed possible; it is a deliberate change in behaviour
  rather than a side effect.

## Device round 1–3: what large fonts broke, and why it was structural (2026-09-12)

The owner ran the first three tests of the device round on the new EAS build.
Everything passed functionally. The findings were almost all one defect wearing
different clothes, plus two screens with no scroll container and one Supabase
project setting.

### The font-size class of bug, which was one mismatch

**Every `fontSize` in the app scales with the phone's accessibility setting.
Every other number in a stylesheet does not.** `minWidth: 96`, `height: 64`,
`maxWidth: '40%'`, `paddingHorizontal: spacing.base` are all fixed
density-independent pixels. At 1.3x the text needs a third more room and the
boxes holding it do not move at all. That single mismatch produced every
reported symptom:

- **"Notificatio / ns"** — `SettingsRow` has four things across it and about
  232dp of width for its two text nodes on a 360dp phone. At 1.3x that is not
  enough for the label and its value, and *no redistribution of the same 232dp
  makes it enough*. Squeezed below the width of its own longest word, Android
  breaks inside the word as a last resort.
- **"30% Complet"** — two text nodes in a `space-between` row with nothing
  telling either what to do once they no longer fit. A flex item that cannot
  shrink further is clipped at the container edge rather than wrapped.
- **Text escaping its container** — a box sized for two lines holding three.

**The answer is a ceiling AND layout that grows, and one without the other does
not work.** `MAX_FONT_SCALE` is 1.3: the largest multiplier at which the
tightest row in the app still fits its longest label. Android allows 2.0 and
stacks a separate display-size multiplier on top of that; no phone layout
survives it, and **an app that refuses to draw is less accessible than one that
draws slightly smaller than asked** — the same thing iOS apps do when they cap
Dynamic Type. A ceiling alone still leaves a 96dp column holding 1.3x text, so
`scaleWithFont()` multiplies any constant that exists *because of the words
inside the box*, and `prefersStackedLayout()` is the single place that decides
when a side-by-side row should stop being one.

**`components/ui/Text.tsx` is now THE text primitive** and all 106 files that
draw text import it. `textBreakStrategy="simple"` swaps Android's default
`highQuality` line breaker — which is allowed to split a word for a tidier
right edge — for the greedy one that breaks at spaces. It is a default, not an
imposition: the splash wordmark passes `allowFontScaling={false}` because it is
a logotype rather than text to be read.

**26 `space-between` rows across 20 files gained `flexWrap` and a `rowGap`.**
Safe by construction: wrap changes nothing until the content overflows, and
`rowGap` applies only *between* wrapped lines, so a row that still fits on one
is pixel-identical to before.

### The scroll bug, which looked like a navigation bug

Both Profile tabs and the onboarding completion screen were plain flex columns
ending in a `flex: 1` spacer. **At the default font size everything fitted, so
the absence of a scroll view was invisible.** At a large font size the cards
grow, the column runs past the bottom of the phone, and the content underneath
is unreachable.

The reported symptom was stranger than that: swiping up on the volunteer
Profile opened My Feedback. **A drag that scrolls nothing is still a press to
the view under the finger**, so trying to reach the bottom activated whichever
card the thumb was on. Inside a scroll view the drag is claimed by the scroller
before a `Pressable` can call it a tap.

Audited every screen. Only those three had content that can outgrow the
viewport with nothing to scroll; `map`, `scan` and `search` are deliberately
full-bleed, and no screen pins its content with a `contentContainerStyle` of
`flex: 1`.

### The keyboard, which was ten copies of advice that expired

`behavior={Platform.OS === 'ios' ? 'padding' : undefined}` at ten sites means
`KeyboardAvoidingView` does nothing at all on Android. That was correct once:
Android's `adjustResize` shrank the window when the keyboard opened, so a
ScrollView inside it shrank too — React Native's own docs still say you usually
need no help on Android for that reason. **It stopped being true when the app
went edge-to-edge**, which Expo SDK 57 and RN 0.86 do by default and Android 15
enforces. An edge-to-edge window draws behind the system bars and does not
resize; the keyboard is an inset over the top of it. Nothing shrinks, nothing
scrolls, and the field being typed into is behind the keyboard. Every form in
the app had it, not only registration.

### The confirmation email that never arrived

**Nothing is wrong with Gmail SMTP, and nothing was ever sent.** The evidence is
in what happened next: she reached the onboarding wizard. `useSignUp` returns
`confirmationRequired` only when Supabase hands back no session, and the
register screen shows "Check your email" only on that result. Reaching
onboarding means a session came back with the sign-up, which Supabase does
**only when "Confirm email" is off for the project**. With it off no
confirmation email is ever requested, so no mailer can have failed.

The app was correct throughout; the setting is a dashboard decision. Two things
were still worth changing. The "Check your email" screen was a **dead end** — an
unconfirmed address cannot log in and Supabase refuses a second registration for
an address it already holds, so a mail that did not arrive left no way forward
and no way back into the account. There is now a resend button, which reports
success whatever happens except on a rate limit, so it cannot be used to
discover which addresses hold accounts.

### Splash, carousel, and the two redesigns

- **The wordmark was `colors.primary` (coral) while the mark above it is the
  logo's red.** Two millimetres apart and near enough to read as a printing
  error. `colors.brandMark` is the sampled logo red, and only type that belongs
  to the artwork uses it.
- **A signed-in user gets the mark alone.** The fuller screen is an
  introduction, worth a returning volunteer's time exactly once. The decision
  has to be made before the first frame and nothing knows whether a session
  exists that early — reading one is the work the splash is covering — so it is
  remembered in AsyncStorage from last time. The native splash is held until
  that read returns rather than hidden on mount, because the two variants are
  not a superset and a subset and correcting a guess would visibly jump.
- **The carousel had correct motion and no character.** Three layers now move
  at different rates: the photograph lags behind its slide and settles out of a
  slight zoom, the copy lifts and cross-dissolves, and the curve leaves quickly
  and spends its time arriving. All interpolated off the real scroll position
  rather than a timer, so the same motion happens under a finger — **motion that
  only exists on autoplay is a cutscene**. Every property used is one the native
  driver can write, so none of it touches the JS thread.
- **SKIP became LOG IN.** "Skip" promises to leave the thing you are in, and it
  jumped to the carousel's last slide — weaker than doing nothing, since
  auto-advance arrives there anyway. There was also nothing to skip *to*: both
  actions are pinned over every slide. What was missing was the opposite door,
  since both buttons lead to registration and someone who already had an account
  had to open the register screen to find the log-in line at the bottom of it.
- **The onboarding skills step** stopped being nine collapsed accordions. That
  shape answers "find one skill in a long list", which is the picker's job; it
  is the wrong answer to "tell us what you can do". One category at a time from
  a rail, skills as wrapping chips, choices pinned above. **Onboarding only —
  `CategoryChecklist` and the outreach picker are untouched.**
- **Three containers on the volunteer Profile tab** were redesigned: the V-Score
  card is now a feature panel with a track showing where the score sits on the
  0-100 scale its bands are cut from, and My Feedback and Edit Profile move to
  the filled row language the rest of the app already uses.

### Student credentials, confirmed rather than changed

`constants/credential-guidelines.ts` already covers students: "Your student
identity card, or a letter from your school confirming you are enrolled", with
the acceptance rule that it must name the person, the school and the programme
and show current enrolment. The picker accepts
`type: ['application/pdf', 'image/*']`, so a photographed student ID and a PDF
enrolment letter both go through. Nothing needed changing; it is recorded here
because the question was asked and the answer should not have to be rediscovered.

### Buckets

- **Built and working:** everything above. Type-check clean, both lint passes
  clean, 534 tests green.
- **Built but untested on a device:** all of it, by definition — this is a round
  of UI fixes and it needs the next build to confirm. In particular the 1.3
  ceiling is a judgement about where layouts stop coping, and only a phone at a
  large font setting can say whether it is in the right place.
- **Not built:** nothing from this round. The one item that is not a code change
  is Supabase's "Confirm email" setting.

## Signup 500, and the JSON that reached a user (2026-09-12)

### The 500 was diagnosed, not inferred

Reproduced directly against the live project with the public anon key:

```
POST /auth/v1/signup -> 500
{"code":500,"error_code":"unexpected_failure","msg":"Error sending confirmation email"}
```

**Supabase's SMTP send is failing.** Not the app, not the schema, not the
`profiles` INSERT grant list that was tightened in `20260909`. Turning "Confirm
email" on is what *exposed* it: with it off Supabase never asks for a mail, so a
broken mailer and a working one look identical.

A second probe answered the question that decides whether anything needs
cleaning up: **Supabase rolls the signup back.** Registering the same address
twice returns the same 500 rather than "already registered", and a login attempt
returns `invalid_credentials`. No orphaned `auth.users` rows exist, from the
owner's attempts or from the probes.

The probes used `@example.invalid`, which is reserved by RFC 6761 and can never
be delivered to. That raises an obvious objection — a real SMTP server would
also refuse an undeliverable domain — but it is answered by the owner's own
report: she saw the same 500 with a **real** address on her phone. The probe
confirms the error text; her report confirms the failure is not an artefact of
the fake domain.

**Which half is broken cannot be told from the error, and Supabase offers no
test button.** So `GET /api/mail-health` (admin only) authenticates to Gmail with
nodemailer's `verify()`, which completes the AUTH exchange and hangs up without
sending — no quota, no inbox touched. 200 means the app password is alive and
the fault is in Supabase's SMTP settings; 502 means the credential is dead, and
if so **every email this API has tried to send since it died has failed
silently**, because both send paths log and swallow so a mail outage never fails
a recorded decision. CLAUDE.md has warned about exactly this since 2026-09-01:
changing the Google account's password revokes the app password, stops all mail,
and looks like Supabase breaking.

### The raw JSON

`{"status":500,"statusText":"","redirected":false,"url":"…/auth/v1/signup"}` is a
serialised HTTP Response. It reached the screen because the screen rendered
`error.message`, and because supabase-js sets `message` to a stringified copy of
the response when the body is not the JSON it expected.

**The screen was not doing anything unusual — 97 places render an error the same
way.** So the fix is one function they all go through, which is allowed to decide
that a "message" is unfit for a person and substitute one that is.
`lib/errorMessage.ts` rejects JSON, stack traces, bare URLs, SQLSTATEs, bare
error codes and anything over 300 characters, and maps the failures worth naming
to sentences. It rescues exactly one thing from a serialised response: a 5xx
status means the fault is ours and nothing was saved, which is what decides
whether trying again is worth someone's time.

83 sites converted across two codemods. The only `error.message` left in the app
are `console.warn` calls, which are for developers and stay raw. 12 unit tests,
including the exact string that was on screen.

### The rest of the round

- **Password validation.** `MIN_PASSWORD_LENGTH` sat in `useAccountSecurity`
  under a comment calling it "the password rule shared by this screen and the
  sign-up form". It was not shared: registration had its own inline
  `password.length < 6`, checked only on submit. **The app demanded 8 characters
  to change a password and 6 to choose one.** The rule is now `lib/password.ts`:
  at least 8 characters, at least one letter, at least one number, and nothing
  else. A symbol requirement reliably produces `Password1!`, which satisfies
  every box and is among the first things an attacker tries; length is what
  helps, so the meter rewards it and the requirements do not mandate it. 12
  tests.
- **"Already have an account? Log in", visible on one phone and not the other.**
  Nothing was wrong with the row. The register screen never applied
  `insets.bottom` anywhere, so its scroll content stopped 24dp from the bottom
  of the *window* — and on a phone using gesture navigation the bottom 24–48dp
  of the window is underneath the system gesture bar. On a handset with
  three-button navigation the same 24dp cleared it. All four auth screens had
  the gap.
- **The full splash's logo.** The mark now has two sizes because it has two
  jobs: alone on the dark ground it is the whole screen and keeps the approved
  size; above the wordmark and subtitle it was three times the wordmark's height
  and crowded the block it was meant to introduce, so it drops to roughly twice
  it.
- **My Feedback and Edit Profile.** Two separate filled cards with a paragraph
  each gave two ordinary navigation links more weight than the V-Score panel
  above them. One grouped card, a hairline between the rows, about half the
  height, subtitles cut to a single short line. The V-Score card is untouched at
  the owner's request.

### Buckets

- **Built and working:** all of the above. 546 tests green, both typechecks
  clean, both lint passes at zero.
- **Built but untested:** `/api/mail-health` needs a deploy before it can be
  called, and it needs an admin session.
- **Not built, and not ours:** the Supabase SMTP configuration itself. The app
  now reports the failure in a sentence and offers a resend; it cannot send the
  mail.

## The 35 days of email that reached nobody (recorded 2026-09-14)

**Finding.** Between **28 July 2026 and 1 September 2026**, every transactional
email the serverless API tried to send failed for every recipient except the
project owner. Roughly five weeks. Nobody noticed at the time, and nothing in
the app, the database or any dashboard indicated it.

**Cause.** The API shipped on 2026-07-28 (`e48b732`) using Resend. Resend will
not send from an arbitrary address without a **verified domain**, and this
project has none. Without one the only usable sender is the shared
`onboarding@resend.dev`, and Resend delivers from that address **only to the
address the Resend account itself was registered under** — the owner's. Every
other recipient was refused with a 403. This was not intermittent and not a
misconfiguration that could have been corrected: it is how the free tier is
designed to work, and the fix was always a different transport, which arrived
on 2026-09-01 (`42c22d2`) as Gmail SMTP.

**What was lost.** Acceptance, rejection and waitlist notices from
`/api/application-status`; waitlist promotions from `server/waitlist.ts`; and
outreach-cancellation notices from `server/accountStop.ts`. **Push
notifications were unaffected** — a separate transport that never went through
Resend — so anyone with the app installed still learned of the decision. The
loss falls on recipients who relied on email alone. **No data was lost or
corrupted**: every decision is correctly recorded, and only the courtesy
notification about it went missing. There is nothing to repair.

**Why it was invisible, which is the part worth keeping.** Both send paths in
`api/src/server/email.ts` catch, `console.error`, and return normally. That
design is **correct and must not change**: the database write is the source of
truth, and an organisation's recorded decision must never be reported as failed
because a mail server was unreachable. But the consequence is that *total
delivery failure and perfect delivery produce byte-identical behaviour on every
screen*. A swallowed failure is a deliberate trade — availability of the
primary action, bought with silence about the secondary one — and the price of
that trade is that the silence must be broken somewhere else.

It was not, for two compounding reasons. Vercel's Hobby plan keeps runtime logs
as a live tail with about an hour of retention and no alerting, so the
`console.error` lines expired before anyone could have read them. And the
Resend batch path put up to 100 messages in a single `batch.send` inside one
try/catch, so one bad address discarded the rest of the chunk — the failure was
not only invisible but amplified.

**What now covers it.** Error monitoring (2026-09-08, `726b60d`) hangs off
`errorResponse()` and alerts on 5xx once `ALERT_EMAIL` is set, which it now is.
`sendMailBatch` isolates each message so one failure is one failure.
`/api/mail-health` authenticates against Gmail without sending, which is what
distinguishes a dead credential from a mis-typed SMTP setting — the check that
did not exist for the whole of the Resend era.

**The limitation that remains.** Monitoring covers the API's own 5xx responses.
It does not prove an individual message was *delivered*, and nothing here does:
an SMTP handshake that succeeds is not a message that arrived. Confirming
delivery needs a provider with webhooks, which needs a domain, which is ruled
out on cost. The honest statement for the report is that V-HUB can now tell you
when its mail transport is broken, and still cannot tell you that any given
email was read.

**Generalisation for the FYP write-up.** A failure that is swallowed by design
needs a second channel that is *not* the thing being swallowed — a health probe,
an alert, or a counter. Logging into a store with an hour of retention is not
that second channel; it only looks like one. This is the same reasoning that put
`v_score_recomputed_at` on a derived cache: a value nothing records the state of
is indistinguishable from a stale one.

## The floating tab bar covered every pushed screen (2026-09-14)

**Symptom.** Sign Out on Settings was visible behind the floating pill and could
not be tapped.

**Cause, which was a misread category rather than a missed screen.** The bar is
`position: absolute`, so React Navigation reserves no space for it and each
screen must leave that room itself via `tabBarClearance(insets.bottom)`. Only
the visible tabs did — because "tab screen" had been read as "screen with a
button on the bar", when it actually means "screen inside the tab navigator". A
screen registered with `href: null` is hidden from the bar but is still a screen
*of* that navigator, so the pill floats over it identically. **Twenty-nine of
the forty-three screens were in that second group.**

**Why it was total rather than tight.** Those screens carried a
sensible-looking `paddingBottom: spacing.xxl` (32). The pill's top edge sits at
`insets.bottom + BAR_LIFT + BAR_HEIGHT` = `inset + 76` from the bottom of the
screen, and the clearance needs `inset + 92`. On a typical handset that is ~85px
short — more than a button's height, which is why controls were entirely
unreachable rather than merely cramped. The worst case was
`(volunteer)/notifications`, which passed `contentContainerStyle` **only when
the list was empty**, so a populated list had zero bottom padding and its last
row — a tappable one — sat fully under the bar.

**Fix.** `useTabBarContentPadding()` in `components/ui/tabBarOptions.tsx`
returns the whole style object, so a call site is one spread and no screen
re-derives a measurement. Applied to 24 files (the three Account & Security
routes share one component). Three screens are exempt with stated reasons:
`map` and `search` are placeholder stubs, and `scan` is full-bleed with
vertically centred controls.

**What actually prevents recurrence.** `components/ui/__tests__/tabBarClearance.test.ts`
parses the three `_layout.tsx` files, enumerates every registered screen, and
asserts each either accounts for the bar or appears on an exemption list with a
reason. A review cannot hold this line, because the broken screens *looked*
fine in source — only arithmetic against the bar's height showed the shortfall.
The test was verified to fail when the clearance is removed from a screen, so it
is a real guard rather than a vacuous pass.

**Generalisation for the write-up.** The audit that missed this asked "do the
tab screens pad?" and grepped for the helper, which answered a question about
the 14 screens already known to be correct. The right question was "which
screens does the bar render over?", whose answer comes from the navigator's
registration list, not from the screens' own source. **When a layout invariant
depends on what a framework does implicitly, enumerate from the framework's
configuration, never from the code that is supposed to comply with it.**

## Confirmation moves from a link to a code, and the silent login is fixed (2026-09-14)

**Two faults, one root.** After a successful registration and a successful
confirmation through the emailed link, logging in did nothing at all — no
error, no message, no movement.

**Why login appeared to do nothing.** `signInWithPassword` SUCCEEDED. The
failure was one layer further in: `useAuthGuard` then loads the profile, and
for an account confirmed through the link there is no profile yet — `signUp`
returns no session when confirmation is required, so the rows cannot be written
at registration and are instead bootstrapped from `auth.users.user_metadata` on
first login. When that bootstrap failed, `resolveProfile` returned a bare
`{ status: 'error' }`, the handler deliberately did nothing with it, and the
routing effect's response to a missing profile is — correctly — to stay put
rather than guess a home route. The result: a valid session, no profile, the
login screen still showing, and `signIn.error` null because signing in had
genuinely worked. **Nothing in the app was capable of saying what had gone
wrong, because the reason was discarded at the point of failure.**

**The fix has three parts.**

1. **The reason is kept.** `ProfileFetchOutcome`'s error variant now carries
   `cause`, and every return site passes it. The app knew why it could not sign
   somebody in and was throwing the answer away.
2. **The two meanings of 'error' are separated.** A failure with no profile
   already in the store is a *stuck fresh sign-in*: it now sets `authError`,
   logs the cause, and signs out so the person can retry. A failure with a
   profile already loaded is a *mid-session blip* and is still ignored, which
   was always right — treating "couldn't fetch" as "profile incomplete" would
   bounce an onboarded volunteer into the onboarding wizard mid-session.
3. **`authStore.authError` is rendered by the login screen.** It deliberately
   survives `reset()`, because `reset()` runs on the sign-out that the message
   exists to explain; clearing it there would erase the explanation a moment
   before the screen renders it.

**Why the flow moved to a six-digit code.** The link route is: mail app →
browser → landing page → back to V-HUB by hand → log in. Five steps across
three apps, and V-HUB can observe none of them. When it broke, the person
experienced a page that said "confirmed" followed by a login that did nothing.
**A flow whose failures are invisible to the person in it cannot be reported**,
and that — not the bug itself — is what made it worth replacing rather than
patching.

`verifyOtp` also removes the bootstrap gamble entirely, which is the deeper
win. It returns a **real session** at the moment the code is accepted, so the
profile rows are created right there, in a mutation, while somebody is looking
at a screen that can report a failure. The link path can only create them much
later, on a screen that has no idea it is happening.

**`lib/profileRows.ts` is now the ONE implementation** of that insert, shared by
`useSignUp`, `useConfirmSignUp` and the guard's bootstrap. Three copies of an
insert whose column list is pinned by a GRANT is three places to forget the same
thing. It throws rather than returning a status, because every caller needs the
reason.

**The link still works** and is now the fallback rather than the primary path.
Confirming that way falls through to `useConfirmSignUp`'s `existing` branch.

**What it costs:** the Supabase "Confirm signup" template must contain
`{{ .Token }}`, exactly as the recovery template already does. Without that
line the email arrives with no code in it.

**`confirm-email` must never be added to `AUTH_ENTRY_SCREENS`**, and
`hooks/__tests__/authEntryScreens.test.ts` asserts it. The guard bounces a
signed-in user off those screens; since `verifyOtp` creates a session *before*
the profile rows are written, adding it there would redirect the user into a tab
group with no profile — recreating the dead end this work removed. The same
applies to `reset-password`, for the same reason.

**Generalisation for the write-up.** Two of this project's worst bugs now share
a shape: the swallowed email failure and the swallowed profile failure. In both,
a deliberate, defensible decision not to propagate an error (a mail outage must
not fail a recorded decision; a network blip must not look like incomplete
onboarding) was implemented by **discarding the error rather than routing it
somewhere quieter**. The correct form of "do not fail loudly here" is "record it
where it can still be read" — never "forget it".

## The login dead end: the first diagnosis was wrong (2026-09-14)

**Worth recording as a method failure, not just a bug.** Login appeared to do
nothing after a successful registration and confirmation. The first diagnosis
was that the profile-row bootstrap had failed. The owner ran a query against
the account and it came back `confirmed: true, profile_exists: true` --
contradicting that explanation outright, and prompting a second look rather
than a fix aimed at the wrong thing.

**The real cause.** A volunteer's `volunteer_profiles.category` is null until
the onboarding wizard's final step writes it, so a volunteer who has just
confirmed their email is `onboardingIncomplete` by definition. That branch of
the routing effect read:

```ts
if (onboardingIncomplete) {
  if (!inAuthGroup && !atOffline) router.replace('/(auth)/welcome');
  return;
}
```

Correct for welcome and for every wizard step. **Wrong for login**, which is
the screen you are standing on at the moment you sign in: "leave them where
they are" means a successful sign-in produces no visible result whatever.
Nothing errored, so no message appeared either. The rule twenty lines below
that exists precisely to move a signed-in user off an entry screen never ran,
because this branch returns first.

**The interaction was already written down.** `AUTH_ENTRY_SCREENS`' own
docstring said: "A volunteer with incomplete onboarding never reaches this
check at all -- the onboardingIncomplete branch below returns first." The fact
was recorded; the consequence was never drawn from it. **A comment that states
a fact is not the same as a comment that states what the fact costs**, and this
is the clearest example of that distinction the project has produced.

**It affected every newly registered volunteer, deterministically** -- not an
edge case, and not dependent on a network failure. Organisations were
unaffected, because `onboardingIncomplete` is volunteer-only, which is why it
survived earlier testing on an organisation account.

**Fix.** The branch now also pulls a user off an entry screen, excluding
welcome (which is the destination, so redirecting from it to itself loops).
`hooks/__tests__/authEntryScreens.test.ts` asserts all four properties.

**The earlier work was not wasted, and is not a fix aimed at the wrong thing.**
`authError` addresses a real second gap: a profile load that genuinely fails
still had no way to speak. It simply was not the cause of this symptom. Both
are now closed.

## No typographic dashes in user-facing text (2026-09-14)

**63 em and en dashes across 29 files**, in screen copy, empty states, toasts,
the Info Hub, the privacy policy, the credential guidelines, and two push and
email templates. Each was rewritten rather than character-swapped: a dash
joining two independent clauses became a full stop, a dash introducing a list
became a colon, a parenthetical pair became commas, and ranges became a plain
hyphen or the word "to".

**The guard is a test, not a convention**, for the same reason the tab bar
clearance is: prose is written faster than any convention is read, and a dash
is invisible in review because it looks like correct typography.

**It parses rather than greps, and that mattered.** The same character is fine
in a JSDoc block explaining a decision and wrong eight lines later in a button
label. A first attempt used a hand-written comment stripper and produced two
false positives from JSDoc and four false negatives -- exactly how a guard earns
a reputation for crying wolf and gets switched off. `scripts/findUserText.js`
walks the TypeScript AST and inspects only string literals, template literals
and JSX text, so comments are excluded structurally rather than by pattern. The
script is shared with `lib/__tests__/userFacingText.test.ts`, so the tool a
person runs by hand and the test that fails the build can never disagree.

## humanError could not recognise a network failure (2026-09-14)

A volunteer on the onboarding identity step was shown, verbatim:

```
fetch failed: java.net.UnknownHostException: Unable to resolve host
"<project>.supabase.co": No address associated with hostname
```

**The screen was doing the right thing** -- it routes through `humanError()`
like everything else. The table simply had the wrong two strings in it:
`'network request failed'` is React Native's OLD wording and `'failed to fetch'`
is the BROWSER's. Android says **"fetch failed"**, the same two words reversed,
wrapped around a Java exception class. Neither matched, and the message is short
and brace-free, so `looksMachineGenerated` passed it through as a perfectly good
sentence.

**This was the worst possible gap for that function to have**: a network failure
is the single most common error any mobile app produces, and on Ghanaian mobile
networks it is routine rather than exceptional.

**Two fixes, and the second is the important one.** The table now covers the
families (`unable to resolve host`, `unknownhostexception`, `sockettimeout`,
`econnrefused`, `sslhandshake` and the rest). But a table can only match what
somebody thought of, so `looksMachineGenerated` now also rejects **any message
naming a JVM or Android class** -- a dotted path with a capitalised leaf -- which
means an unrecognised platform exception falls back to the caller's sentence
instead of being printed at a nurse. A test asserts that prose merely mentioning
"java" still survives.

## The session refresh timer was never tied to the app being in front (2026-09-14)

`autoRefreshToken: true` was set and nothing else was. There was **no `AppState`
listener anywhere in the app**, which is the arrangement Supabase documents for
React Native. Android throttles and eventually kills background timers, so an
app left in the background comes back holding a token that expired with nothing
running to renew it, and the failure then surfaces somewhere unrelated to
authentication. It is also why the pending-confirmation screen only updated
after a full close and reopen: nothing ran when the app returned to the front,
so a cold start was the only thing that re-read the session.

## A recorded fact is not a recorded consequence (2026-09-14/15)

**Two of this project's worst bugs have the same shape, and it is not
carelessness.** In both, the information needed to prevent the bug was already
written down, in the right place, by someone who understood it. What was
missing was the second step: asking what the recorded fact *costs*.

**The login dead end.** `AUTH_ENTRY_SCREENS`' own docstring said: *"A volunteer
with incomplete onboarding never reaches this check at all - the
onboardingIncomplete branch below returns first."* Entirely accurate. Nobody
asked the follow-up: *then what moves such a volunteer off the login screen?*
Nothing did, and every newly registered volunteer signed in to no visible
result at all.

**The tab bar clearance.** The rule "every tab screen must pad its scroll
content" was in CLAUDE.md and was followed, on the fourteen screens the author
understood "tab screen" to mean. The unasked question was *which screens does
the bar actually render over?* The answer was forty-three, and it came from the
navigator's registration list rather than from the screens themselves.

**Why an audit does not catch this class.** Both were verified by looking for
the thing that was already known: a grep for `tabBarClearance` returns the
screens that already call it, and re-reading the docstring confirms the
docstring. **A check that starts from what you believe can only ever confirm
it.** The tab bar audit reported "14 screens, 14 padded, correct" and the
arithmetic was right.

**What actually works, and it is the same move both times:** enumerate from the
authority rather than from the code that is supposed to comply with it - the
navigator's screen list, the AST rather than a regex over source, the database
rather than a plausible story about the database. Then assert it mechanically,
so the question is re-asked on every run rather than once by whoever happened
to be reading.

**The general form for the write-up.** Documentation records what is true.
Tests record what must *stay* true. A fact written in a comment has no
mechanism to notice when something else changes around it - which is exactly
when the consequence bites. Three of this project's standing guards
(`tabBarClearance.test.ts`, `authEntryScreens.test.ts`, `userFacingText.test.ts`)
exist because a correct comment was not enough.

## The splash becomes a composition (2026-09-15)

**The fault was spacing, and it was the Profile screen's fault repeated.** The
splash was a flex column of four things -- mark, wordmark, title, subtext --
with a similar gap between each, and a spinner floating below them. Four evenly
spaced elements are four elements, not a design. When the space BETWEEN groups
equals the space INSIDE them, nothing reads as grouped, which is exactly the
diagnosis the owner made about the Profile screen a day earlier and made again
here unprompted.

**The composition now states its own grouping:**

- Mark and wordmark sit **4px** apart. One lockup, read as a single object.
- **36px** of air before the tagline. The group boundary, and it must be much
  larger than the gap above it or the lockup dissolves back into a list.
- **8px** between tagline and intro sentence, because those two are one group.
- The spinner is pinned near the bottom, far from everything, so it reads as
  machinery rather than as a fifth line of the composition.

**Placement is 42% of screen height, not 50%.** A composition centred on the
exact middle of a tall screen reads as adrift, because the eye takes the
optical centre to sit a little above the mathematical one.

**ONE mark size now serves both splash variants, and that reverses a recorded
decision.** `heroCompact` (0.22) existed because at 0.32 the mark "dominated the
screen and crowded the text block" -- true of the old flex column, where the
mark sat a few pixels above a wordmark it was three times the height of. It is
not true of a composition with a 36px boundary before the text. Two sizes also
had a cost the original note did not anticipate: the mark-only splash and the
full splash drew the mark at different sizes in different places, so the app's
two loading screens read as two screens from two different apps. The constant
was deleted rather than left unused.

**Decoration came from a dependency that was already there.** `react-native-svg`
is in the project for the check-in QR code, so real gradients were available
without a gated dependency change: a vertical gradient lifting the middle of
the field toward navy, and a radial glow behind the mark in the mark's own red
at 22%. The alternative -- stacked translucent discs, the technique the drawn
illustrations use -- bands visibly at this size, because a 300px halo built
from four discs has four edges in it.

**The hold now depends on which splash is showing.** 1500ms was fine for a
wordmark and became wrong the moment the screen carried about twenty words: a
new user saw it, could not finish it, and it was gone, which is worse than not
showing it because the app looks like it flashed something. The intro splash
holds 3200ms; the mark-only splash keeps 1500ms, because holding a returning
volunteer in front of a screen with nothing to read is a deliberate delay.

**Accepted limitation:** the native splash (app.json) can only draw a flat
colour and a centred image, so the glow appears and the mark rises about 3% of
the screen height at the native-to-JS handover. `imageWidth` was raised from
110 to 125 to match the JS mark. Expo's splash config has no vertical offset,
so the residual shift cannot be removed -- but it is a fraction of the jump it
replaces, which was a size change AND a position change.

## Brand strings get one home (2026-09-15)

`constants/brand.ts` holds the name, the tagline and the intro sentence,
because they had already drifted: the splash said "Volunteer Medical Outreach"
over "Connecting compassionate volunteers with communities in need of medical
care" while the login screen said "Virtual Health Unified Bridge" -- two
different descriptions of the same product, on two screens a new user sees
within seconds of each other.

**The two lines do different jobs and copy added later must keep them apart.**
`APP_TAGLINE` is what VHub IS: two short clauses at display weight under the
wordmark. `APP_INTRO` is what VHub DOES: a full sentence, quieter and smaller.
A tagline that explains is not a tagline, and an explanation compressed to
tagline length explains nothing.

## The carousel loses a slide and gains a test (2026-09-15)

Cut from three slides to two. The removed first slide made the same promise as
the one after it in weaker words, and three screens of copy before a Register
button is two screens more than anybody reads.

**The interesting part is what the cut exposed.** The bounce rule -- reverse at
each end rather than rewind, so every move is one slide wide and can travel at
a constant readable speed -- lived inline in two callbacks, where the only way
to check it was to watch the screen for twelve seconds. Asked whether the dots,
the auto-advance and the reversal still behaved at two slides, there was no way
to answer except by reasoning out loud.

It is now eight lines in `lib/carousel.ts` with no React in them, and
`lib/__tests__/carousel.test.ts` walks a two-slide carousel through a full
cycle. **With two slides every slide is an end**, which is precisely the case
worth having covered, and the tests confirm it ping-pongs 0,1,0,1 without ever
producing an out-of-range index. The dots needed no test: `PagerDots` renders
`SLIDES.length` of them and interpolates each off the scroll position, so it is
correct for any count by construction.

## Gemini gets a second, more useful job (2026-09-15)

**What Layer 2 actually does, and how little it changes.** `gemini.ts` answers
one question for the matcher: are these two skill strings the same skill?
"venipuncture" and "blood draw", yes. The payload is pairs of skill strings and
nothing else.

**In practice it almost never fires usefully, and the reason is structural.**
Both sides pick from the same fixed vocabulary in `constants/skills.ts` --
seventy-five entries, closed list, no free text anywhere. An organisation
cannot ask for "blood draw", because it is not an option; it picks
"Venipuncture" from the list, and so does the volunteer. Literal comparison
therefore already catches every real overlap, and Layer 2 spends quota
confirming that "Venipuncture" equals "Venipuncture". It earns its place only
against `RETIRED_SKILLS` and against rows written before the vocabulary
settled. **It is kept because it costs nothing when it agrees and is the
documented fallback path, not because it moves scores.**

**No personally identifying data reaches Google, and the policy already says
so.** The prompt carries skill strings and the fixed vocabulary. No name, no
email, no id, no free text about a person. `constants/policy.ts` already
carried an accurate paragraph -- it needed no correction.

**The genuinely useful job was the opposite one.** Not "are these the same?"
but "given what somebody just wrote, which of our skills do they mean?" An
organisation typing "breast cancer screening" finds nothing by search, because
"breast cancer" is not a skill and never will be, while clinical breast
examination, breast self-examination teaching and referral coordination all sit
in the list unfound. That is a gap no keyword search can close.

`server/geminiSkills.ts` + `/api/skill-suggest` do that, with three rules
enforced in code rather than trusted to the model: the reply is matched back
against `ALL_SKILLS` and anything invented is dropped; it RANKS rather than
filters, so the full list stays browsable underneath; and it never applies
anything. One call per press, never per keystroke, on a 10/min bucket.

**Unavailable is a 200 with an empty array, not an error.** No key, timeout,
quota gone and nothing relevant are the same answer to a screen: show the
picker it was going to show anyway.

## Prompting beats scoring for thin skill profiles (2026-09-15)

Somebody who ticks three skills is usually not less capable than somebody who
ticks twenty. They read the list, recognised the three they would say out loud,
and stopped. The rest goes unticked because nothing prompted them.

`SKILL_AFFINITIES` in `constants/skills.ts` holds the sets that genuinely
travel together at a Ghanaian outreach -- the screening table, the front desk,
the needle set, the maternal set. It needs no Gemini, works offline, spends no
quota and cannot invent anything.

**The first draft named nine skills that do not exist** ("Crowd control",
"Immunisation", "Pharmacy dispensing" and others), because it was written from
memory rather than from the file. `companionSkills` drops unknown entries,
which is correct at runtime and is exactly what hid the mistake -- the feature
"worked" while a third of the table was dead. `constants/__tests__/
skillAffinities.test.ts` now asserts every suggestion exists in the live
vocabulary.

## Clinical and support stop meaning verified and unverified (2026-09-15)

Both words had only ever appeared beside verification, which taught everyone
that clinical means verified and support means unverified. It does not.
Clinical is hands-on care; support is what makes the event run; verification is
a CONSEQUENCE of the first, never its definition.

**Two real costs.** A verified nurse reads "support" as beneath her and never
applies, when support roles are where an extra pair of trained hands is most
useful. And an organisation ticks "support" to stop the gate blocking
applicants, taking the credential check off work that needed it.

**It is a diagram, not a paragraph.** `RoleTypeExplainer` puts the two side by
side with four examples each -- a comparison is the thing a paragraph is worst
at. The verification line sits UNDERNEATH both columns rather than inside the
clinical one, because attaching it to that column is how the misreading was
taught in the first place.

**Placed before the choice is made**, not after: the volunteer's first
onboarding step, and `RoleBuilder`, which is the control where an organisation
picks role type.

## The Info Hubs get a map (2026-09-15)

Both hubs were a stack of collapsed sections, which is a table of contents
written as furniture: to find out whether the screen answered your question you
had to open things. Somebody unsure what they wanted opened nothing and left.

`GlanceGrid` names every idea on the screen in two words and a handful, so the
decision to keep reading takes two seconds. It is deliberately **not
tappable**: it makes no navigation promise it would have to keep, and the
sections it describes are directly underneath.

**Nobody visits either hub unprompted**, which made the placement the real
problem rather than the content. `HintRow` puts one quiet line on each home
screen. Not a card, which would compete with the outreaches the screen exists
for, and not dismissible, which needs somewhere to remember the dismissal and
hands the least engaged user a way to remove the thing aimed at them. One line
survives being seen fifty times, which is the test a permanent hint has to pass.

The volunteer feed carries a second line, because nothing told a volunteer that
the skills on their profile decide what the feed shows them -- so a thin profile
read as a quiet platform rather than a fixable setting.

## Support roles stop being scored on clinical skills (owner-approved 2026-09-15)

**The unfairness was real, but not where it was thought to be.**

The owner's reading was that a volunteer who ticks three skills is capped below
one who ticks twenty. **That is not true, and has not been since August.**
`skillsScore` divides by the REQUIRED skills, never by the volunteer's own set:

```ts
return matched / requiredSet.size;
```

Holding twenty skills confers no advantage unless they are the required ones.
Three matching skills out of three required scores a full 35/35. The August fix
protects both directions of the same division.

**The actual fault was that support outreaches were scored on skills at all.**
`role_type === 'support'` already forced the Category component to 1.0 for
everyone, on exactly this reasoning -- a registration desk needs no particular
profession. Skills, the LARGEST component at 35 points, had no such override.

**And it was live, not theoretical.** The wizard required at least one skill on
every outreach, so support events carried requirements the organisation never
really meant, and the matcher ranked volunteers against them. A student who
ticked what they knew this semester, or somebody who simply wants to help and
identifies with no skill, ranked low for work they would have been perfectly
good at, saw fewer events, and stopped.

**Two changes, and they have to go together.** The matcher now forces the
skills component to 1.0 on a support outreach, beside the category override and
for the same stated reason. The wizard now requires skills only when some role
is clinical. Without the first, existing support rows keep their accidental
requirements; without the second, organisations keep being asked for data that
is then ignored.

**The organisation still sees the skills**, on the applicant card. This changes
the ranking, not what anybody is shown.

**Not done, deliberately:** redistributing the 35 points across the other four
components on a support event. It is arguably more correct and it would move
every stored score, so it stays a separate decision.

## Three bugs, one shape: a guard that hides what it guards against

**Worth collecting, because it has now happened three times in a week.**

- **The tab bar clearance.** A rule in CLAUDE.md was followed on the fourteen
  screens its author took it to mean, and the audit that checked it grepped for
  the helper -- which can only ever return the screens already correct.
- **The login dead end.** A docstring stated the interaction exactly ("a
  volunteer with incomplete onboarding never reaches this check") and nobody
  asked what the stated fact cost.
- **The skill affinity table.** Nine of its entries named skills that do not
  exist, because it was written from memory rather than from the file.
  `companionSkills` filters anything not in the live vocabulary -- correct
  runtime behaviour, and precisely what made the mistake invisible: the feature
  worked, quietly, with a third of its table dead.

**The common shape is not carelessness.** In each case a defensive mechanism
was doing its job, and doing its job is what removed the symptom that would
have revealed the fault. A filter that drops bad input, a router that declines
to guess, a rule applied to the cases its reader recognised -- all three are
right, and all three are silent.

**The fix is the same move every time: enumerate from the authority, not from
the code that is supposed to comply with it** -- the navigator's registration
list, the AST rather than a regex, the vocabulary rather than memory, the
database rather than a plausible story about it. Then assert it mechanically,
so the question is re-asked on every run.

Four standing guards now exist for this reason: `tabBarClearance.test.ts`,
`authEntryScreens.test.ts`, `userFacingText.test.ts` and
`skillAffinities.test.ts`. Each one exists because something correct was also
silent.

## The notifications inbox becomes cards, and learns what it is showing (2026-09-19)

Owner, on seeing the screen: it "looks outdated". That was the whole brief, and
it turned out to be the smaller half of what was wrong.

**A DEPARTURE FROM CLAUDE.md RULE 7, stated plainly.** The rule is "match the
Figma designs; do not invent alternative layouts for screens that exist in
Figma", and `design-refs/Notifications.png` exists. The design is a full-bleed
row list: a 44dp icon circle, title, body, a hairline rule, and unread carried
by a tinted fill plus a four-pixel coral bar down the left edge. It was
implemented faithfully and it is now the last list in the app drawn that way.
Every other one -- the feed, the applications tracker, the roster -- moved to
bordered white cards on a padded ground during the card-language work of
2026-09-16 to 2026-09-18. The design is not wrong; it is simply older than the
visual language the rest of the app arrived at, and the owner asked for the
screen to be brought forward. The layout is now the feed card's container, to
the token.

**The left colour bar went for the reason it went from the application cards.**
A colour means something only to somebody who has been told the key, and
nothing told anybody. Unread is now three cues, one of them a word: a "NEW"
badge, a faint warm ground, and full-strength title text against the muted read
state. The word is the cue that survives a red/green deficiency and bright
sunlight, which is where a volunteer actually checks these.

**THE REAL FAULT WAS NOT THE STYLING.** `notifications.type` holds only four
values -- `new_match`, `application_status`, `event_reminder`, `test` -- and
nine genuinely different pieces of news travel through them, because adding a
fifth would be a schema change for something the payload can already carry. So
six endpoints write a discriminator into `data.kind` (`new_application`,
`credential_review`, `organisation_verification`, `dispute`, `moderation`,
`score_event_voided`) and the application decisions write theirs as a status.
Nothing on the client read any of it. An identity-verification approval, a
dispute outcome, a suspension notice, a reversed V-Score deduction and an
ordinary application update all arrived wearing the same blue clipboard icon
and the same words above them. `lib/notificationPresentation.ts` now reads kind,
then status, then type, and gives each one a caption in words above the title.
No migration: the data was already being sent and already being stored.

**And a real routing bug fell out of the same gap.** The screen decided where a
tap went with two questions: does it have an `outreach_id`, and failing that is
it an `application_status`. A credential decision has neither an outreach nor
anything to do with applications, so "Your documents have been approved" opened
the Applications tracker. Destinations now come from
`notificationDestination(notification, audience)`, which also answers whether
there is anywhere to go at all -- so the card's "View" affordance and the tap
are driven by one function and cannot disagree. `moderation` and `test`
deliberately return null: a suspension refers to the state of the account,
which the home-screen banner already states, and a test push exists only to
prove delivery. Sending either somewhere plausible would teach people that
tapping a notification does something unpredictable.

**One judgement call worth recording.** An application decision carrying an
`outreach_id` used to open the outreach page and now opens the tracker. The
tracker's card states the status in words, says what it means for the
volunteer, and gives a waitlisted volunteer their live place in the queue; the
outreach page states none of that. Matches and reminders still go to the
outreach, because there the event itself is the subject.

### The guard was vacuous on its first attempt, again

The test walks `api/src` and extracts every literal kind written into a
notification payload, so the list comes from the authority rather than from the
map that is supposed to comply with it -- the lesson of the section above. Its
first assertion was behavioural: does this kind render as something other than
the fallback? **It passed with an entry deleted from the map.** An unrecognised
kind falls back to its `type`, and for all six of these the type is
`application_status`, which renders as a perfectly ordinary blue "Application
update" card. The check reported success while the notification had silently
lost its identity -- exactly the fault it existed to catch, one layer up.

It now asserts against `RECOGNISED_NOTIFICATION_KINDS`, the map's own keys,
which is a direct statement rather than an inference from behaviour. Verified
by deleting an entry: the old assertion passed, the new one fails and names the
kind. A floor assertion (`at least six kinds found`) guards the regex itself,
so a refactor of the API that stopped the scan matching would fail loudly
instead of silently checking nothing.

**Also tightened while there:** `NotificationPresentation.icon` was typed
`string`, so a misspelled glyph name would have rendered as an empty square
with nothing to notice it. It is now typed against MaterialCommunityIcons' real
glyph map through a type-only import, and a deliberate typo was confirmed to
fail the typecheck.

## Onboarding stops ending in Settings (owner-approved 2026-09-21)

Two decisions from earlier in September were each right about the fault they
fixed and each created the next one. This records the pair, because the shape
recurs.

**September 11.** `app/(auth)/onboarding/complete.tsx` was deleted. It sat
between signing the declaration and uploading the credential, so a volunteer
finished the wizard, was congratulated, and met the single outstanding task as
an optional-looking card on a celebration screen. Easy to walk past without
ever registering that anything was left. Removing the celebration and sending
them straight to the upload screen fixed exactly that.

**September 21.** The owner, running the flow as a new user: "after I have
selected my document I should be directed to the finished onboarding screen,
not do the identification in the settings then take me to the settings page.
Is this how to welcome a new user?" She is right. The upload screen is
`app/(volunteer)/verify-identity.tsx`, which is reached from Settings and looks
like it, so the last thing a new volunteer saw at the end of registering was
the app depositing them in a settings screen.

**The resolution is not a compromise between the two.** The upload moved INTO
step 5, so the completion screen no longer stands between anybody and an
outstanding task: it reports the outcome of one already attempted. That was the
whole of the original objection, and it is gone rather than traded away.

- **The API constraint was never a screen constraint.**
  `/api/verification-document` refuses a document while `declaration_signed` is
  false. That orders two SERVER CALLS. It had been implemented as an order on
  two SCREENS, which is where all of this came from. `persistAndFinish` now
  writes the declaration and then uploads, on one press.
- **The upload is best-effort and the completion screen reads the profile.**
  `credential_document_id` is server-only, so its presence proves the endpoint
  ran; a flag passed through navigation would only record that the app tried. A
  cancelled file picker is reported as "no document yet" rather than assumed to
  have worked.
- **The outstanding document still does not block anything**, and the screen
  says why: support roles are open to an unverified volunteer, so a gate would
  be wrong. Silence was the bug, not permissiveness.
- **The two ticks are now visibly two things.** The owner asked why she had to
  confirm twice. The accuracy declaration and the document-storage consent are
  genuinely different agreements, and consent must be written in the same
  statement as the document so it cannot be inferred from the declaration. They
  were on two screens with nothing saying so; they are now adjacent and each
  labelled.

**The generalisation.** Both decisions were made by looking at one screen's
fault in isolation. Neither asked what the LAST screen of the flow would be
afterwards. A fix that relocates a step changes the ending of the journey, and
the ending is the part a person remembers.

---

## The bottom of the screen is not a place to put an answer (2026-09-22)

The owner had asked three times for this, escalating each time, and the third
time was the one that made the pattern visible rather than the instance: "never
should a notification/btn/alert of anything that shows after something is
submitted show at the bottom". The specific report was a suspended volunteer
tapping Quick Join and seeing nothing happen.

**Nothing had failed silently. The app had explained itself, in the wrong
place.** The database trigger that stops a suspended account applying returns a
plain sentence, `humanError` passed it through intact, and the screen rendered
it at the very foot of a long scroller, below the verification gate, under the
floating tab pill. Every ingredient worked and the message landed somewhere
nobody was looking.

**Why it kept recurring.** Each previous instance was fixed as a layout
question about one screen, and one of those fixes made it worse in an
instructive way: the Edit Outreach save failure was moved from the bottom of the
form INTO the pinned footer, on the reasoning that pinning it to the button that
caused it stops it scrolling away. The pinning was right. The footer is still
the bottom of the screen.

**So the fix is a component rather than a set of screens.** `ErrorAlert` renders
a mutation's error as a centred dialog over a dimmed scrim, the same mechanism
as the Sign Out confirmation, and it is a one-line replacement for the inline
red text at every site. Eighteen of those were converted. Three things decided
the shape:

- **Dismissal is derived, not an effect.** The dismissed error is remembered by
  identity, so a genuinely new failure reopens the dialog while the one just
  acknowledged stays shut. An effect would have meant another
  `set-state-in-effect` suppression for nothing.
- **A success receipt is a different thing from a refusal**, so `Toast` was kept
  and moved to the TOP rather than folded into the dialog. A toast is for
  something that plainly worked and whose result is already on screen; it
  requires nothing and takes itself away. A refusal has to be read.
- **A bottom sheet gets a banner, not a dialog.** A sheet is already a `Modal`
  and stacking a second on it is the arrangement that misbehaves on Android, so
  `SheetError` sits at the top of the sheet and outside its scroller.

**Field validation deliberately did not move.** "Write a reason before deciding"
under the reason box is attached to the control it is about, and the person is
looking at that control. Converting those would have been reading the rule as a
ban on inline text rather than as a rule about where an ANSWER goes.

## Two account decisions were never emailed (2026-09-22)

The organisation-verification decision and the volunteer credential decision
each wrote an in-app notification and sent a push, and no email. That is the
correct pair for almost everything the app sends, which is why the gap survived:
a match, a reminder and an application decision all happen while somebody is
using the app or about to.

These two are different, and the difference is the rule for anything added
later. The wait is long and open-ended, because the decision is made by one of
us whenever the queue is next opened, so the person has closed the app. A push
is not durable: no token, notifications refused, a reinstall, or one swipe, and
it is gone. And the decision blocks the whole ACCOUNT rather than one event, so
until it is read an organisation cannot publish anything at all.

**The rejection reason travels and the approval reason does not.** A reason is
required for both outcomes, but they are written for different readers: a
rejection's is addressed to the organisation and is the only thing telling it
what to fix, while an approval's is a note for the next admin explaining why
thin evidence was accepted. Publishing the second kind would change what an
admin can honestly write in it. What the organisation was actually missing was
not the note but any acknowledgement that a person had looked, and when, so the
verification screen now states the decision date for both outcomes.

## A rejected credential document was invisible (2026-09-22)

`app/(volunteer)/verify-identity.tsx` chose between the upload state and the
document state by asking `status === 'unverified'`. That reads as "do they have
a document?" and is the same question only until the first rejection.

A rejection sets the status back to `unverified` and deliberately KEEPS the
file: destroying it would leave the volunteer unable to see what they had sent,
and would erase the evidence behind a decision the audit trail had just
recorded. So a rejected volunteer was shown the empty upload state, with "No
document uploaded yet" printed directly underneath a card explaining why the
document they could not see had been turned down.

The branch is now on `hasDocument`, which is what it always meant. The "What
should I send?" link moved out of the upload branch at the same time, because
the person whose document has just been sent back is precisely the reader it
exists for, and it was rendered only when there was no document at all.

## The notification row, again: a preview is not the same as a short row (2026-09-22)

The first pass at the owner's "the boxes are too big" shortened the row by
about a third and deliberately did not truncate the message, on the reasoning
that two of the nine kinds of notification (a suspension, a test push) have no
destination, so their row is the only place their text is ever read.

That reasoning was sound and the conclusion was still wrong. **The answer was
not to leave the message unclamped; it was to give those rows somewhere to
open.** A navigable row now opens its screen and a row with no destination
expands in place, and the trailing glyph says which it will be. The clamp could
not have shipped on its own, which is exactly why it did not; what was missing
was the second half of the feature, not permission to truncate.

**And the row read as centred because four things were eating the text column
at once.** The owner asked why the text was centred with space on both sides.
It was not centred. The screen's list inset (24), the card's own padding (16),
the gap after the icon (12) and the chevron with its own gap (32) came off both
ends, leaving roughly 250px of a 400px screen for the words. Short lines in a
narrow channel with wide empty margins either side is indistinguishable from
centred text, and every one of those four numbers had been chosen sensibly in
isolation. **The lesson is that horizontal padding compounds and nothing in the
code makes that visible**: each value looks reasonable where it is written, and
only their sum is wrong.

**"Plain and dull" was solved with state rather than decoration.** The icon tile
is filled with the notification's tone while unread and only tinted once read,
and the New badge and chevron take the same colour. That adds colour that is
carrying information, rather than a coloured bar down the left edge, which was
removed from these rows once already and would have been decoration saying
nothing the row does not already say three other ways.

## A test push, because four failures look identical from inside the app (2026-09-22)

The owner confirmed the push toggle was on and notifications still were not
arriving on her phone. Nothing in the app could distinguish the possibilities,
and there are four: this device never registered a token; the token was removed
(a sign-out on that phone, or a reinstall); Google accepted the message and
Android chose not to show it; or the send never happened.

`sendTestPush` already existed in the API client and had no button anywhere.
Settings, Notifications now has one, and each outcome is a different diagnosis
rather than a different wording of the same one. It can only ever target the
caller's own devices.

**The switch being "on" was never evidence that the token exists.** It reflects
the operating system permission, which is a separate thing from the row in
`push_tokens`, and the two can disagree in exactly this direction: permission
granted, token never written. That is the case the test names.

---

## Search, and the three things it could not honestly show (2026-09-22)

`app/(volunteer)/search.tsx` had been a twelve-line stub rendering the word
"Search" since the scaffold, registered with `href: null` and linked from
nowhere. The design for it had existed the whole time.

**The gap it filled was real and larger than the screen.** The feed filters by
region and role type and orders by match, which answers "what suits me". Nothing
in the app could answer "where is the eye screening in Kumasi", so finding one
specific thing meant scrolling a ranked list until it appeared.

**The searching itself is two queries, not one clever one.** The text columns go
through `.or()` with `ilike`; the required skills go through a second request
using an array overlap. Folding the array into the same `.or()` is possible in
principle and fragile in practice, because the array literal's own commas
collide with the comma that separates one filter from the next, and the failure
mode is not an error but a query that quietly matches the wrong rows. Two
bounded requests merged by id are cheaper than that bug.

**The skill search goes through the vocabulary rather than the column**, which
is the part worth keeping. Skills are a closed list, so the term is resolved to
real skill names on the client before the query runs. That is what makes
"triage" find an outreach whose description never uses the word, and it costs
nothing, because the list is already in the bundle.

### Three things the design shows that the app cannot truthfully draw

This is the part that generalises. Each was a small decision and each one was a
choice between an honest gap and a plausible fabrication.

- **The match percentage.** `/api/match`'s `rank_feed` mode ranks a REGION, not
  an arbitrary list of ids, so a text query has no score to fetch.
  `MatchScoreBadge` already refuses to invent one and renders "NOT RANKED YET"
  instead, which is exactly right on the feed, where an unranked card means the
  ranking service was unreachable. On the search results it would be a row of
  identical pills reporting an outage that is not happening. The card gained
  `showMatchScore` and search passes false.
- **"1.2 miles away".** An outreach stores a region, a district and a venue
  name, and no coordinates. There is nothing to measure from.
- **"Runs this week".** The date chips are measured from the day an outreach
  STARTS, because that is what `outreaches.date` holds. The broader reading
  would mean consulting `outreach_days`, whose answer arrives after the list is
  already drawn and would then change it under the volunteer's thumb. So the
  chips say "Starting today" and "Next 7 days" and the result line says
  "starting", and the narrower meaning is stated rather than implied.

**The rule these share:** where the data cannot support what a design promises,
the options are to narrow the promise or to fabricate. Narrowing is only
acceptable when the narrower claim is made out loud, which is why all three of
these are visible in the copy rather than buried in a comment.

## A sentence that told an admin the opposite of what the code does (2026-09-22)

`app/(admin)/disputes.tsx` told the admin, on the screen where a dispute is
decided: "Upholding records the correction and tells both parties. It does not
recalculate the volunteer's V-Score. That change is separate and is not switched
on."

That was true when it was written and stopped being true on 2026-08-26, when the
V-Score reversal was approved. Upholding now voids the disputed event and
replays the volunteer's entire history on top of that. The endpoint's own
docstring says so in full; only the screen was left behind.

**It is not a cosmetic slip, and the reason is the placement.** The sentence sat
directly above the reason field, at the moment the admin was weighing whether to
uphold. It told them the decision was symbolic. A marginal dispute could
therefore be upheld in the belief that it cost the organisation nothing, or
refused in the belief that upholding would achieve nothing for the volunteer.
Both are real decisions made on a false premise supplied by us.

**The general form:** when a gate opens, the copy on the screen that describes
the gate is part of the change. CLAUDE.md already carries this rule for the
privacy policy, where a claim that stops describing the code IS the bug. It
applies to every explanatory sentence in the app, and explanatory sentences
attached to a decision are the ones where it costs most.

## iOS is a future improvement, and the reason is credentials (decided 2026-09-22)

**Decision: Android is the target platform for this project. iOS is recorded as
a future improvement rather than an omission.**

The codebase was read for platform-specific risk before this was decided, and
nothing in it is Android-only. Every dependency is Expo-managed and ships iOS
support; safe-area insets are handled through `react-native-safe-area-context`
on every screen; the date and time pickers already branch to the iOS spinner;
and keyboard avoidance uses `padding` on both platforms rather than the
iOS-only ternary it started with. There is no reason to expect a build to fail.

**What actually blocks it is not the absence of a Mac**, which is the assumption
worth correcting. EAS builds iOS on Apple hardware in the cloud, so no Mac is
required. What is required is a paid Apple Developer Program membership: a build
cannot be signed without one, and an unsigned build cannot be installed on a
physical iPhone. A simulator build needs no account, but a simulator only runs
on macOS, so that route is closed for the same reason.

**Two concrete gaps would have to be closed first**, and they are recorded here
so the work is a known quantity rather than a discovery:

- `ios.bundleIdentifier` is absent from `app.json`. Every iOS build needs one,
  and like the Android `package` it is permanent once published.
- There is no APNs key. `google-services.json` is the ANDROID push credential;
  iOS push needs its own, uploaded to Expo. Without it, push would silently fail
  on iOS while every other feature worked, which is the worst shape a gap can
  take.

**What would need testing rather than reasoning**, if it is ever built: the date
and time pickers, the floating tab pill against the iPhone home indicator, the
camera QR scan, and keyboard avoidance on the long forms. All four are coded for
both platforms and verified on neither.

## Search, confirmed against real data (2026-09-22)

The owner ran it immediately after it shipped. Typing a place name ("Nima")
returned the open event there; typing "eye" returned the one matching outreach.
Both paths that were built are therefore exercised: the first is the plain
`ilike` across the text columns, and the second is the vocabulary route, where
the term is resolved to real skill names before the query runs so that an
outreach requiring an eye-related skill is found whether or not its description
uses the word.

## The AI tooling was already excluded from the repository (2026-09-15, restated)

`CLAUDE.md`, the whole `.claude/` directory including the six subagent
definitions, and `docs/VSCODE_PROMPT_GUIDE.md` are listed in `.gitignore` under
a comment recording the decision: this is a public repository and the tooling
used to build the project is not part of the deliverable. They were untracked
with `git rm --cached`, which leaves them on disk and working, because
`CLAUDE.md` is read from the filesystem rather than from git.

**Nothing further is needed before or after an EAS build**, and the reason is
worth stating because it is not obvious: a build bundles only what Metro
resolves starting from the app entry point. Markdown files in `docs/` and
configuration in `.claude/` are not reachable from any `import`, so they have
never been in the APK and could not be, whatever git does with them.

## The notification row, third attempt, and the one that had a reference (2026-09-22)

Two rebuilds of this row were done against a description of what was wrong with
it. The third was done against a picture of what right looks like, and it took
one pass.

**The owner supplied a banking app's inbox** and asked for that anatomy with
emojis in place of its photographic thumbnails. Holding it beside the VHub row
made three faults obvious that no amount of adjusting the previous version would
have found, because each was a thing being said twice.

- **The uppercase caption was a third statement of the same fact.** A row read
  "APPLICATION UPDATE", then "You're confirmed!", then "Ghana Health Drive: your
  application is now accepted." Three lines, one event. The caption had been
  added for a real reason -- nine kinds of news share four `type` values, and a
  single blue clipboard icon could not tell a credential approval from a dispute
  outcome -- but that was an argument about the ICON. An emoji answers it
  better and takes no line of its own. The caption survives in the accessibility
  label, where it costs nothing.
- **The timestamp goes back under the message**, which reverses an earlier
  decision made in this same file. It had been moved up to the caption line
  because a time under a short message in a rounded box is the single strongest
  signal of a chat bubble. **That diagnosis was right and the cure was aimed at
  the wrong half.** It is the box that makes a bubble. With the per-row box
  gone, a small grey time under a sentence is a dateline, which is what the
  reference and every news list uses.
- **The per-row box became one panel per day.** This is not the full-bleed list
  with hairline dividers that was called outdated either. It is a grouped list:
  the app's card language applied at the level of the GROUP instead of being
  repeated eleven times down a screen. `first` and `last` are computed in
  `toNotificationRows`, where the grouping already happens, and the corners live
  on those two rows -- there is no wrapper View, because a FlatList renders rows
  rather than sections and wrapping them would give up the recycling that makes
  a long inbox scroll.

**The emoji introduced a new silent-failure shape and it is guarded.** A
misspelled MaterialCommunityIcons name renders as an empty square and nothing at
runtime notices, which is why `icon` is typed against the glyph map. A string
cannot be typed that way, so an absent or empty emoji would render as a blank
tinted tile that looks deliberate. `notificationPresentation.test.ts` now walks
every recognised kind, every application decision and every `type` and asserts
each resolves to a real emoji. **The guard was verified by emptying one entry
and watching it fail**, per the standing rule about guards that pass while the
thing they guard is broken.

**The emojis are chosen from the pre-Emoji-5.0 set.** A 2021 emoji renders as an
empty box on an Android that is otherwise perfectly capable of running the app,
and nothing reports it. That is the same class of invisible fault as the icon
name, arriving by a different door.

## Map discovery and Rate Organization are scoped out (decided 2026-09-22)

Both have Figma designs and neither is built. The owner asked for them to be
recorded as future improvements alongside iOS, which is the right call for both,
and the reasons are different enough to be worth separating.

**Map discovery is blocked on data, not on effort.** An outreach stores a
region, a district and a venue NAME. It has no coordinates and nothing in the
schema has ever produced any. A map screen therefore has nothing to place on it,
and the work is not the screen: it is a map dependency, a native rebuild, and
then either a geocoding step at creation time or a coordinates column plus a way
to fill it for every outreach that already exists. Against that, the question a
map answers -- "what is happening near me" -- is already answered by the region
filter on the feed and, since today, by keyword search over the venue and
district. It would be a large change buying a second route to an answer the app
already gives.

**Rate Organization is blocked on a decision, not on data.** `event_reviews` is
one-directional by design: it is the organisation's review of a volunteer, and
it feeds the V-Score. The reverse is not a mirror of it. It needs answers first:
is a volunteer's rating of an organisation visible to other volunteers, does it
feed anything or is it advisory, and what stops a rejected applicant leaving a
punitive review of the organisation that rejected them. Those are product
questions with consequences for people's reputations, and building the table
before answering them would settle them by accident.

**The general point, which applies to the whole `design-refs/` folder:** a
completed design is not evidence that the data supports it. Three screens in
that folder promise things the schema cannot supply -- a match percentage on a
search result, a distance in miles, a map pin -- and in every case the honest
move was to narrow the promise in the copy or to leave the screen unbuilt, never
to invent the number. Where a design and the data disagree, this repository
follows the data and says so.

## The push said it worked because nothing read the answer (2026-09-22)

The owner tapped the new test-push button. The in-app row appeared, the app
reported the test had been sent, and **the phone never made a sound.** That
combination was, until now, undiagnosable from inside VHub, and the reason is a
single unread response body.

`dispatchExpoPush` fired the request and checked the HTTP status. That is the
wrong thing to check, in the most misleading possible direction. **Expo answers
200 for a request it has ACCEPTED**, then reports what happened to each
individual message in a ticket array in the body. A push that can never be
delivered -- an Android FCM credential that does not match the one compiled into
the installed app, a token belonging to an app since reinstalled -- comes back as
200 with an error ticket saying exactly which of those it is. So the one place
the real reason was written was the one place nothing looked.

It was made worse by what the endpoint returned. `dispatched` was
`tokens.length`: a count of rows in our own table, a number the push service
never sees. The app reported "sent to this device" on the strength of it while
every message was being rejected. **A success figure that cannot fail is not a
success figure.**

Now: the tickets are parsed, each distinct failure is logged with its Expo error
code, `dispatched` counts what Expo ACCEPTED, and the reason travels back to the
screen so it can name the fault instead of guessing. `MismatchSenderId` and
`InvalidCredentials` both mean the build's push credential is wrong and no
setting on the phone will help; `DeviceNotRegistered` means the token is dead
and re-registering fixes it. The copy distinguishes them, and says plainly that
accepted is still not delivered.

**This is the same rule, broken in a third place.** "Do not fail loudly here"
must be implemented as *record it where it can still be read*, never as *forget
it*. The swallowed email failures and the discarded post-sign-in auth error were
the first two.

## A notification written at 5:13 was not on the list at 5:15 (2026-09-22)

The rows were there the whole time. Nothing was ever going to fetch them.

React Query refetches a stale query when its component MOUNTS. The notifications
screen lives inside a tab navigator, which mounts it once and then keeps it
alive for the rest of the session. Its other trigger, `refetchOnWindowFocus`, is
a browser idea: there is no window to focus on a phone. So between one mount and
the next app restart, **the only thing that could refresh the inbox was the user
dragging it down** -- and somebody who has not been told a notification exists
has no reason to drag.

`useFocusEffect` is the mobile equivalent of the focus event and fires on every
navigation to the screen, tab switches included. With a one-minute `staleTime`
it costs at most one query per visit on a per-user table capped at 100 rows.

**It is not a substitute for push and must not be read as one.** It closes the
case where somebody opens the inbox themselves. It does nothing at all for
somebody who does not know there is anything to open, which is the case push
exists for and the reason the delivery fault above still matters.

## Profile and Settings become one screen (2026-09-22)

The owner called the separation "kind of a mess" and asked for one screen in a
stated order: name details, then the V-Score card, then the settings. She is
right, and the mess had a specific shape worth recording because it is a
general one.

**The boundary between the two screens was never decidable.** Identity
Verification is arguably profile. Edit Profile is arguably settings. My Feedback
is neither. Every row needed an argument about which of two screens it belonged
on, and the git history shows several of those arguments being had more than
once, with rows moving back and forth. A boundary that has to be re-litigated
per item is not a boundary; it is two screens that want to be one.

**The duplication was the visible symptom.** Both screens carried their own
identity header, at two different sizes, and on the organisation side the two
disagreed about what the organisation is called: Profile read
`profiles.full_name` while Settings read `organisation_profiles.org_name`. Those
are different columns and can legitimately hold different strings, so the app
could show an organisation two different names one tap apart. The merged screen
reads `org_name`, because that is the name volunteers see on an outreach.

**What did NOT get merged**, and the distinction matters: the forms. Edit
Profile, Account & Security, Identity Verification and notification settings
remain their own screens. Merging two screens that held only NAVIGATION ROWS is
not an argument for inlining the things those rows lead to.

**The trap in doing it** was the back destinations. A tab group keeps no history
of its own, so `ScreenHeader` navigates to an explicit `fallback`, and ten of
those pointed at a settings route that no longer exists. A stale fallback is not
a crash and not a type error: it is a silent wrong destination, exactly the
class of bug that produced "back goes to Settings" a week earlier. They were
found by grep rather than by the compiler, which is worth remembering.

## The settings row stops arbitrating and starts stacking (2026-09-22)

`SettingsRow` put the label and the value SIDE BY SIDE, and that one row had
been broken three separate times:

1. Label given `flex: 1`, value keeping its content width: "Login email &
   password" squeezed the title to roughly one letter per line.
2. Label given a fixed basis instead: the value starved, producing
   "Not / verifi / ed".
3. Both given pixel floors: correct until the phone's font scale moved, which
   is how "Notificatio / ns" happened.

Each fix arbitrated between two text nodes competing for about 230dp on a 360dp
phone. **None of them questioned the competition.** Stacking the value under the
label gives each the full column and the contest does not exist: no
`scaleWithFont` floors, no `numberOfLines` caps, no `prefersStackedLayout`
branch, no measurement, no hook subscription. The owner's reference design
stacks them too, which is how the question came to be asked at all.

**A consequence to be aware of:** `scaleWithFont`, `prefersStackedLayout`,
`useFontScale` and `clampedFontScale` in `constants/typography.ts` now have no
callers. They are KEPT deliberately, because the standing rule that any layout
constant sized by the words inside it must go through `scaleWithFont` still
applies to the next fixed-width row somebody writes. CLAUDE.md was corrected so
it no longer points at `SettingsRow` as the worked example, which it is not any
more.

## The status bar was not covered, it was invisible (2026-09-22)

The owner: "it seems the app has covered my phone status bar, like my time and
battery, so unless I pull from the top to show then I swipe up and it is gone."

**Both halves of that description are real and they have different causes.**

VHub genuinely draws BEHIND the status bar. That is edge-to-edge, which Expo
SDK 57 turns on by default and Android 15 enforces, and it is correct: the clock
and battery are painted on top of the app rather than in a reserved strip. The
same change is why every form in the app needs a `KeyboardAvoidingView`.

What was wrong is the COLOUR of those icons. The root layout asked for
`<StatusBar style="auto" />`, and `auto` resolves from the DEVICE colour scheme,
not from the app. VHub pins `userInterfaceStyle` to "light" and every screen
except the welcome hero has a white ground, so on a phone set to dark mode
`auto` asked for WHITE icons and put them on white screens. Invisible icons over
app content look exactly like the app having covered the bar, and pulling the
shade down reveals them because the shade brings its own dark ground with it.

**The second cause is that `expo-status-bar` is last-writer-wins with no
restore.** The welcome screen correctly asks for light icons, because its hero
is near-black. When it unmounts, nothing puts them back: the root component does
not re-run, because its own props never changed. So a single pass through
welcome left white icons for the rest of the session, whatever the device's
colour scheme was.

The fix addresses both. The root now says `dark`, which is what a light app
always wants and which does not consult the device. Each of the three role
groups asserts `dark` again on entry, which is what undoes an override left
behind by a screen outside the group. `welcome` keeps its `light`, because it is
the one screen where white icons are correct.

**The general shape:** an imperative global with no restore is a resource that
has to be released, and React gives no warning when it is not. The same trap
applies to anything else set that way; there is nothing else today.

## Two rows removed, and what had to be kept when they went (2026-09-22)

The merged Profile screen shipped with two rows the owner asked to remove. Both
removals were right and neither was free.

**Close Account was a second door to Account & Security**, listed directly under
the row that opens the same screen. On a merged page that is plain duplication.
But the row existed for a reason recorded a day earlier: she could not find
closure at all, because it is the last block INSIDE Account & Security, under
the login email and the password form, so finding it meant knowing that closing
an account is filed as a security matter. **Deleting the row silently would have
walked straight back into the original complaint**, so the value line under
Account & Security now names closure: "Login email, password, and closing your
account". One row, still findable.

**"See your notifications" was a link back to where the reader came from.** The
inbox has a bell on both home screens and a row one tap away from the
notification settings screen. A third door to it, on the screen ABOUT it,
pointed at the place most of its readers had just left.

**The general rule this pass keeps running into:** a row added to fix
discoverability is not the same as the thing being discoverable. When such a row
is later removed as duplication, the discoverability it was buying has to be
bought again somewhere else, or the original bug returns with nothing recording
that it was ever fixed.

## The notification toggle stops being a card (2026-09-22)

Owner: "toggles don't need those boxes". The push switch was a bordered card
with a divider and a panel of reassurance text inside it, built before
`SettingsRow` existed, so that screen carried two different treatments for rows
doing the same kind of job, and the box drew a frame around a control that
needed separating from nothing.

`SettingsToggleRow` now lives in the same file as `SettingsRow` and shares its
style objects outright: the same slab, radius, gaps and icon column, with a
switch where the chevron sits. **Sharing the file is the point.** The two rows
drifted apart the first time precisely because they were defined in different
places, and two components that must look identical will not stay identical
across two files. The reassurance sentence moved out of the panel and onto the
page as a plain line, which is where a caveat about a control belongs.

**The test-push row was NOT removed**, though the owner asked whether it could
be. It is the only instrument that can tell the four possible push faults apart,
and that bug is still open: the diagnostic reached the repository after the last
deploy, so the reading she has seen is from the old code. It comes out as soon
as push is confirmed working, and it is listed here so that removal is not
forgotten once it is.

## The notification icon that had never existed (2026-09-23)

Owner, on a screenshot of the morning's test notification: "i not think the
logo is quite small... You can use the silouette form as the notication icon
that shows on the status bar... But the logo a little bigger in the whit".

Two separate faults, in two different Android drawing slots, and it is worth
keeping them apart because the fix for one does nothing for the other.

### There was no status-bar icon at all

`expo-notifications`' config plugin takes an `icon` option, documented as a
"96x96 all-white png with transparency". VHub had never set it. Android does
not fall back to nothing: it silhouettes the app's own launcher icon, keeps
only that file's ALPHA and tints the shape with the accent colour. What
appeared in the status bar was therefore whatever alpha the launcher icon
happened to have, decided by accident rather than by anyone.

`assets/notification-icon.png` is now a seventh output of
`scripts/generate-icons.js`: the mark flattened to pure white, its alpha
untouched, at 96x96. The transparent knockouts (the ECG line through the heart,
the gap between the heart and the V) are what stop a flat silhouette reading as
a blob, so they matter more here than anywhere else in the app, precisely
because the colour is thrown away.

### The mark was small in the white disc because the ratio was inherited, not derived

The white circle in the notification shade is Android drawing the launcher
icon, and the launcher icon on Android is the adaptive icon: a foreground mark
composited over a solid white background and masked to a circle. Measured off
the owner's screenshot, the mark occupied **0.317 of the disc**.

The generator built that foreground at a fill of **0.42**, and the comment
beside the number said plainly where it came from: "the ratios are the ones the
previous artwork used, measured off the old files". It was inherited from a
different mark and never checked against the new one.

**Checking it needed one measurement of the master.** Its ink box is 1203x1122
and the furthest ink pixel sits 607px from the centre, so the mark's longest
side and the diameter of the circle enclosing it agree to within one per cent.
A heart has no corners, so its bounding box is mostly empty and the mark is,
for masking purposes, a circle. That single number answers every circular-mask
question at once: a fill of `f` puts the whole mark inside a circle of diameter
`1.009 * f`.

Android guarantees that the centre `66/108` (0.611) of an adaptive icon
survives every launcher mask, whether it crops to a circle, a squircle or a
teardrop. So the largest fill that is still guaranteed whole is
`0.611 / 1.009 = 0.606`. The mark was sitting at 0.42, nowhere near it,
floating in a wide empty ring.

**It is now 0.55** — a 0.555 circle, a comfortable five per cent inside the
guarantee, and 31 per cent larger on screen. Not 0.606, because the guarantee
is a minimum rather than a target and an icon that exactly fills it looks
cramped under a mask that happens to be tight.

`android-icon-monochrome.png` moved to 0.55 with it. That file is the Android
13 themed launcher icon, the same mark in the same place, and had it been left
at 0.42 the themed and untinted icons would have read as two different sizes on
one home screen.

### What was deliberately not changed

`icon.png` stays at 0.54 and `favicon.png` at 0.66. Neither feeds the Android
launcher — the adaptive icon does — and their constraints are different ones
(an iOS squircle crops far less than a launcher mask). Changing them would have
been an unasked-for change to the iOS icon to fix an Android complaint.

### Both need a real build

The notification icon becomes a drawable resource and a manifest meta-data
entry; the adaptive icon becomes launcher resources. Neither lives in the
JavaScript bundle, so an OTA update changes neither and the phone would keep
showing the old art. This goes out with the next EAS build.

## The full audit (2026-09-23)

Four read-only passes over the whole project: database security, the serverless
API, the mobile app's UI conventions, and the core matching/V-Score logic
against the spec. What follows is what they found and what was done, including
the findings that turned out to be wrong.

The tree was green before the audit and is green after it: 27 suites, 693 tests
(three more than before, all of them new guard assertions), typecheck clean on
both trees, lint zero on both.

### The one that mattered most: a multi-role outreach reached almost nobody

Both broadcast notification passes scored every outreach with the SINGLE-ROLE
scorer. `/api/match`'s `notify_candidates` (the pass that runs on publish) and
`server/underSubscription.ts` (the 7/3/1-day shortfall ladder) each called
`computeLayer1MatchScore` against the outreach row alone, while the three paths
that matter to an organisation's own screens all call
`computeMultiRoleMatchScore` with the `outreach_roles` rows.

Why that is not cosmetic. An outreach using role rows deliberately stores
`required_category = null`, because there is no single answer once there are
several and the roles carry it instead. `categoryMatchScore` scores a null
requirement as 0. So on EVERY multi-role outreach the 20-point category
component was a guaranteed zero for every candidate and nothing could score
above 80, against a notification threshold of 75. A nurse one district away who
exactly filled the "3 nurses" role scored 70 and was never told the event
existed, neither on publish nor at the escalation that exists specifically to
fill it. Only somebody in the exact same district, with full skill coverage,
full availability and at least intermediate experience could clear the bar.

The comments at both sites justified skipping LAYER 2 to conserve Gemini quota,
and that reasoning is sound and untouched. It never extended to the multi-role
scorer, which is pure code with no I/O and no quota cost at all.

`fetchRolesByOutreach` moved out of `/api/match`'s route file and into
`api/src/server/outreachInput.ts`, beside `fetchDaysByOutreach`, whose own
comment already referred to it. That is the actual root cause: the loader was
private to a route the two notification passes do not belong to, so neither
could have used it without duplicating the query.

A single-role outreach scores identically, because an empty role list delegates
straight back to the original scorer.

### Publishing a support-role outreach told nobody unverified

`notify_candidates` filtered `verification_status = 'verified'` unconditionally.
The escalation ladder applies that filter only when the role type is not
`support`, which is the documented rule: an unverified volunteer may Quick Join
a support role, so they are exactly the audience for it. The result was two
pools answering the same question differently, and the on-publish one silently
excluding the students and first aiders the support role exists for. They then
heard about the same event a week later through the shortfall escalation.

### Suspending an organisation told everyone the event was cancelled, and left it running

The worst answer available, and it came from an ordering.

`refuse_outreach_from_unverified_org` is a TRIGGER on `outreaches`, and a
trigger fires for the service role too: it is row-level security the service key
bypasses, never triggers. Its very first test raises when the owning
organisation's `moderation_state` is anything but `active`, before the
status-unchanged exit and before the draft exception.

`/api/moderation` wrote `moderation_state = 'suspended'` FIRST and then called
`stopOrganisation`, which cancels that organisation's outreaches. Every one of
those cancellations was therefore refused by the trigger. And the cancel write
discarded its error: `await admin.from("outreaches").update(...)` with no
destructuring. So the code carried on and pushed and emailed every accepted,
waitlisted and pending volunteer to say the event would no longer take place,
while the event stayed `open` in the feed and open to new applications.

Two changes, both in the API and neither touching the database. The stop now
runs BEFORE the account is marked, which is the same order account closure
already uses and fails in the safer direction anyway: a failure after the stop
leaves an account whose events were cancelled but which can still be acted on,
where the reverse left a suspended account whose events were never stopped. And
the cancel write now reads its error and refuses to notify anybody if it failed.

### Which then broke the nightly cron, every night, silently

Pass 4 of the cron closes past outreaches with ONE bulk statement:
`update outreaches set status = 'closed' where status = 'open' and date < today`.
Once the bug above had left a suspended organisation's outreach sitting at
`open`, the same trigger raised on that row, and because it is one statement the
whole UPDATE aborted and the pass threw. The cron awaits its passes in sequence,
so the two that run after it never ran at all: the late-release penalty backstop
and the notification retention sweep. Every night, until somebody noticed and
fixed one row by hand.

The pass now selects the rows first and excludes any outreach whose organisation
is not `active`, which is also right on its own terms: a suspended
organisation's event was STOPPED, not finished, and "closed" is the word this
app uses for an event that ran its course.

### Any organisation could destroy any volunteer's V-Score

`public_volunteer_profiles` is granted to every signed-in user and carries `id`,
so any organisation can read the id of every volunteer on the platform. The only
authorisation on filing a review was that the caller owns the outreach. Nothing
required the volunteer to have applied to it, been accepted for it, or attended
it. The replay counts every `event_reviews` row for a volunteer with no such
check, and a review filed with `attended: false` floors that event's outcome to
0: one fabricated review takes a new volunteer from 70 to 49, repeatable once
per outreach, on as many outreaches as the organisation cares to create.

The organiser's attendance verdict in `/api/checkin` had the same gap. That one
does not move a score by itself (with no committed days the ratio is null, which
correctly means "do not scale"), but it puts a false absence on a record the
volunteer can see and must dispute, and it feeds the platform no-show figure.

Both endpoints now require an `accepted` application for that volunteer on that
outreach. `accepted` specifically rather than merely "applied", because that is
exactly the set the organisation's own review screen offers, so nothing a
legitimate reviewer can reach is refused.

**THE ENDPOINT IS ONLY HALF OF IT.** The matching RLS policy
`event_reviews_insert_org` carries the same gap, and a client holding an
organisation session can reach PostgREST directly with the shipped anon key.
Closing that is a schema change and is gated; the SQL is in the report to the
owner and is not applied.

### The Info Hub was telling volunteers the wrong cost of a no-show

It printed `V_SCORE_PENALTIES.no_show`, which is -15. NOTHING APPLIES THAT
NUMBER. `no_show` is deliberately not a `score_events` kind, because an absence
is already expressed by a review filed with `attended: false`; the real cost is
that the event's outcome is floored to 0 and the blend makes the new score
`0.7 x old`. That is a PROPORTION, not a fixed subtraction, and it is LARGER
than 15 points for anyone above 50: 70 becomes 49, 90 becomes 63.

So the figure was wrong for everybody and wrong in the harmful direction,
understating the worst penalty in the app to precisely the people it exists to
deter. The row now states the mechanism. The late per-day release, live since
2026-08-31 and able to reach the same -8 a late withdrawal costs, was missing
from that list entirely and has been added.

CLAUDE.md contradicted itself on this: the V-Score section listed "no-show -15"
as spec-final while the `score_events` section said `no_show` is not a kind and
never becomes one. Both were written truthfully at different times and neither
was updated when the other changed. The line is corrected rather than deleted,
with the contradiction recorded, because that is the failure mode the multi-day
section already warns about.

### A guard that could not fail, and the bug it was hiding

`constants/__tests__/skillAffinities.test.ts` claimed to prove the affinity
table only names skills that exist. It drove `companionSkills` with every real
skill and asserted everything returned was in the vocabulary. `companionSkills`
FILTERS OUT anything not in the vocabulary before returning it, so the
assertion re-checked the filter and passed by construction whatever the table
said. It is the third time this project has written a guard that enumerates
through the complying code instead of from the authority.

Rewritten to read `SKILL_AFFINITIES` directly, it failed on the first run.
`'Sterile technique'` was retired on 2026-09-21, owner-approved, and the
affinity group still named it: `companionSkills` dropped it silently and that
group had been offering three companions instead of four ever since. Nothing
reported it, which is the whole point.

`lib/__tests__/userFacingText.test.ts`'s self-guard was vacuous in the same way.
It asserted `Array.isArray(probe)` (trivially true) and that a clean file
returns no offences, which passes both when the file is clean AND when the
scanner is broken. `walkFiles` swallows a readdir failure with a bare catch, so
a renamed root would have made the whole suite pass having scanned nothing. A
detector needs a POSITIVE CONTROL: it now writes a fixture outside the
repository containing an em dash in a string and another in a comment, and
asserts exactly one is reported, which also pins the parse-not-grep behaviour.

### Smaller things, fixed

- `/api/document-url` answered 404 for a missing organisation-document row
  before the ownership check and 403 after it, so any signed-in caller could
  tell a real document row id from an invented one. That is the distinction the
  file's own header comment rules out. One flat 403 now covers both. A second
  comment in the same file claimed the wording was identical for an authorised
  viewer and a stranger, which was untrue; the behaviour was safe because that
  branch sits after the authorisation check, and the comment now says so. A
  wrong comment about an access rule is how the rule gets relaxed later.
- The rate limiter's map sweep tested every key against the window of whichever
  rule triggered it. Harmless while all seven rules use one minute, and a silent
  reset of exactly the cap that mattered the moment one does not. It now
  measures against the longest configured window, derived rather than written
  down.
- Manage Event threw away the `from` param the notification inbox has always
  sent it, so an organisation opening an outreach notification and pressing back
  landed on the Dashboard. The volunteer's copy of the same screen had read it
  all along.
- The admin activity log had no back control in any of its three branches and is
  registered `href: null`, so it has no tab button either. Android's hardware key
  rescued it; on iOS there is neither a hardware key nor a swipe gesture inside a
  tab navigator.
- The clinical gate opened identity verification without a `from`, so a
  volunteer blocked from a Full Application pressed back and lost the outreach
  they were trying to apply to.
- **`ConfirmDialog` had no keyboard handling**, and its `children` slot exists to
  hold a required reason field with the Confirm button below it. Four of its
  five callers make that field required, including the dispute statement. The
  screens behind it do have their own `KeyboardAvoidingView`, but a `Modal` is
  not in their view tree, so none of that protection ever reached the dialog.
  Fixed once, in the component.
- `EventReviewSheet` was the one bottom sheet with a text field and no keyboard
  handling, on the screen that is the sole source of every V-Score movement.
  `FullApplicationSheet` is the identical arrangement and always had one.
- Eleven refusals were still printed under a submit button, the pattern the
  standing rule names explicitly. The two worst: the Manage Event lifecycle
  failure was the last element of a very long ScrollView, and the Accept/Reject
  failure was inside the bar fixed to the bottom of the screen. All eleven are
  `ErrorAlert` now; field validation stays inline, which is the carve-out.
- The onboarding completion screen had no scroll container and is centred, so at
  a large font size it overflowed at both ends with no way to reach "Add my
  document now".
- The check-in scanner's privacy footnote carries `marginTop: 'auto'` and the
  screen has no scroller, so its last lines were drawn under the floating tab
  pill. The clearance exemption was written about the buttons, which really are
  centred.
- The push-test failure for an unrecognised code put the push service's own
  message straight on screen, which can carry the `ExponentPushToken` value. It
  goes through `humanError` now.
- `lib/outreachDays.ts` declared its own `LATE_RELEASE_FREE_COUNT = 2` beside the
  `LATE_RELEASE_FREE_ALLOWANCE = 2` in `lib/vscore.ts` that actually decides the
  deduction, with nothing tying them together. Raise one and the warning copy
  would have told a volunteer the wrong threshold for a deduction against their
  own reputation. It is an alias now.
- `constants/categories.ts` held shadow `OutreachStatus` and `ApplicationStatus`
  unions that had both fallen behind the database, missing `cancelled` and
  `not_selected`. Nothing broke only because every status consumer happened to
  import from `types/database`. They are re-exports now.

### Findings checked and REJECTED

Recorded because a rejected finding costs the next reader the same time twice.

- The Applications tracker was reported as receiving a `from` param that nothing
  reads. It renders `TabBackLink`, which reads `from` and draws the back link.
  Not a defect.
- `expo-doctor`'s config-schema check fails, which looks like a fault in
  `app.json`. It is a network timeout reaching Expo's API and says so in the
  verbose output. 19 of 21 checks pass.

### Not fixed, because gated

The schema, dependencies, the matching engine and the V-Score formula are gated
under CLAUDE.md. These are proposed to the owner and NOT applied: the
`event_reviews` RLS policy that is the other half of the fabricated-review fix;
`organisation_profiles`' `select using (true)`, which now exposes an
organisation's street address, named contact and the verbatim reason an admin
wrote when rejecting it; the four places `supabase/schema.sql` has fallen behind
the migrations while still calling itself safe to re-run; two enum values
missing from that file; the trigger that refuses to let a non-verified
organisation move an outreach to `cancelled`; and sixteen Expo packages behind
their SDK patch versions.

### The audit's own recommendation was wrong about `organisation_profiles` (2026-09-23)

Worth recording, because the wrong fix was approved and would have broken the
volunteer feed.

The finding was right: `organisation_profiles_select_authenticated` is
`using (true)`, justified by a comment listing the table as holding "org_name,
org_type, description, website, verified", and that stopped being true when
verification shipped and added `official_email`, `physical_address`,
`contact_person`, `verification_state`, `verification_reason` and two
timestamps. Any volunteer or rival organisation could read an organisation's
street address, its named contact, and the verbatim reason an admin wrote when
rejecting it.

The proposed fix was to narrow the policy to `id = auth.uid() or is_admin()`,
on the stated grounds that every volunteer-facing read already goes through
`public_organisation_profiles`. **That is not true.** `useOutreaches` and
`useApplications` both EMBED the base table into their outreach reads:

```
organisation:organisation_profiles ( id, org_name, org_type, verified )
```

so that a feed card can name the organisation running the event. A row-scoped
policy would return null for every outreach a volunteer does not own, which is
all of them. The feed would have kept working and quietly lost every
organisation name.

**So the split is by COLUMN, which RLS cannot express.** The row policy stays
broad. `authenticated` now holds SELECT on the public columns only, and the
private ones come back through `organisation_private_profiles`, a
`security_invoker = false` view whose `where id = auth.uid() or is_admin()` is
the whole access rule. Four hooks were repointed at it: the organisation's own
verification submission, the admin verification queue, the organisation's own
profile editor (which does `select('*')`, and a `*` that includes an ungranted
column fails outright rather than omitting it), and the two admin statistics
counts that filter on `verification_state`.

`verified` stays public and `verification_state` does not. The boolean is the
badge every volunteer is meant to see; the state distinguishes rejected,
suspended, banned and documents_submitted, which is the organisation's business
and the admin's.

**The general lesson is the one this project keeps relearning:** a finding that
names the right problem can still propose a fix that was never checked against
the callers. The grep that mattered was not for `.from('organisation_profiles')`
but for the string anywhere, because a PostgREST embed is a read that does not
look like one.

### `supabase/schema.sql` had stopped being safe to re-run (2026-09-23)

The header said "Safe to re-run" and six places had fallen behind
`supabase/migrations/`. Re-running it would have been a silent regression
rather than a no-op:

1. **Both public views lost `and p.closed_at is null`.** They are
   `security_invoker = false` and bypass RLS entirely, so that clause is the
   only thing hiding a closed account. Re-running would have republished every
   closed volunteer's name, avatar, bio, skills and V-Score to every signed-in
   user, contradicting the privacy policy account closure was written to make
   true. The worst of the six by some distance.
2. **`applications` lost INSERT on `outreach_role_id`.** `apply_to_outreach()`
   is SECURITY INVOKER and inserts it, so every application to a multi-role
   outreach would have failed with `permission denied for table applications`.
3. **`organisation_profiles` lost `show_gallery` on INSERT and UPDATE**, so the
   gallery opt-out would have failed the same way.
4. **`applications_update_own_cancel` reverted to the pre-per-role gate**,
   reintroducing exactly the bug `20260817_per_role_verification_gate.sql`
   exists to fix: an unverified volunteer who withdrew from the SUPPORT role of
   a mixed event could not re-apply, because the event summarises to
   `clinical`.
5. **`outreach_status` was missing `cancelled`** and **`application_status` was
   missing `not_selected`**. Harmless on an existing project, because every
   enum here is wrapped in `exception when duplicate_object then null` which
   swallows the "already exists" error. On a FRESH project the values would
   simply be absent, with nothing said, and cancelling an outreach would fail.

All six are corrected, each with a comment naming the migration it came from,
and the header now says plainly that the file has to keep earning that claim
and that a migration and this file change in the same pass.

### The map stub is gone (2026-09-23)

`app/(volunteer)/map.tsx` was twelve lines, registered `href: null`, and linked
from nowhere in the entire tree. Map discovery was scoped out on 2026-09-22 for
a data reason that has not changed: an outreach stores a region, a district and
a venue name, and no coordinates. The route, its `Tabs.Screen` registration and
its entry in the tab-bar clearance guard's `EXEMPT` list all went together.

Deleting it does not delete the plan, which lives in the README and here. What
it does delete is a guard exemption that had to be carried for a screen nobody
could reach, and the only remaining placeholder in the app.

The `scan` exemption was sharpened at the same time. It said the screen's
"buttons are vertically centred, never at the bottom", which was true and hid a
bottom-pinned privacy paragraph; it now says the exemption covers CONTROLS and
names where the footnote's clearance comes from.

### The Expo SDK patch drift is closed (2026-09-23)

Sixteen packages were behind the versions SDK 57 asks for, `expo` itself at
57.0.9 against 57.0.24 and `expo-notifications` at 57.0.8 against 57.0.20.
Every one was a patch-level move inside SDK 57, so there is no migration to do
and no breaking change to absorb. `npx expo-doctor` now reports 21 of 21 checks
passing, where it previously failed that one. Tests, typecheck and lint were
green before and after, which is the only evidence that matters here.

## Push works, and the cause was one word: "assigned" (2026-09-23)

Confirmed by the owner on a real device: the test notification arrived on the
phone AND in the in-app inbox.

**The cause was an FCM service-account key that existed but was attached to
nothing.** Expo relays Android push through Firebase Cloud Messaging and
authenticates to it with a Google service-account key held in EAS credentials.
The key had been uploaded to the Expo account about a month earlier and was
never ASSIGNED to `com.melissaotoo.vhub`. Selecting it in
`eas credentials -p android` printed:

```
Google Service Account Key assigned to com.melissaotoo.vhub for FCM V1
```

and push worked on the build already installed. **No rebuild was involved**,
which is itself the proof: the credential lives on Expo's servers, not in the
APK, so nothing about the app was ever wrong.

### Every earlier diagnosis was wrong, and they were wrong in an instructive way

Four theories were advanced over two sessions and each was disproved by
evidence rather than by trying a fix:

1. **A package-name mismatch.** Checked: `com.melissaotoo.vhub` in both
   `app.json` and `google-services.json`, project `vhub-ef816`, sender number
   `462393574938`. All agreed.
2. **No token registered.** Disproved by the endpoint itself, which throws
   `badRequest` when there is none, and by the in-app row appearing.
3. **A dev client older than `google-services.json`.** This was the leading
   theory going into this session and it was WRONG.
   `git log` puts `google-services.json` at 2026-08-01 (`a4febf4`);
   `eas build:list` puts the last finished Android build at **2026-09-17**, six
   weeks later. FCM was compiled into the build she was holding. **One command
   against the build history would have retired this theory at any point in the
   previous month, and nobody ran it.**
4. **No FCM credential at all.** Also wrong, and this is the subtle one: the
   key was there. It was listed, valid, for the right project. The question
   nobody asked was not "does a credential exist" but "is it attached to
   anything", and those look identical from every surface the app can see.

### What actually made it findable

The diagnostic shipped in `1ca1b4d` and the deploy of `4ec040c`. Before that,
`dispatched` was `tokens.length` -- a count of rows in our own table, which the
push service never sees and which therefore could not fail. The app said "sent"
on the strength of a number that was always going to be positive. Once it
returned what Expo actually said, the next test would have named
`MismatchSenderId` or `InvalidCredentials` outright.

As it happens the credential was fixed before that test was run, so the
improved message never got to prove itself. That does not make it wasted: it is
the reason the fault was narrowed to the credential layer at all, because it
was the first reading anybody could trust.

**The general rule this earns:** a diagnostic that cannot fail is worse than no
diagnostic, because it actively argues against the truth. And when a fault has
survived several confident diagnoses, the next question should be about
CONFIGURATION STATE nobody has enumerated -- not another theory about code.

### The test-push row is removed, as promised

It was built on 2026-09-22 to tell four identical-looking faults apart and was
recorded here so its removal would not be forgotten. Gone now:
`sendTestPush`, `TestPushResponse` and `PushFailure` from `lib/api-client.ts`,
the `test-dispatch` action and its handler from `/api/notifications`, and the
row and its mutation from the notification settings screen.

`notice`'s `tone` field went with it. It existed so a successful test was not
dressed in red; every remaining notice on that screen is the toggle refusing to
do what was just asked of it, and a field nothing sets is how a type starts
lying.

**`notifyUsers` still returns what the push service said**, and that is
deliberate even though every caller now ignores it. It is what made the fault
findable, and anything that needs to know why a push did not land reads it
there rather than inferring from a row count.

**The `test` notification type is deliberately NOT removed.** It is a value of
a Postgres enum, and Postgres cannot drop one; rows written by the test push
also still exist in the database and on the owner's phone. Its entry in
`lib/notificationPresentation.ts` stays so those rows keep rendering as
themselves instead of falling back to a generic card.

## Found on the first standalone APK (2026-09-24)

### "Your application was refused": every in-app application has been failing

`apply_to_outreach()` (20260818) runs with the volunteer's own privileges and
clears the committed days with a DELETE before writing new ones. On 2026-08-21
`20260821_per_day_release.sql` revoked DELETE on `application_days`, correctly:
a day commitment is evidence the V-Score is derived from, and must be released,
never erased. Postgres checks that privilege whenever the statement runs, even
when no row would match, so from that day every application made through the
app failed with 42501, which the app words as "refused". It went unseen,
probably because testing since then used the seed script, which inserts as the
database owner.

The proposed fix (`supabase/migrations/20260924_apply_without_delete_privilege.sql`,
approved and applied 2026-09-24) skips the delete on a first
application, which has nothing to clear, and routes the re-application case
through one narrow definer function that accepts only the caller's own
withdrawn application with no attendance recorded. Rejected alternatives:
granting DELETE back reopens the hole 20260821 closed; making
`apply_to_outreach` a definer function would bypass `applications_insert_own`,
which is the verification gate itself.

**Known drift, recorded rather than fixed here:** `supabase/schema.sql` contains
none of the multi-day objects (`outreach_days`, `application_days`,
`apply_to_outreach`), so it no longer describes the whole database.

### The match pill said "NOT RANKED YET" on every outreach page

The outreach detail hero and the Full Application sheet drew a bare
`MatchScoreBadge` left over from before matching went live, under copy saying
ranking would run "when the matching engine goes live". Both now show the
score the ranked feed already gave that outreach (`useFeedMatchScore`, read
from the feed's cache rather than recomputed, so the two numbers cannot
disagree). Reached without a feed score (from search or a notification) the
pill is left out rather than claiming an outage.

### `/api/keepalive`, for the uptime monitor

Supabase's free tier pauses a project it judges idle, and it judges by what
reaches the database. No unauthenticated route touched the database, so a
monitor would have had to ping a static page and report "up" while the project
slept. The route runs one HEAD count and returns 502 if the database does not
answer, so the monitor reports the project down rather than up. The nightly
cron already queries the database once a day; the monitor is a second
safeguard and an outage alarm, not the only thing keeping the project awake.

### A landing page at the API's root (2026-09-24)

`https://vhub-mu.vercel.app/` now introduces the app, lists what it does for
volunteers and for organisations, and links the Android download with install
steps. It shares the root with the email-confirmation card rather than taking
a new address, because Supabase's Site URL already points there and moving it
would be a dashboard change with a silent failure mode (a wrong redirect lands
people on the wrong page with no error). The card shows only when the URL
carries Supabase's auth parameters; everyone else gets the landing page, which
is prerendered so it loads fast on a slow connection. The page became
indexable at the same time: a confirmation's tokens travel in the URL
fragment, which browsers never send to a server, so no crawler can see them.

**Limitation:** the download button points at an EAS build link, which is not
permanent. The APK needs a stable home (a GitHub release or a shared Drive
file) before the page is shared widely.

### The website, rebuilt (2026-09-24, same day)

The first landing page was one column of identical boxes with no navigation,
and the owner judged it too basic. It is now an eight-page site under
`api/src/app/(site)/`: a sticky header with a phone menu that works without
JavaScript, a home page with drawn illustrations of the real app (the feed
card and its match pill, the match breakdown, the V-Score track and knob, the
check-in code, the ranked roster), pages for volunteers, organisations,
about, FAQ and download, and the privacy policy and terms imported from
`constants/policy.ts` so the site and the app cannot disagree. The
illustrations are HTML rather than screenshots so they stay sharp and cannot
go stale against a changed screen. Inter is served through next/font, which
ships with Next (no new dependency) and serves the font from this deployment.
Verified by a production build and by screenshots at 390px and 1366px.

### HeFRA licence check in the organisation review (2026-09-24)

The owner supplied HeFRA's published list of facilities with valid licences
(1,778 rows). `scripts/extract-hefra.py` turns it into JSON the API ships with,
refusing to write if any row number is missing, and `/api/facility-lookup`
(admin only) returns the entries whose names match the organisation under
review, with type, region, location, ownership and licence expiry. The admin
screen shows them as a section beside the registration numbers.

It is evidence, not a gate, and the wording says so. Most organisations that
run outreach are NGOs, churches and student associations, which HeFRA does not
license, so an empty result is normal for them; it only matters for an
organisation that says it is a facility. Name matching drops company suffixes
and filler, weights distinctive words far above "hospital" or "clinic" (so two
unrelated "... Medical Centre"s never match), and needs 60 percent of the
organisation's own weighted name to appear, with a small bonus for the same
region. Stored as a file rather than a table because it is read-only reference
data that changes only when HeFRA publishes, which would otherwise be a schema
change for something a file answers.

**Limitations:** the list is a snapshot (about a quarter of its licences had
already expired on the day it was loaded, and every result shows its date), 36
of the 1,778 rows could not be split into type and region and are searchable
by name only, and a similar name is never proof of identity, which the screen
tells the admin in so many words.
