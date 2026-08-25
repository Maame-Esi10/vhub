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

### V-Score: one event, one movement (approved 2026-08-12, gated — not built)

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

The approved change that scales `event_outcome` by days attended over days
committed is NOT built, and neither is continuous availability. `attendedRatio`
exists as a pure function for display and is wired to nothing in the V-Score
path, so no score has moved.

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
