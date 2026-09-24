<p align="center">
  <img src="assets/logo.png" alt="VHub" width="96" />
</p>

<h1 align="center">VHub</h1>

<p align="center"><strong>Connecting Volunteers. Transforming Healthcare.</strong></p>

<p align="center">
  <a href="https://vhub-mu.vercel.app">Website</a> ·
  <a href="https://vhub-mu.vercel.app/download">Download for Android</a> ·
  <a href="https://vhub-mu.vercel.app/faq">FAQ</a>
</p>

---

VHub connects health volunteers (doctors, nurses, midwives, pharmacists, health and medical students and first aiders) with the organisations running medical outreach across all sixteen regions of Ghana.

Volunteers see the outreaches that fit them first. Organisations see the applicants who fit their event first. Verification, reminders, check-in and reviews all happen in the same app, so trust is built into the process instead of being left to a group chat.

## For volunteers

- **A feed ranked for you.** Every outreach is scored against your skills, category, location, availability and experience, and the best fits come first.
- **Quick Join for support roles.** Registration, crowd flow, health talks and data entry are open to everyone in one tap.
- **Clinical roles, done properly.** Hands-on care needs a credential checked by an admin. Upload it once and every clinical role opens to you.
- **Pick your days.** On a multi-day campaign, commit only to the days you can make, and release a day ahead if plans change.
- **Always know where you stand.** Instant updates on every application, your live place on any waitlist, reminders before the day, and check-in by scanning a code at the venue.
- **A V-Score that follows your work.** A reliability score built from the reviews organisations give after each outreach. Everyone starts at 70.

## For organisations

- **Post an outreach in minutes**, with the dates, venue, skills needed and how many of each role.
- **Several roles on one event**, such as two doctors, three nurses and six helpers, each with its own requirements.
- **Applicants ranked for you**, each with a match score beside their V-Score.
- **Accept your best in one tap.** The top matches fill your places and the rest are waitlisted, never rejected unless you choose to.
- **Fewer empty places.** A freed place goes to the next person on the waitlist, and if an event is short as the day approaches, matching volunteers nearby are told.
- **Attendance and reviews** that feed straight into each volunteer's V-Score.

## Trust and privacy

- Every organisation is verified by an admin before it can publish an outreach, with help from a check against HeFRA's register of licensed health facilities.
- Credential documents are stored privately, and every link to one expires within fifteen minutes.
- A volunteer's phone number and email are shown only to organisations they have applied to.
- Check-in compares your location with the venue once and keeps only the result, never your coordinates.
- Disputes, moderation and account closure are all built in, and every admin decision is recorded.

## How matching works

Every volunteer is scored against every outreach out of 100:

```
Skills × 35  +  Category × 20  +  Location × 20  +  Availability × 15  +  Experience × 10
```

The scoring runs in plain, fully tested code and never stops working. Google's Gemini adds a second layer that recognises when two differently worded skills mean the same thing, and if it is unavailable, the first layer's answer stands.

## Built with

| | |
|---|---|
| **Mobile app** | React Native with Expo, TypeScript |
| **Backend** | Supabase: PostgreSQL, authentication, row level security |
| **Serverless API and website** | Next.js on Vercel |
| **AI** | Google Gemini Flash, for skill matching and suggestions |
| **Notifications** | Expo push notifications, plus email through Gmail |
| **Media** | Cloudinary |

## Run it yourself

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Copy `.env.example` to `.env`, fill in the three values, then `npm install` and `npx expo start --dev-client`.
3. Deploy `api/` to Vercel with the environment variables listed in `api/.env.example`.

The full setup, the build commands, where the secrets live and how everything is tested are in **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.

## Documentation

- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**: setup, building, secrets, testing, project structure and conventions.
- **[docs/REPORT_NOTES.md](docs/REPORT_NOTES.md)**: the decision record, with the reasoning behind every non-obvious choice, the known limitations and the pre-submission checklist.
- **[docs/architecture/](docs/architecture/)**: the design decisions by area, such as matching, the V-Score, outreaches and the admin tools.
- **[docs/ADMIN_PHASE_PLAN.md](docs/ADMIN_PHASE_PLAN.md)**, **[docs/MULTI_ROLE_PLAN.md](docs/MULTI_ROLE_PLAN.md)** and **[docs/REBUILD_GUIDE.md](docs/REBUILD_GUIDE.md)**: the plans the build followed.

## About

VHub (the project name is V-HUB) is the final year project of Melissa Otoo at the University of Ghana.
