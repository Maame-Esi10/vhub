# V-HUB

V-HUB connects health volunteers (nurses, pharmacy students, first aiders, doctors, midwives) with medical outreach organisations across Ghana using a two-layer AI-assisted matching engine. It's a React Native (Expo) mobile app and the Final Year Project of Melissa Otoo, University of Ghana.

## Quick Start

### Prerequisites
- Node.js 16+ and npm
- Expo CLI: `npm install -g expo-cli`
- A Supabase project (free tier at [supabase.com](https://supabase.com))

### Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd vhub
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your environment:
   - Copy `.env.example` to `.env` and fill in your Supabase credentials:
     ```
     EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
     EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
     ```

4. Run the app:
   ```bash
   npx expo start
   ```
   
   Then scan the QR code with Expo Go (iOS/Android) or press `i` / `a` in the terminal.

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | Expo + React Native (TypeScript strict) |
| Routing | Expo Router (file-based) |
| State management | Zustand (auth/global), TanStack React Query (server state) |
| Backend | Supabase (PostgreSQL, Auth, RLS, Storage) |
| Serverless API | Next.js API routes on Vercel |
| Matching AI | Google Gemini Flash (Layer 2 semantic enrichment) |
| Secure storage | Expo SecureStore |
| Media | Cloudinary |
| Email | Resend |
| UI | Material Community Icons, Inter font |

## Current Status

**Phase 0 (Scaffold)** ✓ — Expo Router project structure, dependencies, Supabase schema, environment wiring.

**Phase 1 (Auth + Onboarding)** ✓ — Supabase email/password authentication, SecureStore session persistence, role-based routing guard, and complete signup flows:
- **Volunteer onboarding:** 5-step wizard covering skills, category, specialties, region/district/availability, and identity verification.
- **Organisation registration:** basic org profile setup.

**Phase 2 (Real Data Layer)** — Next. Outreach CRUD, applicant feed, Quick Join/Full Application, applicant review.

**Phase 3 (Intelligence)** — Planned. Layer 1 matching scorer with unit tests, serverless match/V-Score endpoints, Gemini Layer 2, ranked feed, V-Score bands, Info Hub.

**Phase 4 (Polish)** — Planned. Push notifications, cancellation/waitlist, offline handling, EAS Build.

## Testing

Unit tests for the matching engine (Layer 1 scorer and V-Score math) will be added in Phase 3. Currently none exist.

## Documentation

- **[CLAUDE.md](CLAUDE.md)** — Full architecture spec, hard rules, data model, matching engine, and build order.
- **[docs/REPORT_NOTES.md](docs/REPORT_NOTES.md)** — Known gaps and pre-submission checklist (email confirmation, license formats, experience_level collection).

## Project Structure

```
vhub/
├── app/                        # Expo Router routes
│   ├── (auth)/                 # welcome, login, register, onboarding
│   ├── (volunteer)/            # tabs: feed, applications, schedule, profile
│   └── (organisation)/         # tabs: dashboard, create-outreach, applicants, profile
├── components/
│   ├── ui/                     # shared primitives
│   ├── volunteer/
│   └── organisation/
├── hooks/                      # React Query hooks
├── lib/
│   ├── supabase.ts             # Supabase client
│   ├── api-client.ts           # typed serverless API wrapper
│   ├── matching/layer1.ts      # Layer 1 scorer (Phase 3)
│   └── vscore.ts               # V-Score math (Phase 3)
├── stores/                     # Zustand auth store
├── constants/                  # Ghana locations, skills, categories
├── types/                      # shared entity types
└── supabase/schema.sql         # 6 tables + RLS policies
```

## Next Steps

See [CLAUDE.md](CLAUDE.md) for the full technical specification and [docs/REPORT_NOTES.md](docs/REPORT_NOTES.md) for items to resolve before submission.
