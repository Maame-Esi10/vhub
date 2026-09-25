# VHub evaluation results

Every figure in this file was produced by a script in `scripts/evaluation/`
and copied in by `scripts/evaluation/assemble.js`; none was estimated. A
section whose run has not happened says so. To re-run everything, follow
`scripts/evaluation/README.md`.

# 1. Layer comparison (research question 2)

## 1.1 Relevance, recorded before any run

A volunteer is **relevant** to an outreach when, for every required skill, they hold a skill with the same meaning, and their category is the required one or related to it (`RELATED_CATEGORIES`). Meaning is decided by the tags in `scripts/evaluation/dataset.ts` (`CONCEPT_OF`), written before any scoring. Location, availability, experience and V-Score are identical for all 72 volunteers, so only skills and category differ.

### O1 Blood screening day

Required category **nurse**; places (k) **4**; required skills: Venipuncture, Blood glucose testing, Blood pressure measurement.

**6 relevant volunteers:**

| Volunteer | Category | Skills held | Why relevant |
|---|---|---|---|
| O1-V01 | nurse | Venipuncture, Blood glucose testing, Blood pressure measurement | all required skills, identical wording |
| O1-V02 | nurse | Venipuncture, Blood glucose testing, Blood pressure measurement, Health education | all required skills, identical wording |
| O1-V03 | student | Venipuncture, Blood glucose testing, Blood pressure measurement | all required skills, identical wording |
| O1-V04 | nurse | blood draw, blood sugar testing, taking blood pressure | holds by meaning; reworded: blood draw, blood sugar testing, taking blood pressure |
| O1-V05 | nurse | phlebotomy, finger-prick glucose test, Blood pressure measurement | holds by meaning; reworded: phlebotomy, finger-prick glucose test |
| O1-V06 | student | Venipuncture, Blood glucose testing, BP checks | holds by meaning; reworded: BP checks |

### O2 Wound care clinic

Required category **nurse**; places (k) **3**; required skills: Wound dressing, Infection control, Injection administration.

**6 relevant volunteers:**

| Volunteer | Category | Skills held | Why relevant |
|---|---|---|---|
| O2-V01 | nurse | Wound dressing, Infection control, Injection administration | all required skills, identical wording |
| O2-V02 | nurse | Wound dressing, Infection control, Injection administration, Health education | all required skills, identical wording |
| O2-V03 | doctor | Wound dressing, Infection control, Injection administration | all required skills, identical wording |
| O2-V04 | nurse | wound care, infection prevention and control, giving injections | holds by meaning; reworded: wound care, infection prevention and control, giving injections |
| O2-V05 | nurse | dressing wounds, infection prevention and control, Injection administration | holds by meaning; reworded: dressing wounds, infection prevention and control |
| O2-V06 | doctor | Wound dressing, Infection control, intramuscular injections | holds by meaning; reworded: intramuscular injections |

### O3 Eye screening camp

Required category **allied_health**; places (k) **4**; required skills: Visual acuity screening, Cataract screening, Eye health education.

**6 relevant volunteers:**

| Volunteer | Category | Skills held | Why relevant |
|---|---|---|---|
| O3-V01 | allied_health | Visual acuity screening, Cataract screening, Eye health education | all required skills, identical wording |
| O3-V02 | allied_health | Visual acuity screening, Cataract screening, Eye health education, Health education | all required skills, identical wording |
| O3-V03 | student | Visual acuity screening, Cataract screening, Eye health education | all required skills, identical wording |
| O3-V04 | allied_health | Snellen chart testing, checking for cataracts, teaching eye care | holds by meaning; reworded: Snellen chart testing, checking for cataracts, teaching eye care |
| O3-V05 | allied_health | eye chart vision testing, checking for cataracts, Eye health education | holds by meaning; reworded: eye chart vision testing, checking for cataracts |
| O3-V06 | student | Visual acuity screening, Cataract screening, teaching eye care | holds by meaning; reworded: teaching eye care |

### O4 Maternal health outreach

Required category **midwife**; places (k) **3**; required skills: Antenatal care, Family planning counselling, Breastfeeding support.

**6 relevant volunteers:**

| Volunteer | Category | Skills held | Why relevant |
|---|---|---|---|
| O4-V01 | midwife | Antenatal care, Family planning counselling, Breastfeeding support | all required skills, identical wording |
| O4-V02 | midwife | Antenatal care, Family planning counselling, Breastfeeding support, Health education | all required skills, identical wording |
| O4-V03 | nurse | Antenatal care, Family planning counselling, Breastfeeding support | all required skills, identical wording |
| O4-V04 | midwife | prenatal care, contraception counselling, lactation support | holds by meaning; reworded: prenatal care, contraception counselling, lactation support |
| O4-V05 | midwife | pregnancy check-ups, contraception counselling, Breastfeeding support | holds by meaning; reworded: pregnancy check-ups, contraception counselling |
| O4-V06 | nurse | Antenatal care, Family planning counselling, lactation support | holds by meaning; reworded: lactation support |

### O5 Emergency first aid cover

Required category **first_aider**; places (k) **5**; required skills: Cardiopulmonary resuscitation (CPR), Wound and bleeding control, Emergency triage.

**6 relevant volunteers:**

| Volunteer | Category | Skills held | Why relevant |
|---|---|---|---|
| O5-V01 | first_aider | Cardiopulmonary resuscitation (CPR), Wound and bleeding control, Emergency triage | all required skills, identical wording |
| O5-V02 | first_aider | Cardiopulmonary resuscitation (CPR), Wound and bleeding control, Emergency triage, Health education | all required skills, identical wording |
| O5-V03 | first_aider | Cardiopulmonary resuscitation (CPR), Wound and bleeding control, Emergency triage | all required skills, identical wording |
| O5-V04 | first_aider | chest compressions, haemorrhage control, casualty sorting | holds by meaning; reworded: chest compressions, haemorrhage control, casualty sorting |
| O5-V05 | first_aider | CPR, stopping severe bleeding, Emergency triage | holds by meaning; reworded: CPR, stopping severe bleeding |
| O5-V06 | first_aider | Cardiopulmonary resuscitation (CPR), Wound and bleeding control, triage | holds by meaning; reworded: triage |

### O6 Community pharmacy day

Required category **pharmacist**; places (k) **3**; required skills: Medication dispensing, Patient counselling on medication, Dosage calculation.

**6 relevant volunteers:**

| Volunteer | Category | Skills held | Why relevant |
|---|---|---|---|
| O6-V01 | pharmacist | Medication dispensing, Patient counselling on medication, Dosage calculation | all required skills, identical wording |
| O6-V02 | pharmacist | Medication dispensing, Patient counselling on medication, Dosage calculation, Health education | all required skills, identical wording |
| O6-V03 | student | Medication dispensing, Patient counselling on medication, Dosage calculation | all required skills, identical wording |
| O6-V04 | pharmacist | dispensing medicines, medication counselling, calculating drug doses | holds by meaning; reworded: dispensing medicines, medication counselling, calculating drug doses |
| O6-V05 | pharmacist | dispensing medicines, explaining how to take medicines, Dosage calculation | holds by meaning; reworded: dispensing medicines, explaining how to take medicines |
| O6-V06 | student | Medication dispensing, Patient counselling on medication, calculating drug doses | holds by meaning; reworded: calculating drug doses |

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

# 2. Forced failure (research question 3)

Run on 2026-09-25 by `scripts/evaluation/failure.eval.ts`. The real `/api/match` route (`score_applicants`, outreach O1, 72 applicants) was called first with no Gemini key, giving the Layer 1 baseline (HTTP 200, 72 results, layer2Applied = false, 16 ms). It was then called once per failure below, with a key set and the request to Google answered by a stand-in that fails in that way. The cache was empty each time, so every run had to ask Gemini. "Identical" compares every volunteer's position and match score with the baseline.

| Failure | How it was produced | Gemini requests attempted | Engine returned | Ranking complete | Identical to Layer 1 | layer2Applied | Request time (ms) |
|---|---|---|---|---|---|---|---|
| Network error | the request rejects with TypeError("fetch failed"), as when there is no connection | 1 | HTTP 200, 72 results | yes | yes | false | 5 |
| Timeout over 8000 ms | the request never answers; only the engine's own 8000 ms abort ends it | 1 | HTTP 200, 72 results | yes | yes | false | 8111 |
| HTTP 429 | Gemini answers 429 Too Many Requests (quota exhausted) | 1 | HTTP 200, 72 results | yes | yes | false | 103 |
| HTTP 500 | Gemini answers 500 Internal Server Error | 1 | HTTP 200, 72 results | yes | yes | false | 37 |
| Malformed JSON | HTTP 200, but the model's answer is not valid JSON | 1 | HTTP 200, 72 results | yes | yes | false | 32 |
| Matches list of the wrong length | HTTP 200 and valid JSON, but one boolean fewer than the pairs asked | 1 | HTTP 200, 72 results | yes | yes | false | 266 |

# 3. V-Score simulation (research question 4)

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

# 4. Functional testing

This section is compiled from the project's own records of device testing, not from a script: device tests are carried out by hand on a phone. Each entry cites where the result was recorded at the time. **The device model and Android version were not recorded for any of these rounds**, so they are shown as "not recorded" rather than guessed. Rounds before 2026-09-24 ran on Expo development builds; the rounds of 2026-09-24 ran on the Android release APK.

A journey counts as tested only if a record shows it was carried out on a device. A journey whose last device run found a defect that was then fixed, with no recorded re-run afterwards, is listed as **needs re-test**, not as passed.

## 4.1 Journeys with a recorded device test

| Journey | Date | Device | Result | Defects found (all fixed in code afterwards) | Source |
|---|---|---|---|---|---|
| Quick Join | 2026-07-31 | not recorded | Passed | None recorded | `docs/REPORT_NOTES.md`, "Test on device next session (as of 2026-07-31)": "Confirmed working on device by the owner: Quick Join, Apply Now, withdraw, and re-apply after withdrawal" |
| Full Application (Apply Now) | 2026-07-31; 2026-09-24 | not recorded; release APK | Passed on 2026-07-31. Failed on the release APK on 2026-09-24, then passed on re-test the same day after the fix | "Your application was refused": every in-app application failed because `apply_to_outreach` issued a DELETE the volunteer no longer had permission for (migration 20260924) | `docs/REPORT_NOTES.md`, "Found on the first standalone APK (2026-09-24)" and the owner's re-test report of 2026-09-24 |
| Withdrawal and re-apply (without waitlist promotion) | 2026-07-31 | not recorded | Passed | None recorded | as Quick Join |
| QR check-in | 2026-08-21 | not recorded | Passed: "a real scan on a real phone returned 'You're checked in' against the correct event and date" | "Mark attendance" was missing from a live event before its stated start time | `docs/REPORT_NOTES.md`, "Device round 2: what test 01 turned up (2026-08-21)" |
| Push notification delivery | 2026-09-23 | not recorded | Passed: a push arrived on the phone and in the in-app inbox | Pushes had not been delivered because the FCM key was uploaded to Expo but never assigned to the app | `docs/REPORT_NOTES.md`, "Push works, and the cause was one word: 'assigned' (2026-09-23)" |
| Release APK: install and start, both icons, ranked feed, organisation verification, admin organisation queue, admin statistics | 2026-09-24 | release APK, model not recorded | Passed (owner's device checks 1 to 6) | None | The owner's report of 2026-09-24, recorded in the session notes |
| Admin round A1 to A8: organisation verification, credential review, moderation, disputes, statistics, vetted sources | 2026-09-22 | not recorded | Most steps reported as working | Rejected credential document not visible to the volunteer; reason field hidden behind the keyboard on five forms; no email to an approved organisation; publishing from the dashboard gave no confirmation; back navigation from notifications | `docs/REPORT_NOTES.md` and the fix list of 2026-09-22 |

## 4.2 Journeys that need a re-test (tested, defect found and fixed, no recorded re-run)

| Journey | Last recorded device run | Defect found | Source |
|---|---|---|---|
| Registration and the six-digit code | 2026-09-14 and 2026-09-21 | Signing in after registering did nothing (2026-09-14); after the code, a new volunteer was sent to the welcome screen instead of onboarding (2026-09-21) | `docs/architecture/verification-and-auth.md`, "LOGIN IS NOT A RESTING PLACE (fixed 2026-09-14)"; fix list of 2026-09-21 |
| Onboarding | 2026-09-21 | Step 5 showed a non-functional upload card; the ending was restructured. The wizard was reordered again on 2026-09-25 (role first, skill limits), which has not been on a device | fix list of 2026-09-21; this session |
| Creating and publishing an outreach | 2026-09-21 and 2026-09-22 | Saving a draft navigated into Manage Event; publishing from the dashboard gave no confirmation | fix lists of 2026-09-21 and 2026-09-22 |
| Credential review | 2026-09-22 | As in the admin round above | as above |
| Accepting applicants (single decision) | 2026-08-21 | Deciding an applicant sent an email but no push; the applicant card offered every action whatever the status; no confirmation after a decision | `docs/REPORT_NOTES.md`, "Device round 2 (2026-08-21)" |

## 4.3 Journeys with no recorded device test

These have unit or integration coverage in the code but no record of having been carried out on a phone. They are **not** reported as passed.

- The verification gate on a clinical role (an unverified volunteer refused a clinical Full Application)
- Accept top N
- Withdrawal that triggers waitlist promotion, with the promotion email and push
- Post-event review
- Offline behaviour

To complete this section, run each journey in 4.2 and 4.3 on the release APK and record the date, the phone model and Android version (Settings, About phone), the result and any defect.

# 5. Performance

### 5.1 Measured on the Android release build

_Not yet measured._ No phone timings have been recorded.

### 5.2 API timings, measured from a computer over the network

These time the whole matching request (network and server) against the live API. They were measured by `scripts/evaluation/perf.mjs` from a computer, **not on the phone**.

_Not yet measured._

# 6. Test suite

Run on 2026-09-25 with `npx jest --verbose --json` by `scripts/evaluation/jest-summary.js` (the full per-test record is `scripts/evaluation/output/jest-results.json`).

**Final counts: 30 suites (30 passed, 0 failed); 724 tests (723 passed, 0 failed, 1 skipped).**

| Test file | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| `components/organisation/__tests__/outreachWizard.test.ts` | 65 | 65 | 0 | 0 |
| `components/organisation/__tests__/skills.test.ts` | 8 | 8 | 0 | 0 |
| `components/ui/__tests__/dateUtils.test.ts` | 18 | 18 | 0 | 0 |
| `components/ui/__tests__/tabBarClearance.test.ts` | 45 | 44 | 0 | 1 |
| `constants/__tests__/ghana-locations.test.ts` | 9 | 9 | 0 | 0 |
| `constants/__tests__/skillAffinities.test.ts` | 9 | 9 | 0 | 0 |
| `constants/__tests__/skillEligibility.test.ts` | 14 | 14 | 0 | 0 |
| `hooks/__tests__/authEntryScreens.test.ts` | 10 | 10 | 0 | 0 |
| `lib/__tests__/attendance.test.ts` | 36 | 36 | 0 | 0 |
| `lib/__tests__/carousel.test.ts` | 10 | 10 | 0 | 0 |
| `lib/__tests__/checkin-qr.test.ts` | 9 | 9 | 0 | 0 |
| `lib/__tests__/claimEligibilitySql.test.ts` | 4 | 4 | 0 | 0 |
| `lib/__tests__/dayCoverage.test.ts` | 17 | 17 | 0 | 0 |
| `lib/__tests__/errorMessage.test.ts` | 20 | 20 | 0 | 0 |
| `lib/__tests__/errorMonitor.test.ts` | 13 | 13 | 0 | 0 |
| `lib/__tests__/facilityMatch.test.ts` | 12 | 12 | 0 | 0 |
| `lib/__tests__/notificationPresentation.test.ts` | 33 | 33 | 0 | 0 |
| `lib/__tests__/notificationRetention.test.ts` | 9 | 9 | 0 | 0 |
| `lib/__tests__/otp.test.ts` | 10 | 10 | 0 | 0 |
| `lib/__tests__/outreachDays.test.ts` | 79 | 79 | 0 | 0 |
| `lib/__tests__/password.test.ts` | 12 | 12 | 0 | 0 |
| `lib/__tests__/rateLimit.test.ts` | 11 | 11 | 0 | 0 |
| `lib/__tests__/roleRoutes.test.ts` | 4 | 4 | 0 | 0 |
| `lib/__tests__/roster.test.ts` | 33 | 33 | 0 | 0 |
| `lib/__tests__/underSubscription.test.ts` | 22 | 22 | 0 | 0 |
| `lib/__tests__/userFacingText.test.ts` | 3 | 3 | 0 | 0 |
| `lib/__tests__/vscore.test.ts` | 104 | 104 | 0 | 0 |
| `lib/matching/__tests__/feedFilter.test.ts` | 6 | 6 | 0 | 0 |
| `lib/matching/__tests__/layer1.test.ts` | 78 | 78 | 0 | 0 |
| `lib/matching/__tests__/multiRole.test.ts` | 21 | 21 | 0 | 0 |

Skipped tests:

- components/ui/__tests__/tabBarClearance.test.ts: every screen inside a tab navigator clears the floating bar (volunteer)/scan accounts for the tab bar
