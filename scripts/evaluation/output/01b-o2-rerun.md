## 1.3a O2 re-run: run B from an empty cache until Layer 2 was fully applied

Run on 2026-09-25 by `scripts/evaluation/o2-rerun.eval.ts`, model `gemini-3.5-flash-lite`. In the full run, O2's cold request reported layer2Applied = false (calls ran past the 8-second timeout), so part of its "Layer 1 + 2" ranking was Layer 1. Here every attempt started from an empty cache, attempts were at least 30 seconds apart, and the run stopped at the first attempt reporting layer2Applied = true.

| Attempt | Started (UTC) | Gemini calls | Call outcomes | layer2Applied | Request time (ms) |
|---|---|---|---|---|---|
| 1 | 04:50:46 | 6 | 200 (2841 ms), 200 (3449 ms), 200 (4254 ms), 200 (3812 ms), 200 (3625 ms), 200 (3120 ms) | true | 4282 |

"error" is a call that never returned an answer: in this harness that is the engine's own 8-second abort.

### O2 Wound care clinic (k = 3), attempt 1

- **Precision at 3, Layer 1 only:** 3/3 = 1.00
- **Precision at 3, Layer 1 + Layer 2:** 3/3 = 1.00 (1 volunteer(s) below position 3 share the score at position 3); layer2Applied = true

Positions of the relevant volunteers (1 = top, out of 72):

| Volunteer | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| O2-V01 | 1 (score 100; tied for positions 1-2) | 1 (score 100; tied for positions 1-4) |
| O2-V02 | 2 (score 100; tied for positions 1-2) | 2 (score 100; tied for positions 1-4) |
| O2-V03 | 3 (score 90) | 5 (score 90; tied for positions 5-6) |
| O2-V04 | 16 (score 65; tied for positions 9-22) | 3 (score 100; tied for positions 1-4) |
| O2-V05 | 8 (score 76.67; tied for positions 7-8) | 4 (score 100; tied for positions 1-4) |
| O2-V06 | 6 (score 78.33) | 6 (score 90; tied for positions 5-6) |

Top 12 of each ranking side by side (match score in brackets; * = relevant):

| Position | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| 1 | *O2-V01 (100) | *O2-V01 (100) |
| 2 | *O2-V02 (100) | *O2-V02 (100) |
| 3 | *O2-V03 (90) | *O2-V04 (100) |
| 4 | O2-V07 (88.33) | *O2-V05 (100) |
| 5 | O2-V11 (80) | *O2-V03 (90) |
| 6 | *O2-V06 (78.33) | *O2-V06 (90) |
| 7 | O1-V12 (76.67) | O2-V07 (88.33) |
| 8 | *O2-V05 (76.67) | O2-V11 (80) |
| 9 | O1-V01 (65) | O1-V12 (76.67) |
| 10 | O1-V02 (65) | O2-V08 (76.67) |
| 11 | O1-V04 (65) | O2-V12 (76.67) |
| 12 | O1-V05 (65) | O4-V12 (66.67) |
