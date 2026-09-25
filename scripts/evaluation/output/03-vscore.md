Run on 2026-09-25 by `scripts/evaluation/vscore.eval.ts`. Reviews were filed through the real `/api/vscore` route; cancellations through `recordCancellationPenalty`, the function `/api/application-status` calls when an accepted volunteer withdraws. "Expected" was worked by hand from the rules (the working is shown) and is a fixed number in the script, not computed by the engine. "Stored" is `volunteer_profiles.v_score` read back after the step. Band and multiplier are read from the stored score.

| Step | Event | Hand working | Expected | Stored | Band | Multiplier | Matches |
|---|---|---|---|---|---|---|---|
| 1 | Good review (5, 5) | outcome (5+5)/2 x 20 = 100; 0.7 x 70 + 0.3 x 100 = 49 + 30 = 79 | 79 | 79 | Trusted | 1.00 | yes |
| 2 | Good review (5, 4) | outcome 4.5 x 20 = 90; 0.7 x 79 + 0.3 x 90 = 55.3 + 27 = 82.3 | 82.3 | 82.3 | Trusted | 1.00 | yes |
| 3 | On-time cancellation | 82.3 - 2 = 80.3 | 80.3 | 80.3 | Trusted | 1.00 | yes |
| 4 | Review marked absent | outcome 0; 0.7 x 80.3 + 0 = 56.21 | 56.21 | 56.21 | Developing | 0.90 | yes |
| 5 | Late cancellation | 56.21 - 8 = 48.21 | 48.21 | 48.21 | Developing | 0.90 | yes |
| 6 | Multi-day event, 2 of 4 days, rated (5, 5) | outcome 100 x 2/4 = 50; 0.7 x 48.21 + 0.3 x 50 = 33.747 + 15 = 48.747, stored 48.75 | 48.75 | 48.75 | Developing | 0.90 | yes |
| 7 | First review edited to (2, 2) | replayed from 70: 0.7 x 70 + 0.3 x 40 = 61; 0.7 x 61 + 27 = 69.7; - 2 = 67.7; 0.7 x 67.7 = 47.39; - 8 = 39.39; 0.7 x 39.39 + 15 = 42.573, stored 42.57 | 42.57 | 42.57 | Developing | 0.90 | yes |

**All seven steps matched the hand calculation: yes.**

**The edit.** Step 7 changed the first review from (5, 5) to (2, 2). The review was updated in place, not added: after the edit the volunteer has 4 review rows for four reviewed events. The stored score went from 48.75 to 42.57.

**Check against the corrected history.** The same sequence was run again on a fresh database with the first review rated (2, 2) from the start and never edited. Final stored score: 42.57. After the edit: 42.57. Equal: yes.
