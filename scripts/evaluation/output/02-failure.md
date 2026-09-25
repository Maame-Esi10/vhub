Run on 2026-09-25 by `scripts/evaluation/failure.eval.ts`. The real `/api/match` route (`score_applicants`, outreach O1, 72 applicants) was called first with no Gemini key, giving the Layer 1 baseline (HTTP 200, 72 results, layer2Applied = false, 31 ms). It was then called once per failure below, with a key set and the request to Google answered by a stand-in that fails in that way. The cache was empty each time, so every run had to ask Gemini. "Identical" compares every volunteer's position and match score with the baseline.

The first row is a control with no failure: it shows how many Gemini requests a normal run of this outreach makes (every pair is sent, in batches of up to 60 run in parallel) and that it reports layer2Applied = true. Its answers are all "not equivalent", so its ranking is also identical to Layer 1.

| Failure | How it was produced | Gemini requests attempted | Engine returned | Ranking complete | Identical to Layer 1 | layer2Applied | Request time (ms) |
|---|---|---|---|---|---|---|---|
| Control: no failure | every Gemini request answers correctly, every pair "not equivalent" | 3 | HTTP 200, 72 results | yes | yes | true | 13 |
| Network error | the request rejects with TypeError("fetch failed"), as when there is no connection | 3 | HTTP 200, 72 results | yes | yes | false | 7 |
| Timeout over 8000 ms | the request never answers; only the engine's own 8000 ms abort ends it | 3 | HTTP 200, 72 results | yes | yes | false | 8022 |
| HTTP 429 | Gemini answers 429 Too Many Requests (quota exhausted) | 3 | HTTP 200, 72 results | yes | yes | false | 12 |
| HTTP 500 | Gemini answers 500 Internal Server Error | 3 | HTTP 200, 72 results | yes | yes | false | 6 |
| Malformed JSON | HTTP 200, but the model's answer is not valid JSON | 3 | HTTP 200, 72 results | yes | yes | false | 8 |
| One of the batches fails (HTTP 500), the others answer | the first Gemini request answers 500; every other request answers correctly (every pair "not equivalent") | 3 | HTTP 200, 72 results | yes | yes | false | 9 |
| Matches list of the wrong length | HTTP 200 and valid JSON, but one boolean fewer than the pairs asked | 3 | HTTP 200, 72 results | yes | yes | false | 6 |
