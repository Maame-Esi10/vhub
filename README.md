# V-HUB

V-HUB connects health volunteers (doctors, nurses, midwives, pharmacists, health and medical students, first aiders) with medical outreach organisations across Ghana, and ranks the match between them with a two-layer scoring engine. It is a React Native (Expo) mobile app with a small serverless API behind it, and it is the Final Year Project of Melissa Otoo, University of Ghana.

The app ships to phones as **VHub**. The project, and every document in this repository, is **V-HUB**.

## What is in here

Three things, in one repository:

| | Where | What it is |
|---|---|---|
| The mobile app | `app/`, `components/`, `hooks/`, `lib/` | Expo + React Native, TypeScript strict, Expo Router. Talks to Supabase directly for everything that is not a secret. |
| The serverless API | `api/` | A separate Next.js project deployed to Vercel. It owns every secret and every decision the client is not allowed to make: matching, V-Score, application decisions, email, push, private document links. |
| The database | `supabase/` | `schema.sql` plus a numbered migration per change, pasted into the Supabase SQL editor. Row Level Security on every table, column-level GRANTs on top of it. |

## Status

Every phase of the build order is complete, as is the admin phase that followed it.

- **Phase 0, Scaffold.** Project structure, dependencies, Supabase project, schema, environment wiring.
- **Phase 1, Auth and onboarding.** Email and password sign-in with a six-digit confirmation code, SecureStore session persistence, a role-based routing guard, the five-step volunteer onboarding wizard, organisation registration, password reset.
- **Phase 2, Real data.** Outreach creation and editing (multi-day, multi-role, gallery, venue), the volunteer feed, Quick Join and Full Application, applicant review, rosters and waitlists.
- **Phase 3, Intelligence.** The Layer 1 scorer and its unit tests, the serverless API, Gemini Layer 2 skill equivalence, Gemini skill suggestions, the ranked feed, the V-Score pipeline, the Info Hub.
- **Phase 4, Polish.** Push notifications, cancellation and waitlist promotion, per-day release, offline handling, check-in by QR, keyword search, rate limiting, error monitoring, notification retention.
- **Admin phase, packages A to J.** The admin role and audit trail, private documents, organisation verification, credential review, consent and guidelines, moderation, disputes, the privacy policy and terms, account closure, platform statistics, vetted sources.

What is left is an audit, an EAS build and device testing, not features.

### Scoped out, on purpose

Three things are deliberately not in this version. Each is recorded here so it reads as a decision rather than as an omission, and each has its reasoning in full in [docs/REPORT_NOTES.md](docs/REPORT_NOTES.md).

| | Why it is out | What it would take |
|---|---|---|
| **iOS** | Untestable without an Apple Developer membership, which is a cost rather than a technical limit. Nothing in the code is Android-only. | `ios.bundleIdentifier`, an APNs key, and a device to verify on. EAS builds iOS in the cloud, so no Mac is needed. |
| **Map discovery** | An outreach stores a region, a district and a venue name, and **no coordinates**, so there is nothing to place on a map. The region filter and keyword search already answer "what is near me". | A map dependency and a native rebuild, plus either a geocoding step or a coordinates column and a way to fill it for events that already exist. |
| **Rate Organization** | A volunteer rating an organisation is a reputation system, not a screen: it needs decisions about who can see a rating, what it feeds, and what stops a rejected applicant leaving a punitive one. | A new table, and those decisions made first. The V-Score exists for volunteers and there is no counterpart for organisations. |

All three have Figma designs. Designs being complete is not the same as the data supporting them, and where the two disagree this repository follows the data.

## Platform support

**Android is the target platform. iOS is a future improvement**, and the distinction is about credentials rather than code.

Nothing in the codebase is Android-only. Every dependency is Expo-managed and ships iOS support, safe-area insets are handled throughout, the date and time pickers already branch to the iOS spinner, and keyboard avoidance uses `padding` on both platforms rather than the iOS-only ternary it started with. There is no reason to expect it not to build.

It has never been built or run on iOS, and two things would have to be added before it could be:

- **`ios.bundleIdentifier` in `app.json`.** Every iOS build needs one, and like the Android `package` it is permanent once published.
- **An APNs key uploaded to Expo.** `google-services.json` is the Android push credential; iOS push needs its own, and without it push would silently not work on iOS while everything else did.

Both of those, and installing on a physical iPhone at all, require a paid Apple Developer Program membership. EAS builds iOS on Apple hardware in the cloud, so **a Mac is not needed; the developer account is**. Until that exists, anything iOS-specific here is untested by definition, and this section is the honest statement of that rather than a claim of cross-platform support.

## Quick start

### Prerequisites

- Node.js 20 or newer, and npm.
- A Supabase project (free tier is enough).
- **A development build, not Expo Go.** The app uses native modules Expo Go does not carry (camera, notifications, secure store, location, document picker), so Expo Go will fail to load it.

### The mobile app

```bash
npm install
cp .env.example .env     # then fill it in, see below
npx expo start --dev-client
```

Add `-c` to that last command to clear the Metro cache, which is the first thing to try when a change does not show up.

`.env` holds three values and nothing secret ever goes in it:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
EXPO_PUBLIC_API_BASE_URL=https://your-api.vercel.app
```

`EXPO_PUBLIC_*` variables are compiled into the app bundle and can be read by anyone holding the APK. That is fine for these three and fatal for anything else. See "Secrets" below.

### The database

In the Supabase SQL editor, run `supabase/schema.sql` first, then every file in `supabase/migrations/` in filename order. They are numbered by date, and a few come in lettered pairs (`20260906a`, then `20260906b`) because Postgres will not let a migration use an enum value it added in the same transaction, and the SQL editor wraps a paste in one transaction.

Then, in Authentication, Email Templates, add `{{ .Token }}` to both the **Confirm signup** and the **Reset password** templates. The app confirms and recovers with a typed six-digit code rather than a link, and without that line the email arrives with no code in it.

### The serverless API

```bash
cd api
npm install
npm run dev
```

It deploys to Vercel as its own project. Its environment variables are documented name by name in `api/.env.example`, with what each one is for and what breaks without it. Set them in the Vercel dashboard, never in a file.

## Secrets

Four secrets exist, and all four live only as Vercel environment variables on the `api/` project: the Supabase **service-role** key, the Gemini API key, the Gmail app password, and the Cloudinary API secret. The mobile app holds the Supabase URL and the anon key and nothing else.

Anything that needs a secret, or that the user must not be able to decide for themselves, is an API endpoint rather than a client query. That is why V-Scores, match scores, application decisions, verification status and private document links are all server-side: a value the client could write is a value the client could choose.

## How the matching works

Every volunteer is scored against every outreach out of 100:

```
Skills x 35  +  Category x 20  +  Location x 20  +  Availability x 15  +  Experience x 10
```

**Layer 1** is `lib/matching/layer1.ts`: pure functions, no network, fully unit-tested. It always runs.

**Layer 2** is Gemini Flash, and it exists only inside `/api/match`. It asks whether two skill strings mean the same thing ("venipuncture" and "blood draw"), replaces the skills component with the better answer, and caches what it learns. If the key is missing, the request times out, or the daily quota is gone, it falls back to Layer 1 silently. **Matching never halts.**

Ranking for organisations multiplies the match score by a reliability multiplier derived from the volunteer's V-Score band. It can only ever lower a ranking, never inflate one, so fit sets the ceiling.

## How the V-Score works

Every volunteer starts at 70. Bands are Elite 90+, Trusted 75 to 89, Active 60 to 74, Developing 40 to 59, At Risk below 40.

The score is **derived, not accumulated**. `volunteer_profiles.v_score` is a cache; the truth is the volunteer's event reviews plus any upheld disputes plus any penalties, replayed from 70 in filing order on every write. That is what makes a wrong review reversible: uphold a dispute and the event stops counting, and every event after it is replayed on top.

## Testing

```bash
npm test          # 691 unit tests across 27 suites
npm run typecheck # tsc --noEmit, strict
npx eslint app components hooks lib stores constants types
npx eslint api/src
```

Lint is clean in both projects and must stay clean. The suite is Jest over the pure modules: the Layer 1 scorer, the V-Score maths, day and availability arithmetic, the rate limiter, error grouping, notification retention, Ghana's region adjacency, and a set of guard tests that fail the build on real mistakes rather than on style. Three of those guards are worth knowing about before you add a screen:

- `lib/__tests__/userFacingText.test.ts` fails on an em dash or en dash in anything a user can read. Run `node scripts/findUserText.js` to see the list while you fix them.
- `components/ui/__tests__/tabBarClearance.test.ts` fails on a screen inside a tab group that does not leave room for the floating tab bar. The bar is `position: absolute`, so it reserves no space and every screen behind it must pad its own scroll content with `useTabBarContentPadding()`.
- `hooks/__tests__/authEntryScreens.test.ts` fails if the confirmation or reset screen is added to the set the auth guard bounces signed-in users off, which would strand a newly registered volunteer.

## Project structure

```
vhub/
├── app/                        # Expo Router routes, one folder per role group
│   ├── (auth)/                 # welcome, login, register, confirm-email, forgot/reset password, onboarding
│   ├── (volunteer)/            # tabs: feed, applications, schedule, profile (+ 12 pushed screens)
│   ├── (organisation)/         # tabs: dashboard, create-outreach, applicants, reviews, profile
│   ├── (admin)/                # tabs: overview, organisations, credentials, people, disputes
│   └── policy.tsx              # privacy and terms, outside every group so all three roles reach it
├── components/
│   ├── ui/                     # shared primitives: Button, Card, Badge, Input, Text, tab bar chrome
│   ├── volunteer/
│   └── organisation/
├── hooks/                      # React Query data hooks; screens never call Supabase directly
├── lib/
│   ├── supabase.ts             # client, SecureStore adapter, URL polyfill
│   ├── api-client.ts           # typed fetch wrapper for the serverless API
│   ├── matching/               # layer1.ts, multiRole.ts, feedFilter.ts (pure)
│   ├── vscore.ts               # bands, replay, penalties (pure)
│   ├── outreachDays.ts         # multi-day maths, span formatting, commitment ratios (pure)
│   ├── roster.ts               # oversubscription: ranking, batch plan, waitlist cap
│   └── ...                     # rate limiting, retention, error grouping, all pure
├── api/src/
│   ├── app/api/                # 22 endpoints
│   └── server/                 # the I/O half: mailer, push, Gemini, replay, waitlist, rate limit
├── stores/authStore.ts         # Zustand: user, profile, role, loading, auth error
├── constants/                  # skills, categories, Ghana's 16 regions and 261 districts, theme
├── types/                      # entity types mirroring the database
├── supabase/
│   ├── schema.sql              # tables, RLS policies, column-level GRANTs
│   └── migrations/             # one numbered file per change, applied in order
└── scripts/generate-icons.js   # rebuilds the six brand PNGs in assets/ from one master
```

## Conventions worth knowing

- **Supabase is the only backend.** Firebase Cloud Messaging appears in the repository as the Android push transport and nothing else, because Google permits no other transport. `google-services.json` is meant to be there.
- **Screens never call Supabase.** They call hooks; hooks call Supabase or `api-client.ts`.
- **No raw error object ever reaches a user.** Every user-visible message goes through `humanError()` in `lib/errorMessage.ts`.
- **Every data screen needs a loading, empty and error state.** The Figma exports in `design-refs/` are the source of truth for any screen that has one.
- **No typographic dashes in anything a user can read**, and no word ever split across lines. Both are enforced by tests.
- **The app must survive a large system font.** `MAX_FONT_SCALE` caps growth at 1.3, and any layout constant that exists because of the words inside it goes through `scaleWithFont()`.
- Commits follow conventional commit style: `feat:`, `fix:`, `chore:`, `test:`.

## Documentation

- **[docs/REPORT_NOTES.md](docs/REPORT_NOTES.md)** — the decision record: why each non-obvious thing is the way it is, the known gaps, the accepted limitations, and the pre-submission checklist. It is the longest document here and the one to read first.
- **[docs/ADMIN_PHASE_PLAN.md](docs/ADMIN_PHASE_PLAN.md)** — the plan of record for the admin packages.
- **[docs/MULTI_ROLE_PLAN.md](docs/MULTI_ROLE_PLAN.md)** — how per-category role slots work.
- **[docs/REBUILD_GUIDE.md](docs/REBUILD_GUIDE.md)** — setting the project up from nothing.

The working specification lives in a `CLAUDE.md` at the repository root. It is deliberately **not published**: it is the author's own build notes and the tooling used to write the project, which is not part of the deliverable. Everything in it that a reader of this repository needs is either here or in `docs/REPORT_NOTES.md`.
