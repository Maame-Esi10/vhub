Run on 2026-09-25 by `scripts/evaluation/failure.eval.ts`. The real `/api/match` route (`score_applicants`, outreach O1, 72 applicants) was called first with no Gemini key, giving the Layer 1 baseline (HTTP 200, 72 results, layer2Applied = false, 16 ms). It was then called once per failure below, with a key set and the request to Google answered by a stand-in that fails in that way. The cache was empty each time, so every run had to ask Gemini. "Identical" compares every volunteer's position and match score with the baseline.

| Failure | How it was produced | Gemini requests attempted | Engine returned | Ranking complete | Identical to Layer 1 | layer2Applied | Request time (ms) |
|---|---|---|---|---|---|---|---|
| Network error | the request rejects with TypeError("fetch failed"), as when there is no connection | 1 | HTTP 200, 72 results | yes | yes | false | 5 |
| Timeout over 8000 ms | the request never answers; only the engine's own 8000 ms abort ends it | 1 | HTTP 200, 72 results | yes | yes | false | 8111 |
| HTTP 429 | Gemini answers 429 Too Many Requests (quota exhausted) | 1 | HTTP 200, 72 results | yes | yes | false | 103 |
| HTTP 500 | Gemini answers 500 Internal Server Error | 1 | HTTP 200, 72 results | yes | yes | false | 37 |
| Malformed JSON | HTTP 200, but the model's answer is not valid JSON | 1 | HTTP 200, 72 results | yes | yes | false | 32 |
| Matches list of the wrong length | HTTP 200 and valid JSON, but one boolean fewer than the pairs asked | 1 | HTTP 200, 72 results | yes | yes | false | 266 |
