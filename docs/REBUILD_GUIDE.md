# V-HUB Rebuild Guide (v2 — July 2026)

This replaces all previous context/master documents. The old repository was lost; the Figma designs survive. This guide is the single source of truth for the rebuild, alongside the project's architecture notes.

## 1. What V-HUB Is

A mobile app (Android + iOS, single React Native codebase) that connects health volunteers with medical outreach organisations across Ghana. It solves three failures: no discovery system for outreaches, no structured recruitment with credential checks, and no accountability for no-shows. Its distinguishing features are an AI-assisted two-layer matching engine and the V-Score reputation system.

## 2. What Existed Before the Crash (so you know what's proven)

The pre-virus build had reached "interface-complete, data-partial":

- **Proven and previously working:** Supabase email/password auth, SecureStore session persistence, role-based navigation guard, multi-step volunteer onboarding writing to real Supabase tables. This means the auth + onboarding design is validated — rebuild it with confidence, same approach.
- **UI complete but on mock data:** ~24 screens (feed, outreach detail, application tracker, org dashboard, applicant review, schedule, search, map, notifications, public profiles). These all exist in Figma — rebuild them from the designs, but this time wire them to Supabase immediately instead of mock hooks.
- **Never built (specs only):** Layer 1 matching engine, the entire serverless API tier (match, vscore, application-status, notifications), the typed API client, V-Score update pipeline, push notifications, Cloudinary and Resend integrations.

**Lesson from v1:** the mock-data detour cost time and created drift. In v2, every screen connects to real Supabase queries from the moment it's built.

**Permanent decision:** the backend is Supabase. The once-discussed Firebase migration is cancelled forever and was never code anyway. No Firebase, ever.

## 3. Architecture (three tiers + one intermediary)

```
┌─────────────────────────────────────────────┐
│  Mobile client (Expo / React Native / TS)   │
│  Expo Router · Zustand · React Query        │
│  screens → hooks → { supabase | api-client }│
└──────────────┬──────────────┬───────────────┘
               │ auth + CRUD  │ typed fetch
               │ (RLS)        ▼
               │   ┌─────────────────────────┐
               │   │ Serverless API (Next.js │
               │   │ on Vercel)              │
               │   │ /api/match  /api/vscore │
               │   │ /api/application-status │
               │   │ /api/notifications      │
               │   └────┬──────────┬─────────┘
               ▼        │ service  │ external
┌──────────────────────┐│ role     ▼
│ Supabase             ││     Gemini · Resend ·
│ Postgres · Auth ·    │◄┘     Expo Push ·
│ RLS · Storage        │       Cloudinary
└──────────────────────┘
```

Data-flow contract: **screens consume hooks; hooks consume Supabase directly (RLS-governed CRUD) or the typed API client; the API client reaches the serverless layer; the serverless layer reads/writes Supabase with the service-role key and calls external services.** Secrets live only in the serverless tier.

## 4. Data Model

Six core tables (SQL in `supabase/schema.sql`): profiles → (volunteer_profiles | organisation_profiles), outreaches, applications, event_reviews, plus skill_match_cache for Gemini caching. Key constraints: applications and event_reviews are unique per (outreach, volunteer); v_score bounded 0–100 and writable only by the serverless tier.

## 5. Matching Engine

Score = Skills×35 + Category×20 + Location×20 + Availability×15 + Experience×10.

- **Layer 1** (pure TypeScript, `lib/matching/layer1.ts`): always runs, no network, fully unit-tested, shared by app and API.
- **Layer 2** (Gemini Flash, serverless only): improves ONLY the skills component by resolving vocabulary mismatches ("venipuncture" ≡ "blood draw"). Results cached in skill_match_cache. Any failure → silent fallback to Layer 1. Matching never stops.

## 6. V-Score

Starts at 70. Bands: Elite 90+ · Trusted 75–89 · Active 60–74 · Developing 40–59 · At Risk <40. Update after each review: new = 0.7×old + 0.3×event_outcome. Penalties: no-show −15, late cancel −8, on-time cancel −2. Computed exclusively by `/api/vscore`.

## 7. Figma → Code Workflow

The UI lives in Figma. Two ways to use it in VS Code:

1. **Figma's own design context (preferred).** Paste the Figma frame link and read the real spacing, colours and text off the design rather than estimating them from a picture.
2. **Screenshot fallback.** Export the frame as PNG, drop it in the repo under `design-refs/`, and work from that.

Either way: the design is the spec, and layouts are not invented where one already exists.

## 8. Rebuild Phases

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 | Scaffold Expo app, install deps, create Supabase project, apply schema.sql, env wiring | App boots in Expo Go; `tsc --noEmit` clean; tables visible in Supabase |
| 1 | Auth: welcome/login/register, role guard, volunteer + org onboarding, profile creation | Register → onboard → land in correct tab group on a real device; rows appear in Supabase |
| 2 | Data layer: outreach creation, live feed, outreach detail, Quick Join + Full Application, application tracker, org dashboard + applicant review — all on real queries | Two test accounts (1 org, 1 volunteer) can complete a full post→apply→accept loop |
| 3 | Intelligence: Layer 1 + tests, serverless API deployed to Vercel, Gemini Layer 2 with cache + fallback, ranked feed with score badges, V-Score pipeline, post-event reviews, Resend emails, Info Hub | Feed is genuinely ranked; review submission changes a V-Score; Gemini outage doesn't break matching (tested by removing the key) |
| 4 | Push notifications, cancellation + waitlist auto-promotion, offline handling, cross-device testing, EAS Build | Installable Android build; 24h reminder fires; waitlist promotes next-best volunteer |

Each phase ends with: a review pass for security, RLS gaps and spec drift → fix criticals → update README + REPORT_NOTES → git commit + push.

## 9. Anti-Data-Loss Discipline (learned the hard way)

- `git init` on day one; push to a **private GitHub repo** after every working session. GitHub is now your offsite backup.
- Never store the only copy of `.env` values locally — keep Supabase/Vercel/Gemini keys in a password manager. (`.env` itself is gitignored.)
- `supabase/schema.sql` in the repo means the database can always be recreated.
- Export Figma frames to `design-refs/` in the repo periodically so designs are backed up too.
- Tag the repo at each phase completion (`v0.1-phase1` …) so any future disaster loses at most one phase.
