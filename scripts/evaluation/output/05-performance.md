### 5.1 On the Android release build

Timed with the phone's screen recorder: the time is read from the recording's own clock, from the tap on the app icon to the first frame of the named screen, so it is accurate to about one second.

| Measurement | Device | Network | Date | Runs | Time (s) | What it includes |
|---|---|---|---|---|---|---|
| Open the app to the Home feed (signed in) | Samsung Galaxy A07 (SM-A075F/DS), Android 16 | not stated | 2026-09-25 | 1 | 4 | Signed in. Includes the splash, which is held for at least 1.5 s by design (MIN_SPLASH_DISPLAY_MS). |
| Open the app to the welcome carousel (signed out) | Samsung Galaxy A07 (SM-A075F/DS), Android 16 | not stated | 2026-09-25 | 1 | 9 | Signed out. Includes the introductory splash, which is held for at least 3.2 s by design so a new user can read it (MIN_INTRO_SPLASH_DISPLAY_MS). |

Fewer than ten runs were recorded, so no minimum, median and maximum are given for a single run.

### 5.2 Matching engine timings from the evaluation runs

Recorded by `scripts/evaluation/layers.eval.ts` on 2026-09-25 with model `gemini-3.5-flash-lite`: the real `/api/match` handler (`score_applicants`) ranking 72 applicants for one outreach, on the development computer, with real Gemini calls over its internet connection and an in-memory database. These are server-side processing times, not times measured on the phone and not through Vercel. One request per outreach, so fewer than ten per condition.

| Condition | Requests | Min (ms) | Median (ms) | Max (ms) | Gemini calls per request | layer2Applied |
|---|---|---|---|---|---|---|
| Layer 1 only (Gemini off) | 6 | 23 | 40 | 68 | 0, 0, 0, 0, 0, 0 | false, false, false, false, false, false |
| Layer 1 + Layer 2, empty cache (cold) | 6 | 3770 | 4096 | 8065 | 6, 6, 6, 6, 5, 5 | true, false, false, true, true, false |
| Layer 1 + Layer 2, second run, all requests | 6 | 9 | 1286 | 4005 | 0, 5, 3, 0, 0, 1 | true, true, true, true, true, true |
| Layer 1 + Layer 2, requests answered wholly from the cache (warm) | 3 | 9 | 11 | 16 | 0, 0, 0 | true, true, true |
