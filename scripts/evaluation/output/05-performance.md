### 5.1 On the Android release build

No timed measurements (ten or more runs with minimum, median and maximum) were carried out on the device.

**Observation, not a timed measurement (2026-09-25, Samsung Galaxy A07 (SM-A075F/DS), Android 16):** The developer observed the Home feed of the release APK appearing in about 4 to 7 seconds after opening the app. This was not timed with repeated runs.

### 5.2 Matching engine timings from the evaluation runs

Recorded by `scripts/evaluation/layers.eval.ts` on 2026-09-25 with model `gemini-3.5-flash-lite`: the real `/api/match` handler (`score_applicants`) ranking 72 applicants for one outreach, on the development computer, with real Gemini calls over its internet connection and an in-memory database. These are server-side processing times, not times measured on the phone and not through Vercel. One request per outreach, so fewer than ten per condition.

| Condition | Requests | Min (ms) | Median (ms) | Max (ms) | Gemini calls per request | layer2Applied |
|---|---|---|---|---|---|---|
| Layer 1 only (Gemini off) | 6 | 23 | 40 | 68 | 0, 0, 0, 0, 0, 0 | false, false, false, false, false, false |
| Layer 1 + Layer 2, empty cache (cold) | 6 | 3770 | 4096 | 8065 | 6, 6, 6, 6, 5, 5 | true, false, false, true, true, false |
| Layer 1 + Layer 2, second run, all requests | 6 | 9 | 1286 | 4005 | 0, 5, 3, 0, 0, 1 | true, true, true, true, true, true |
| Layer 1 + Layer 2, requests answered wholly from the cache (warm) | 3 | 9 | 11 | 16 | 0, 0, 0 | true, true, true |
