## 1.2 Method

Run on 2026-09-25 by `scripts/evaluation/layers.eval.ts`. The real `/api/match` route handler (mode `score_applicants`) was called once per outreach, with all 72 volunteers as applicants to every outreach. Only the database (in memory), the login check and the rate limiter were replaced. Run A had no Gemini key, so only Layer 1 could run. Run B used real Gemini calls (model `gemini-2.5-flash`, the production default) starting from an empty cache. Run C repeated B on the same database, so the cache from B was kept.

**Runs B and C were not performed: no Gemini key was available.** Only Layer 1 results are shown.

## 1.3 Rankings, precision at k and positions of the relevant volunteers

### O1 Blood screening day (k = 4)

- **Precision at 4, Layer 1 only:** 3/4 = 0.75

Positions of the relevant volunteers (1 = top, out of 72):

| Volunteer | Layer 1 only |
|---|---|
| O1-V01 | 1 (score 100; tied for positions 1-2) |
| O1-V02 | 2 (score 100; tied for positions 1-2) |
| O1-V03 | 3 (score 90) |
| O1-V04 | 8 (score 65; tied for positions 8-22) |
| O1-V05 | 7 (score 76.67) |
| O1-V06 | 6 (score 78.33) |

Top 12 of each ranking side by side (match score in brackets; * = relevant):

| Position | Layer 1 only |
|---|---|
| 1 | *O1-V01 (100) |
| 2 | *O1-V02 (100) |
| 3 | *O1-V03 (90) |
| 4 | O1-V07 (88.33) |
| 5 | O1-V11 (80) |
| 6 | *O1-V06 (78.33) |
| 7 | *O1-V05 (76.67) |
| 8 | *O1-V04 (65) |
| 9 | O1-V08 (65) |
| 10 | O1-V09 (65) |
| 11 | O1-V12 (65) |
| 12 | O2-V01 (65) |

### O2 Wound care clinic (k = 3)

- **Precision at 3, Layer 1 only:** 3/3 = 1.00

Positions of the relevant volunteers (1 = top, out of 72):

| Volunteer | Layer 1 only |
|---|---|
| O2-V01 | 1 (score 100; tied for positions 1-2) |
| O2-V02 | 2 (score 100; tied for positions 1-2) |
| O2-V03 | 3 (score 90) |
| O2-V04 | 16 (score 65; tied for positions 9-22) |
| O2-V05 | 8 (score 76.67; tied for positions 7-8) |
| O2-V06 | 6 (score 78.33) |

Top 12 of each ranking side by side (match score in brackets; * = relevant):

| Position | Layer 1 only |
|---|---|
| 1 | *O2-V01 (100) |
| 2 | *O2-V02 (100) |
| 3 | *O2-V03 (90) |
| 4 | O2-V07 (88.33) |
| 5 | O2-V11 (80) |
| 6 | *O2-V06 (78.33) |
| 7 | O1-V12 (76.67) |
| 8 | *O2-V05 (76.67) |
| 9 | O1-V01 (65) |
| 10 | O1-V02 (65) |
| 11 | O1-V04 (65) |
| 12 | O1-V05 (65) |

### O3 Eye screening camp (k = 4)

- **Precision at 4, Layer 1 only:** 3/4 = 0.75

Positions of the relevant volunteers (1 = top, out of 72):

| Volunteer | Layer 1 only |
|---|---|
| O3-V01 | 1 (score 100; tied for positions 1-2) |
| O3-V02 | 2 (score 100; tied for positions 1-2) |
| O3-V03 | 3 (score 90) |
| O3-V04 | 8 (score 65; tied for positions 8-11) |
| O3-V05 | 7 (score 76.67) |
| O3-V06 | 6 (score 78.33) |

Top 12 of each ranking side by side (match score in brackets; * = relevant):

| Position | Layer 1 only |
|---|---|
| 1 | *O3-V01 (100) |
| 2 | *O3-V02 (100) |
| 3 | *O3-V03 (90) |
| 4 | O3-V07 (88.33) |
| 5 | O3-V11 (80) |
| 6 | *O3-V06 (78.33) |
| 7 | *O3-V05 (76.67) |
| 8 | *O3-V04 (65) |
| 9 | O3-V08 (65) |
| 10 | O3-V09 (65) |
| 11 | O3-V12 (65) |
| 12 | O1-V03 (55) |

### O4 Maternal health outreach (k = 3)

- **Precision at 3, Layer 1 only:** 3/3 = 1.00

Positions of the relevant volunteers (1 = top, out of 72):

| Volunteer | Layer 1 only |
|---|---|
| O4-V01 | 1 (score 100; tied for positions 1-2) |
| O4-V02 | 2 (score 100; tied for positions 1-2) |
| O4-V03 | 3 (score 90) |
| O4-V04 | 8 (score 65; tied for positions 8-11) |
| O4-V05 | 7 (score 76.67) |
| O4-V06 | 6 (score 78.33) |

Top 12 of each ranking side by side (match score in brackets; * = relevant):

| Position | Layer 1 only |
|---|---|
| 1 | *O4-V01 (100) |
| 2 | *O4-V02 (100) |
| 3 | *O4-V03 (90) |
| 4 | O4-V07 (88.33) |
| 5 | O4-V11 (80) |
| 6 | *O4-V06 (78.33) |
| 7 | *O4-V05 (76.67) |
| 8 | *O4-V04 (65) |
| 9 | O4-V08 (65) |
| 10 | O4-V09 (65) |
| 11 | O4-V12 (65) |
| 12 | O1-V01 (55) |

### O5 Emergency first aid cover (k = 5)

- **Precision at 5, Layer 1 only:** 4/5 = 0.80

Positions of the relevant volunteers (1 = top, out of 72):

| Volunteer | Layer 1 only |
|---|---|
| O5-V01 | 1 (score 100; tied for positions 1-3) |
| O5-V02 | 2 (score 100; tied for positions 1-3) |
| O5-V03 | 3 (score 100; tied for positions 1-3) |
| O5-V04 | 10 (score 65; tied for positions 8-15) |
| O5-V05 | 7 (score 76.67) |
| O5-V06 | 4 (score 88.33; tied for positions 4-5) |

Top 12 of each ranking side by side (match score in brackets; * = relevant):

| Position | Layer 1 only |
|---|---|
| 1 | *O5-V01 (100) |
| 2 | *O5-V02 (100) |
| 3 | *O5-V03 (100) |
| 4 | *O5-V06 (88.33) |
| 5 | O5-V07 (88.33) |
| 6 | O5-V11 (80) |
| 7 | *O5-V05 (76.67) |
| 8 | O1-V11 (65) |
| 9 | O4-V11 (65) |
| 10 | *O5-V04 (65) |
| 11 | O5-V08 (65) |
| 12 | O5-V09 (65) |

### O6 Community pharmacy day (k = 3)

- **Precision at 3, Layer 1 only:** 3/3 = 1.00

Positions of the relevant volunteers (1 = top, out of 72):

| Volunteer | Layer 1 only |
|---|---|
| O6-V01 | 1 (score 100; tied for positions 1-2) |
| O6-V02 | 2 (score 100; tied for positions 1-2) |
| O6-V03 | 3 (score 90) |
| O6-V04 | 10 (score 65; tied for positions 8-13) |
| O6-V05 | 7 (score 76.67) |
| O6-V06 | 6 (score 78.33) |

Top 12 of each ranking side by side (match score in brackets; * = relevant):

| Position | Layer 1 only |
|---|---|
| 1 | *O6-V01 (100) |
| 2 | *O6-V02 (100) |
| 3 | *O6-V03 (90) |
| 4 | O6-V07 (88.33) |
| 5 | O6-V11 (80) |
| 6 | *O6-V06 (78.33) |
| 7 | *O6-V05 (76.67) |
| 8 | O3-V11 (65) |
| 9 | O5-V11 (65) |
| 10 | *O6-V04 (65) |
| 11 | O6-V08 (65) |
| 12 | O6-V09 (65) |
