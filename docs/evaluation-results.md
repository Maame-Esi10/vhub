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

Run on 2026-09-25 by `scripts/evaluation/layers.eval.ts`. The real `/api/match` route handler (mode `score_applicants`) was called once per outreach, with all 72 volunteers as applicants to every outreach. In runs B and C the requests were spaced 15 seconds apart to stay inside the Gemini free tier's per-minute limit (the wait is not part of the timed request). Only the database (in memory), the login check and the rate limiter were replaced. Run A had no Gemini key, so only Layer 1 could run. Run B used real Gemini calls (model `gemini-3.5-flash-lite`, the production default) starting from an empty cache. Run C repeated B on the same database, so the cache from B was kept.

## 1.3 Rankings, precision at k and positions of the relevant volunteers

### O1 Blood screening day (k = 4)

- **Precision at 4, Layer 1 only:** 3/4 = 0.75
- **Precision at 4, Layer 1 + Layer 2:** 4/4 = 1.00; layer2Applied = true

Positions of the relevant volunteers (1 = top, out of 72):

| Volunteer | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| O1-V01 | 1 (score 100; tied for positions 1-2) | 1 (score 100; tied for positions 1-4) |
| O1-V02 | 2 (score 100; tied for positions 1-2) | 2 (score 100; tied for positions 1-4) |
| O1-V03 | 3 (score 90) | 5 (score 90; tied for positions 5-6) |
| O1-V04 | 8 (score 65; tied for positions 8-22) | 3 (score 100; tied for positions 1-4) |
| O1-V05 | 7 (score 76.67) | 4 (score 100; tied for positions 1-4) |
| O1-V06 | 6 (score 78.33) | 6 (score 90; tied for positions 5-6) |

Top 12 of each ranking side by side (match score in brackets; * = relevant):

| Position | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| 1 | *O1-V01 (100) | *O1-V01 (100) |
| 2 | *O1-V02 (100) | *O1-V02 (100) |
| 3 | *O1-V03 (90) | *O1-V04 (100) |
| 4 | O1-V07 (88.33) | *O1-V05 (100) |
| 5 | O1-V11 (80) | *O1-V03 (90) |
| 6 | *O1-V06 (78.33) | *O1-V06 (90) |
| 7 | *O1-V05 (76.67) | O1-V07 (88.33) |
| 8 | *O1-V04 (65) | O1-V11 (80) |
| 9 | O1-V08 (65) | O1-V08 (76.67) |
| 10 | O1-V09 (65) | O1-V09 (65) |
| 11 | O1-V12 (65) | O1-V12 (65) |
| 12 | O2-V01 (65) | O2-V01 (65) |

### O2 Wound care clinic (k = 3)

- **Precision at 3, Layer 1 only:** 3/3 = 1.00
- **Precision at 3, Layer 1 + Layer 2:** 3/3 = 1.00; layer2Applied = false

Positions of the relevant volunteers (1 = top, out of 72):

| Volunteer | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| O2-V01 | 1 (score 100; tied for positions 1-2) | 1 (score 100; tied for positions 1-2) |
| O2-V02 | 2 (score 100; tied for positions 1-2) | 2 (score 100; tied for positions 1-2) |
| O2-V03 | 3 (score 90) | 3 (score 90) |
| O2-V04 | 16 (score 65; tied for positions 9-22) | 16 (score 65; tied for positions 9-22) |
| O2-V05 | 8 (score 76.67; tied for positions 7-8) | 8 (score 76.67; tied for positions 7-8) |
| O2-V06 | 6 (score 78.33) | 6 (score 78.33) |

Top 12 of each ranking side by side (match score in brackets; * = relevant):

| Position | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| 1 | *O2-V01 (100) | *O2-V01 (100) |
| 2 | *O2-V02 (100) | *O2-V02 (100) |
| 3 | *O2-V03 (90) | *O2-V03 (90) |
| 4 | O2-V07 (88.33) | O2-V07 (88.33) |
| 5 | O2-V11 (80) | O2-V11 (80) |
| 6 | *O2-V06 (78.33) | *O2-V06 (78.33) |
| 7 | O1-V12 (76.67) | O1-V12 (76.67) |
| 8 | *O2-V05 (76.67) | *O2-V05 (76.67) |
| 9 | O1-V01 (65) | O1-V01 (65) |
| 10 | O1-V02 (65) | O1-V02 (65) |
| 11 | O1-V04 (65) | O1-V04 (65) |
| 12 | O1-V05 (65) | O1-V05 (65) |

### O3 Eye screening camp (k = 4)

- **Precision at 4, Layer 1 only:** 3/4 = 0.75
- **Precision at 4, Layer 1 + Layer 2:** 4/4 = 1.00; layer2Applied = false

Positions of the relevant volunteers (1 = top, out of 72):

| Volunteer | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| O3-V01 | 1 (score 100; tied for positions 1-2) | 1 (score 100; tied for positions 1-4) |
| O3-V02 | 2 (score 100; tied for positions 1-2) | 2 (score 100; tied for positions 1-4) |
| O3-V03 | 3 (score 90) | 5 (score 90; tied for positions 5-6) |
| O3-V04 | 8 (score 65; tied for positions 8-11) | 3 (score 100; tied for positions 1-4) |
| O3-V05 | 7 (score 76.67) | 4 (score 100; tied for positions 1-4) |
| O3-V06 | 6 (score 78.33) | 6 (score 90; tied for positions 5-6) |

Top 12 of each ranking side by side (match score in brackets; * = relevant):

| Position | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| 1 | *O3-V01 (100) | *O3-V01 (100) |
| 2 | *O3-V02 (100) | *O3-V02 (100) |
| 3 | *O3-V03 (90) | *O3-V04 (100) |
| 4 | O3-V07 (88.33) | *O3-V05 (100) |
| 5 | O3-V11 (80) | *O3-V03 (90) |
| 6 | *O3-V06 (78.33) | *O3-V06 (90) |
| 7 | *O3-V05 (76.67) | O3-V07 (88.33) |
| 8 | *O3-V04 (65) | O3-V11 (80) |
| 9 | O3-V08 (65) | O3-V08 (76.67) |
| 10 | O3-V09 (65) | O3-V09 (65) |
| 11 | O3-V12 (65) | O3-V12 (65) |
| 12 | O1-V03 (55) | O1-V03 (55) |

### O4 Maternal health outreach (k = 3)

- **Precision at 3, Layer 1 only:** 3/3 = 1.00
- **Precision at 3, Layer 1 + Layer 2:** 3/3 = 1.00 (1 volunteer(s) below position 3 share the score at position 3); layer2Applied = true

Positions of the relevant volunteers (1 = top, out of 72):

| Volunteer | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| O4-V01 | 1 (score 100; tied for positions 1-2) | 1 (score 100; tied for positions 1-4) |
| O4-V02 | 2 (score 100; tied for positions 1-2) | 2 (score 100; tied for positions 1-4) |
| O4-V03 | 3 (score 90) | 5 (score 90; tied for positions 5-6) |
| O4-V04 | 8 (score 65; tied for positions 8-11) | 3 (score 100; tied for positions 1-4) |
| O4-V05 | 7 (score 76.67) | 4 (score 100; tied for positions 1-4) |
| O4-V06 | 6 (score 78.33) | 6 (score 90; tied for positions 5-6) |

Top 12 of each ranking side by side (match score in brackets; * = relevant):

| Position | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| 1 | *O4-V01 (100) | *O4-V01 (100) |
| 2 | *O4-V02 (100) | *O4-V02 (100) |
| 3 | *O4-V03 (90) | *O4-V04 (100) |
| 4 | O4-V07 (88.33) | *O4-V05 (100) |
| 5 | O4-V11 (80) | *O4-V03 (90) |
| 6 | *O4-V06 (78.33) | *O4-V06 (90) |
| 7 | *O4-V05 (76.67) | O4-V07 (88.33) |
| 8 | *O4-V04 (65) | O4-V11 (80) |
| 9 | O4-V08 (65) | O4-V08 (76.67) |
| 10 | O4-V09 (65) | O4-V09 (65) |
| 11 | O4-V12 (65) | O4-V12 (65) |
| 12 | O1-V01 (55) | O1-V01 (55) |

### O5 Emergency first aid cover (k = 5)

- **Precision at 5, Layer 1 only:** 4/5 = 0.80
- **Precision at 5, Layer 1 + Layer 2:** 5/5 = 1.00; layer2Applied = true

Positions of the relevant volunteers (1 = top, out of 72):

| Volunteer | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| O5-V01 | 1 (score 100; tied for positions 1-3) | 1 (score 100; tied for positions 1-5) |
| O5-V02 | 2 (score 100; tied for positions 1-3) | 2 (score 100; tied for positions 1-5) |
| O5-V03 | 3 (score 100; tied for positions 1-3) | 3 (score 100; tied for positions 1-5) |
| O5-V04 | 10 (score 65; tied for positions 8-15) | 6 (score 88.33; tied for positions 6-7) |
| O5-V05 | 7 (score 76.67) | 4 (score 100; tied for positions 1-5) |
| O5-V06 | 4 (score 88.33; tied for positions 4-5) | 5 (score 100; tied for positions 1-5) |

Top 12 of each ranking side by side (match score in brackets; * = relevant):

| Position | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| 1 | *O5-V01 (100) | *O5-V01 (100) |
| 2 | *O5-V02 (100) | *O5-V02 (100) |
| 3 | *O5-V03 (100) | *O5-V03 (100) |
| 4 | *O5-V06 (88.33) | *O5-V05 (100) |
| 5 | O5-V07 (88.33) | *O5-V06 (100) |
| 6 | O5-V11 (80) | *O5-V04 (88.33) |
| 7 | *O5-V05 (76.67) | O5-V07 (88.33) |
| 8 | O1-V11 (65) | O5-V11 (80) |
| 9 | O4-V11 (65) | O5-V12 (76.67) |
| 10 | *O5-V04 (65) | O1-V11 (65) |
| 11 | O5-V08 (65) | O4-V11 (65) |
| 12 | O5-V09 (65) | O5-V08 (65) |

### O6 Community pharmacy day (k = 3)

- **Precision at 3, Layer 1 only:** 3/3 = 1.00
- **Precision at 3, Layer 1 + Layer 2:** 3/3 = 1.00 (1 volunteer(s) below position 3 share the score at position 3); layer2Applied = false

Positions of the relevant volunteers (1 = top, out of 72):

| Volunteer | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| O6-V01 | 1 (score 100; tied for positions 1-2) | 1 (score 100; tied for positions 1-4) |
| O6-V02 | 2 (score 100; tied for positions 1-2) | 2 (score 100; tied for positions 1-4) |
| O6-V03 | 3 (score 90) | 5 (score 90; tied for positions 5-6) |
| O6-V04 | 10 (score 65; tied for positions 8-13) | 3 (score 100; tied for positions 1-4) |
| O6-V05 | 7 (score 76.67) | 4 (score 100; tied for positions 1-4) |
| O6-V06 | 6 (score 78.33) | 6 (score 90; tied for positions 5-6) |

Top 12 of each ranking side by side (match score in brackets; * = relevant):

| Position | Layer 1 only | Layer 1 + 2 |
|---|---|---|
| 1 | *O6-V01 (100) | *O6-V01 (100) |
| 2 | *O6-V02 (100) | *O6-V02 (100) |
| 3 | *O6-V03 (90) | *O6-V04 (100) |
| 4 | O6-V07 (88.33) | *O6-V05 (100) |
| 5 | O6-V11 (80) | *O6-V03 (90) |
| 6 | *O6-V06 (78.33) | *O6-V06 (90) |
| 7 | *O6-V05 (76.67) | O6-V07 (88.33) |
| 8 | O3-V11 (65) | O6-V11 (80) |
| 9 | O5-V11 (65) | O6-V08 (76.67) |
| 10 | *O6-V04 (65) | O3-V11 (65) |
| 11 | O6-V08 (65) | O5-V11 (65) |
| 12 | O6-V09 (65) | O6-V09 (65) |

## 1.4 Gemini calls and the cache

| Run | Outreach | Pairs needing a judgement | Found in cache | Gemini calls | Pairs sent | layer2Applied | Request time (ms) |
|---|---|---|---|---|---|---|---|
| B | O1 | 173 | 0 | 6 | 173 | true | 4404 |
| B | O2 | 173 | 9 | 6 | 164 | false | 8065 |
| B | O3 | 176 | 9 | 6 | 167 | false | 8043 |
| B | O4 | 176 | 18 | 6 | 158 | true | 3775 |
| B | O5 | 173 | 25 | 5 | 148 | true | 3770 |
| B | O6 | 176 | 27 | 5 | 149 | false | 3788 |
| C | O1 | 173 | 173 | 0 | 0 | true | 16 |
| C | O2 | 173 | 27 | 5 | 146 | true | 4005 |
| C | O3 | 176 | 89 | 3 | 87 | true | 3734 |
| C | O4 | 176 | 176 | 0 | 0 | true | 11 |
| C | O5 | 173 | 173 | 0 | 0 | true | 9 |
| C | O6 | 176 | 155 | 1 | 21 | true | 2556 |

- **Run B (cold):** 34 Gemini calls; 88 of 1047 pair look-ups answered from the cache.
- **Run C (second run):** 9 Gemini calls; 793 of 1047 pair look-ups answered from the cache.
- HTTP statuses returned by Gemini: 200 x32, error x8, 429 x3.

## 1.5 Skill pairs Gemini judged

Every pair Gemini answered across runs B and C, against the meaning tags recorded before the run. "Mistake" means Gemini disagreed with the tags.

**Judged equivalent (32)**

| Pair | Gemini | Tags say | |
|---|---|---|---|
| antenatal care / pregnancy check-ups | equivalent | equivalent |  |
| antenatal care / prenatal care | equivalent | equivalent |  |
| blood draw / venipuncture | equivalent | equivalent | worked example in the prompt |
| blood glucose testing / blood sugar testing | equivalent | equivalent |  |
| blood glucose testing / finger-prick glucose test | equivalent | equivalent |  |
| blood pressure measurement / bp checks | equivalent | equivalent |  |
| blood pressure measurement / taking blood pressure | equivalent | equivalent |  |
| breastfeeding support / lactation support | equivalent | equivalent |  |
| calculating drug doses / dosage calculation | equivalent | equivalent |  |
| cardiopulmonary resuscitation (cpr) / cpr | equivalent | equivalent |  |
| casualty sorting / emergency triage | equivalent | equivalent |  |
| cataract screening / checking for cataracts | equivalent | equivalent |  |
| contraception counselling / family planning counselling | equivalent | equivalent |  |
| dispensing medicines / medication dispensing | equivalent | equivalent |  |
| dressing wounds / wound and bleeding control | equivalent | not equivalent | **Mistake** |
| dressing wounds / wound dressing | equivalent | equivalent |  |
| emergency triage / triage | equivalent | equivalent |  |
| explaining how to take medicines / patient counselling on medication | equivalent | equivalent |  |
| eye chart vision testing / visual acuity screening | equivalent | equivalent |  |
| eye health education / teaching eye care | equivalent | equivalent |  |
| giving injections / injection administration | equivalent | equivalent |  |
| haemorrhage control / wound and bleeding control | equivalent | equivalent |  |
| infection control / infection prevention and control | equivalent | equivalent |  |
| injection administration / intramuscular injections | equivalent | equivalent |  |
| injection administration / vaccination administration | equivalent | not equivalent | **Mistake** |
| medication counselling / patient counselling on medication | equivalent | equivalent |  |
| phlebotomy / venipuncture | equivalent | equivalent |  |
| snellen chart testing / visual acuity screening | equivalent | equivalent |  |
| stopping severe bleeding / wound and bleeding control | equivalent | equivalent |  |
| wound and bleeding control / wound care | equivalent | not equivalent | **Mistake** |
| wound and bleeding control / wound dressing | equivalent | not equivalent | **Mistake** |
| wound care / wound dressing | equivalent | equivalent | worked example in the prompt |

**Judged not equivalent (880)**

| Pair | Gemini | Tags say | |
|---|---|---|---|
| antenatal care / blood draw | not equivalent | not equivalent |  |
| antenatal care / blood glucose testing | not equivalent | not equivalent |  |
| antenatal care / blood pressure measurement | not equivalent | not equivalent |  |
| antenatal care / blood sugar testing | not equivalent | not equivalent |  |
| antenatal care / bp checks | not equivalent | not equivalent |  |
| antenatal care / burns management | not equivalent | not equivalent |  |
| antenatal care / calculating drug doses | not equivalent | not equivalent |  |
| antenatal care / cardiopulmonary resuscitation (cpr) | not equivalent | not equivalent |  |
| antenatal care / casualty sorting | not equivalent | not equivalent |  |
| antenatal care / cataract screening | not equivalent | not equivalent |  |
| antenatal care / checking for cataracts | not equivalent | not equivalent |  |
| antenatal care / chest compressions | not equivalent | not equivalent |  |
| antenatal care / community mobilisation | not equivalent | not equivalent |  |
| antenatal care / contraception counselling | not equivalent | not equivalent |  |
| antenatal care / cpr | not equivalent | not equivalent |  |
| antenatal care / crowd and queue management | not equivalent | not equivalent |  |
| antenatal care / data entry | not equivalent | not equivalent |  |
| antenatal care / dispensing medicines | not equivalent | not equivalent |  |
| antenatal care / dosage calculation | not equivalent | not equivalent |  |
| antenatal care / dressing wounds | not equivalent | not equivalent |  |
| antenatal care / emergency triage | not equivalent | not equivalent |  |
| antenatal care / explaining how to take medicines | not equivalent | not equivalent |  |
| antenatal care / eye chart vision testing | not equivalent | not equivalent |  |
| antenatal care / eye health education | not equivalent | not equivalent |  |
| antenatal care / finger-prick glucose test | not equivalent | not equivalent |  |
| antenatal care / giving injections | not equivalent | not equivalent |  |
| antenatal care / haemorrhage control | not equivalent | not equivalent |  |
| antenatal care / health education | not equivalent | not equivalent |  |
| antenatal care / infection control | not equivalent | not equivalent |  |
| antenatal care / infection prevention and control | not equivalent | not equivalent |  |
| antenatal care / injection administration | not equivalent | not equivalent |  |
| antenatal care / intramuscular injections | not equivalent | not equivalent |  |
| antenatal care / intraocular pressure measurement | not equivalent | not equivalent |  |
| antenatal care / lactation support | not equivalent | not equivalent |  |
| antenatal care / logistics and setup | not equivalent | not equivalent |  |
| antenatal care / medication counselling | not equivalent | not equivalent |  |
| antenatal care / medication dispensing | not equivalent | not equivalent |  |
| antenatal care / patient counselling on medication | not equivalent | not equivalent |  |
| antenatal care / patient registration | not equivalent | not equivalent |  |
| antenatal care / phlebotomy | not equivalent | not equivalent |  |
| antenatal care / postnatal care | not equivalent | not equivalent |  |
| antenatal care / prescription review | not equivalent | not equivalent |  |
| antenatal care / pulse oximetry | not equivalent | not equivalent |  |
| antenatal care / record keeping | not equivalent | not equivalent |  |
| antenatal care / snellen chart testing | not equivalent | not equivalent |  |
| antenatal care / splinting and immobilisation | not equivalent | not equivalent |  |
| antenatal care / stopping severe bleeding | not equivalent | not equivalent |  |
| antenatal care / taking blood pressure | not equivalent | not equivalent |  |
| antenatal care / teaching eye care | not equivalent | not equivalent |  |
| antenatal care / translation/interpretation | not equivalent | not equivalent |  |
| antenatal care / triage | not equivalent | not equivalent |  |
| antenatal care / vaccination administration | not equivalent | not equivalent |  |
| antenatal care / venipuncture | not equivalent | not equivalent |  |
| antenatal care / visual acuity screening | not equivalent | not equivalent |  |
| antenatal care / wound and bleeding control | not equivalent | not equivalent |  |
| antenatal care / wound care | not equivalent | not equivalent |  |
| antenatal care / wound dressing | not equivalent | not equivalent |  |
| blood draw / blood glucose testing | not equivalent | not equivalent |  |
| blood draw / blood pressure measurement | not equivalent | not equivalent |  |
| blood draw / breastfeeding support | not equivalent | not equivalent |  |
| blood draw / cardiopulmonary resuscitation (cpr) | not equivalent | not equivalent |  |
| blood draw / cataract screening | not equivalent | not equivalent |  |
| blood draw / dosage calculation | not equivalent | not equivalent |  |
| blood draw / emergency triage | not equivalent | not equivalent |  |
| blood draw / eye health education | not equivalent | not equivalent |  |
| blood draw / family planning counselling | not equivalent | not equivalent |  |
| blood draw / infection control | not equivalent | not equivalent |  |
| blood draw / injection administration | not equivalent | not equivalent |  |
| blood draw / medication dispensing | not equivalent | not equivalent |  |
| blood draw / patient counselling on medication | not equivalent | not equivalent |  |
| blood draw / visual acuity screening | not equivalent | not equivalent |  |
| blood draw / wound and bleeding control | not equivalent | not equivalent |  |
| blood draw / wound dressing | not equivalent | not equivalent |  |
| blood glucose testing / breastfeeding support | not equivalent | not equivalent |  |
| blood glucose testing / burns management | not equivalent | not equivalent |  |
| blood glucose testing / calculating drug doses | not equivalent | not equivalent |  |
| blood glucose testing / cardiopulmonary resuscitation (cpr) | not equivalent | not equivalent |  |
| blood glucose testing / casualty sorting | not equivalent | not equivalent |  |
| blood glucose testing / cataract screening | not equivalent | not equivalent |  |
| blood glucose testing / checking for cataracts | not equivalent | not equivalent |  |
| blood glucose testing / chest compressions | not equivalent | not equivalent |  |
| blood glucose testing / community mobilisation | not equivalent | not equivalent |  |
| blood glucose testing / contraception counselling | not equivalent | not equivalent |  |
| blood glucose testing / cpr | not equivalent | not equivalent |  |
| blood glucose testing / crowd and queue management | not equivalent | not equivalent |  |
| blood glucose testing / data entry | not equivalent | not equivalent |  |
| blood glucose testing / dispensing medicines | not equivalent | not equivalent |  |
| blood glucose testing / dosage calculation | not equivalent | not equivalent |  |
| blood glucose testing / dressing wounds | not equivalent | not equivalent |  |
| blood glucose testing / emergency triage | not equivalent | not equivalent |  |
| blood glucose testing / explaining how to take medicines | not equivalent | not equivalent |  |
| blood glucose testing / eye chart vision testing | not equivalent | not equivalent |  |
| blood glucose testing / eye health education | not equivalent | not equivalent |  |
| blood glucose testing / family planning counselling | not equivalent | not equivalent |  |
| blood glucose testing / giving injections | not equivalent | not equivalent |  |
| blood glucose testing / haemorrhage control | not equivalent | not equivalent |  |
| blood glucose testing / health education | not equivalent | not equivalent |  |
| blood glucose testing / infection control | not equivalent | not equivalent |  |
| blood glucose testing / infection prevention and control | not equivalent | not equivalent |  |
| blood glucose testing / injection administration | not equivalent | not equivalent |  |
| blood glucose testing / intramuscular injections | not equivalent | not equivalent |  |
| blood glucose testing / intraocular pressure measurement | not equivalent | not equivalent |  |
| blood glucose testing / lactation support | not equivalent | not equivalent |  |
| blood glucose testing / logistics and setup | not equivalent | not equivalent |  |
| blood glucose testing / medication counselling | not equivalent | not equivalent |  |
| blood glucose testing / medication dispensing | not equivalent | not equivalent |  |
| blood glucose testing / patient counselling on medication | not equivalent | not equivalent |  |
| blood glucose testing / patient registration | not equivalent | not equivalent |  |
| blood glucose testing / phlebotomy | not equivalent | not equivalent |  |
| blood glucose testing / postnatal care | not equivalent | not equivalent |  |
| blood glucose testing / pregnancy check-ups | not equivalent | not equivalent |  |
| blood glucose testing / prenatal care | not equivalent | not equivalent |  |
| blood glucose testing / prescription review | not equivalent | not equivalent |  |
| blood glucose testing / pulse oximetry | not equivalent | not equivalent |  |
| blood glucose testing / record keeping | not equivalent | not equivalent |  |
| blood glucose testing / snellen chart testing | not equivalent | not equivalent |  |
| blood glucose testing / splinting and immobilisation | not equivalent | not equivalent |  |
| blood glucose testing / stopping severe bleeding | not equivalent | not equivalent |  |
| blood glucose testing / taking blood pressure | not equivalent | not equivalent |  |
| blood glucose testing / teaching eye care | not equivalent | not equivalent |  |
| blood glucose testing / translation/interpretation | not equivalent | not equivalent |  |
| blood glucose testing / triage | not equivalent | not equivalent |  |
| blood glucose testing / vaccination administration | not equivalent | not equivalent |  |
| blood glucose testing / visual acuity screening | not equivalent | not equivalent |  |
| blood glucose testing / wound and bleeding control | not equivalent | not equivalent |  |
| blood glucose testing / wound care | not equivalent | not equivalent |  |
| blood glucose testing / wound dressing | not equivalent | not equivalent |  |
| blood pressure measurement / blood sugar testing | not equivalent | not equivalent |  |
| blood pressure measurement / breastfeeding support | not equivalent | not equivalent |  |
| blood pressure measurement / burns management | not equivalent | not equivalent |  |
| blood pressure measurement / calculating drug doses | not equivalent | not equivalent |  |
| blood pressure measurement / cardiopulmonary resuscitation (cpr) | not equivalent | not equivalent |  |
| blood pressure measurement / casualty sorting | not equivalent | not equivalent |  |
| blood pressure measurement / cataract screening | not equivalent | not equivalent |  |
| blood pressure measurement / checking for cataracts | not equivalent | not equivalent |  |
| blood pressure measurement / chest compressions | not equivalent | not equivalent |  |
| blood pressure measurement / community mobilisation | not equivalent | not equivalent |  |
| blood pressure measurement / contraception counselling | not equivalent | not equivalent |  |
| blood pressure measurement / cpr | not equivalent | not equivalent |  |
| blood pressure measurement / crowd and queue management | not equivalent | not equivalent |  |
| blood pressure measurement / data entry | not equivalent | not equivalent |  |
| blood pressure measurement / dispensing medicines | not equivalent | not equivalent |  |
| blood pressure measurement / dosage calculation | not equivalent | not equivalent |  |
| blood pressure measurement / dressing wounds | not equivalent | not equivalent |  |
| blood pressure measurement / emergency triage | not equivalent | not equivalent |  |
| blood pressure measurement / explaining how to take medicines | not equivalent | not equivalent |  |
| blood pressure measurement / eye chart vision testing | not equivalent | not equivalent |  |
| blood pressure measurement / eye health education | not equivalent | not equivalent |  |
| blood pressure measurement / family planning counselling | not equivalent | not equivalent |  |
| blood pressure measurement / giving injections | not equivalent | not equivalent |  |
| blood pressure measurement / haemorrhage control | not equivalent | not equivalent |  |
| blood pressure measurement / health education | not equivalent | not equivalent |  |
| blood pressure measurement / infection control | not equivalent | not equivalent |  |
| blood pressure measurement / infection prevention and control | not equivalent | not equivalent |  |
| blood pressure measurement / injection administration | not equivalent | not equivalent |  |
| blood pressure measurement / intramuscular injections | not equivalent | not equivalent |  |
| blood pressure measurement / intraocular pressure measurement | not equivalent | not equivalent |  |
| blood pressure measurement / lactation support | not equivalent | not equivalent |  |
| blood pressure measurement / logistics and setup | not equivalent | not equivalent |  |
| blood pressure measurement / medication counselling | not equivalent | not equivalent |  |
| blood pressure measurement / medication dispensing | not equivalent | not equivalent |  |
| blood pressure measurement / patient counselling on medication | not equivalent | not equivalent |  |
| blood pressure measurement / patient registration | not equivalent | not equivalent |  |
| blood pressure measurement / postnatal care | not equivalent | not equivalent |  |
| blood pressure measurement / pregnancy check-ups | not equivalent | not equivalent |  |
| blood pressure measurement / prenatal care | not equivalent | not equivalent |  |
| blood pressure measurement / prescription review | not equivalent | not equivalent |  |
| blood pressure measurement / pulse oximetry | not equivalent | not equivalent |  |
| blood pressure measurement / record keeping | not equivalent | not equivalent |  |
| blood pressure measurement / snellen chart testing | not equivalent | not equivalent |  |
| blood pressure measurement / splinting and immobilisation | not equivalent | not equivalent |  |
| blood pressure measurement / stopping severe bleeding | not equivalent | not equivalent |  |
| blood pressure measurement / teaching eye care | not equivalent | not equivalent |  |
| blood pressure measurement / translation/interpretation | not equivalent | not equivalent |  |
| blood pressure measurement / triage | not equivalent | not equivalent |  |
| blood pressure measurement / vaccination administration | not equivalent | not equivalent |  |
| blood pressure measurement / visual acuity screening | not equivalent | not equivalent |  |
| blood pressure measurement / wound and bleeding control | not equivalent | not equivalent |  |
| blood pressure measurement / wound care | not equivalent | not equivalent |  |
| blood pressure measurement / wound dressing | not equivalent | not equivalent |  |
| blood sugar testing / breastfeeding support | not equivalent | not equivalent |  |
| blood sugar testing / cardiopulmonary resuscitation (cpr) | not equivalent | not equivalent |  |
| blood sugar testing / cataract screening | not equivalent | not equivalent |  |
| blood sugar testing / dosage calculation | not equivalent | not equivalent |  |
| blood sugar testing / emergency triage | not equivalent | not equivalent |  |
| blood sugar testing / eye health education | not equivalent | not equivalent |  |
| blood sugar testing / family planning counselling | not equivalent | not equivalent |  |
| blood sugar testing / infection control | not equivalent | not equivalent |  |
| blood sugar testing / injection administration | not equivalent | not equivalent |  |
| blood sugar testing / medication dispensing | not equivalent | not equivalent |  |
| blood sugar testing / patient counselling on medication | not equivalent | not equivalent |  |
| blood sugar testing / venipuncture | not equivalent | not equivalent |  |
| blood sugar testing / visual acuity screening | not equivalent | not equivalent |  |
| blood sugar testing / wound and bleeding control | not equivalent | not equivalent |  |
| blood sugar testing / wound dressing | not equivalent | not equivalent |  |
| bp checks / breastfeeding support | not equivalent | not equivalent |  |
| bp checks / cardiopulmonary resuscitation (cpr) | not equivalent | not equivalent |  |
| bp checks / cataract screening | not equivalent | not equivalent |  |
| bp checks / dosage calculation | not equivalent | not equivalent |  |
| bp checks / emergency triage | not equivalent | not equivalent |  |
| bp checks / eye health education | not equivalent | not equivalent |  |
| bp checks / family planning counselling | not equivalent | not equivalent |  |
| bp checks / infection control | not equivalent | not equivalent |  |
| bp checks / injection administration | not equivalent | not equivalent |  |
| bp checks / medication dispensing | not equivalent | not equivalent |  |
| bp checks / patient counselling on medication | not equivalent | not equivalent |  |
| bp checks / visual acuity screening | not equivalent | not equivalent |  |
| bp checks / wound and bleeding control | not equivalent | not equivalent |  |
| bp checks / wound dressing | not equivalent | not equivalent |  |
| breastfeeding support / burns management | not equivalent | not equivalent |  |
| breastfeeding support / calculating drug doses | not equivalent | not equivalent |  |
| breastfeeding support / cardiopulmonary resuscitation (cpr) | not equivalent | not equivalent |  |
| breastfeeding support / casualty sorting | not equivalent | not equivalent |  |
| breastfeeding support / cataract screening | not equivalent | not equivalent |  |
| breastfeeding support / checking for cataracts | not equivalent | not equivalent |  |
| breastfeeding support / chest compressions | not equivalent | not equivalent |  |
| breastfeeding support / community mobilisation | not equivalent | not equivalent |  |
| breastfeeding support / contraception counselling | not equivalent | not equivalent |  |
| breastfeeding support / cpr | not equivalent | not equivalent |  |
| breastfeeding support / crowd and queue management | not equivalent | not equivalent |  |
| breastfeeding support / data entry | not equivalent | not equivalent |  |
| breastfeeding support / dispensing medicines | not equivalent | not equivalent |  |
| breastfeeding support / dosage calculation | not equivalent | not equivalent |  |
| breastfeeding support / dressing wounds | not equivalent | not equivalent |  |
| breastfeeding support / emergency triage | not equivalent | not equivalent |  |
| breastfeeding support / explaining how to take medicines | not equivalent | not equivalent |  |
| breastfeeding support / eye chart vision testing | not equivalent | not equivalent |  |
| breastfeeding support / eye health education | not equivalent | not equivalent |  |
| breastfeeding support / finger-prick glucose test | not equivalent | not equivalent |  |
| breastfeeding support / giving injections | not equivalent | not equivalent |  |
| breastfeeding support / haemorrhage control | not equivalent | not equivalent |  |
| breastfeeding support / health education | not equivalent | not equivalent |  |
| breastfeeding support / infection control | not equivalent | not equivalent |  |
| breastfeeding support / infection prevention and control | not equivalent | not equivalent |  |
| breastfeeding support / injection administration | not equivalent | not equivalent |  |
| breastfeeding support / intramuscular injections | not equivalent | not equivalent |  |
| breastfeeding support / intraocular pressure measurement | not equivalent | not equivalent |  |
| breastfeeding support / logistics and setup | not equivalent | not equivalent |  |
| breastfeeding support / medication counselling | not equivalent | not equivalent |  |
| breastfeeding support / medication dispensing | not equivalent | not equivalent |  |
| breastfeeding support / patient counselling on medication | not equivalent | not equivalent |  |
| breastfeeding support / patient registration | not equivalent | not equivalent |  |
| breastfeeding support / phlebotomy | not equivalent | not equivalent |  |
| breastfeeding support / postnatal care | not equivalent | not equivalent |  |
| breastfeeding support / prenatal care | not equivalent | not equivalent |  |
| breastfeeding support / prescription review | not equivalent | not equivalent |  |
| breastfeeding support / pulse oximetry | not equivalent | not equivalent |  |
| breastfeeding support / record keeping | not equivalent | not equivalent |  |
| breastfeeding support / snellen chart testing | not equivalent | not equivalent |  |
| breastfeeding support / splinting and immobilisation | not equivalent | not equivalent |  |
| breastfeeding support / stopping severe bleeding | not equivalent | not equivalent |  |
| breastfeeding support / taking blood pressure | not equivalent | not equivalent |  |
| breastfeeding support / teaching eye care | not equivalent | not equivalent |  |
| breastfeeding support / translation/interpretation | not equivalent | not equivalent |  |
| breastfeeding support / triage | not equivalent | not equivalent |  |
| breastfeeding support / vaccination administration | not equivalent | not equivalent |  |
| breastfeeding support / venipuncture | not equivalent | not equivalent |  |
| breastfeeding support / visual acuity screening | not equivalent | not equivalent |  |
| breastfeeding support / wound and bleeding control | not equivalent | not equivalent |  |
| breastfeeding support / wound care | not equivalent | not equivalent |  |
| breastfeeding support / wound dressing | not equivalent | not equivalent |  |
| burns management / cardiopulmonary resuscitation (cpr) | not equivalent | not equivalent |  |
| burns management / cataract screening | not equivalent | not equivalent |  |
| burns management / dosage calculation | not equivalent | not equivalent |  |
| burns management / emergency triage | not equivalent | not equivalent |  |
| burns management / eye health education | not equivalent | not equivalent |  |
| burns management / family planning counselling | not equivalent | not equivalent |  |
| burns management / infection control | not equivalent | not equivalent |  |
| burns management / injection administration | not equivalent | not equivalent |  |
| burns management / medication dispensing | not equivalent | not equivalent |  |
| burns management / patient counselling on medication | not equivalent | not equivalent |  |
| burns management / venipuncture | not equivalent | not equivalent |  |
| burns management / visual acuity screening | not equivalent | not equivalent |  |
| burns management / wound and bleeding control | not equivalent | not equivalent |  |
| burns management / wound dressing | not equivalent | not equivalent |  |
| calculating drug doses / cardiopulmonary resuscitation (cpr) | not equivalent | not equivalent |  |
| calculating drug doses / cataract screening | not equivalent | not equivalent |  |
| calculating drug doses / emergency triage | not equivalent | not equivalent |  |
| calculating drug doses / eye health education | not equivalent | not equivalent |  |
| calculating drug doses / family planning counselling | not equivalent | not equivalent |  |
| calculating drug doses / infection control | not equivalent | not equivalent |  |
| calculating drug doses / injection administration | not equivalent | not equivalent |  |
| calculating drug doses / medication dispensing | not equivalent | not equivalent |  |
| calculating drug doses / patient counselling on medication | not equivalent | not equivalent |  |
| calculating drug doses / venipuncture | not equivalent | not equivalent |  |
| calculating drug doses / visual acuity screening | not equivalent | not equivalent |  |
| calculating drug doses / wound and bleeding control | not equivalent | not equivalent |  |
| calculating drug doses / wound dressing | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / casualty sorting | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / cataract screening | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / checking for cataracts | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / chest compressions | not equivalent | equivalent | **Mistake** |
| cardiopulmonary resuscitation (cpr) / community mobilisation | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / contraception counselling | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / crowd and queue management | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / data entry | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / dispensing medicines | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / dosage calculation | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / dressing wounds | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / explaining how to take medicines | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / eye chart vision testing | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / eye health education | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / family planning counselling | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / finger-prick glucose test | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / giving injections | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / haemorrhage control | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / health education | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / infection control | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / infection prevention and control | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / injection administration | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / intramuscular injections | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / intraocular pressure measurement | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / lactation support | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / logistics and setup | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / medication counselling | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / medication dispensing | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / patient counselling on medication | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / patient registration | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / phlebotomy | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / postnatal care | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / pregnancy check-ups | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / prenatal care | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / prescription review | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / pulse oximetry | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / record keeping | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / snellen chart testing | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / splinting and immobilisation | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / stopping severe bleeding | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / taking blood pressure | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / teaching eye care | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / translation/interpretation | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / vaccination administration | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / venipuncture | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / visual acuity screening | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / wound care | not equivalent | not equivalent |  |
| cardiopulmonary resuscitation (cpr) / wound dressing | not equivalent | not equivalent |  |
| casualty sorting / cataract screening | not equivalent | not equivalent |  |
| casualty sorting / dosage calculation | not equivalent | not equivalent |  |
| casualty sorting / eye health education | not equivalent | not equivalent |  |
| casualty sorting / family planning counselling | not equivalent | not equivalent |  |
| casualty sorting / infection control | not equivalent | not equivalent |  |
| casualty sorting / injection administration | not equivalent | not equivalent |  |
| casualty sorting / medication dispensing | not equivalent | not equivalent |  |
| casualty sorting / patient counselling on medication | not equivalent | not equivalent |  |
| casualty sorting / venipuncture | not equivalent | not equivalent |  |
| casualty sorting / visual acuity screening | not equivalent | not equivalent |  |
| casualty sorting / wound and bleeding control | not equivalent | not equivalent |  |
| casualty sorting / wound dressing | not equivalent | not equivalent |  |
| cataract screening / chest compressions | not equivalent | not equivalent |  |
| cataract screening / community mobilisation | not equivalent | not equivalent |  |
| cataract screening / contraception counselling | not equivalent | not equivalent |  |
| cataract screening / cpr | not equivalent | not equivalent |  |
| cataract screening / crowd and queue management | not equivalent | not equivalent |  |
| cataract screening / data entry | not equivalent | not equivalent |  |
| cataract screening / dispensing medicines | not equivalent | not equivalent |  |
| cataract screening / dosage calculation | not equivalent | not equivalent |  |
| cataract screening / dressing wounds | not equivalent | not equivalent |  |
| cataract screening / emergency triage | not equivalent | not equivalent |  |
| cataract screening / explaining how to take medicines | not equivalent | not equivalent |  |
| cataract screening / eye chart vision testing | not equivalent | not equivalent |  |
| cataract screening / family planning counselling | not equivalent | not equivalent |  |
| cataract screening / finger-prick glucose test | not equivalent | not equivalent |  |
| cataract screening / giving injections | not equivalent | not equivalent |  |
| cataract screening / haemorrhage control | not equivalent | not equivalent |  |
| cataract screening / health education | not equivalent | not equivalent |  |
| cataract screening / infection control | not equivalent | not equivalent |  |
| cataract screening / infection prevention and control | not equivalent | not equivalent |  |
| cataract screening / injection administration | not equivalent | not equivalent |  |
| cataract screening / intramuscular injections | not equivalent | not equivalent |  |
| cataract screening / intraocular pressure measurement | not equivalent | not equivalent |  |
| cataract screening / lactation support | not equivalent | not equivalent |  |
| cataract screening / logistics and setup | not equivalent | not equivalent |  |
| cataract screening / medication counselling | not equivalent | not equivalent |  |
| cataract screening / medication dispensing | not equivalent | not equivalent |  |
| cataract screening / patient counselling on medication | not equivalent | not equivalent |  |
| cataract screening / patient registration | not equivalent | not equivalent |  |
| cataract screening / phlebotomy | not equivalent | not equivalent |  |
| cataract screening / postnatal care | not equivalent | not equivalent |  |
| cataract screening / pregnancy check-ups | not equivalent | not equivalent |  |
| cataract screening / prenatal care | not equivalent | not equivalent |  |
| cataract screening / prescription review | not equivalent | not equivalent |  |
| cataract screening / pulse oximetry | not equivalent | not equivalent |  |
| cataract screening / record keeping | not equivalent | not equivalent |  |
| cataract screening / snellen chart testing | not equivalent | not equivalent |  |
| cataract screening / splinting and immobilisation | not equivalent | not equivalent |  |
| cataract screening / stopping severe bleeding | not equivalent | not equivalent |  |
| cataract screening / taking blood pressure | not equivalent | not equivalent |  |
| cataract screening / teaching eye care | not equivalent | not equivalent |  |
| cataract screening / translation/interpretation | not equivalent | not equivalent |  |
| cataract screening / triage | not equivalent | not equivalent |  |
| cataract screening / vaccination administration | not equivalent | not equivalent |  |
| cataract screening / venipuncture | not equivalent | not equivalent |  |
| cataract screening / wound and bleeding control | not equivalent | not equivalent |  |
| cataract screening / wound care | not equivalent | not equivalent |  |
| cataract screening / wound dressing | not equivalent | not equivalent |  |
| checking for cataracts / dosage calculation | not equivalent | not equivalent |  |
| checking for cataracts / emergency triage | not equivalent | not equivalent |  |
| checking for cataracts / eye health education | not equivalent | not equivalent |  |
| checking for cataracts / family planning counselling | not equivalent | not equivalent |  |
| checking for cataracts / infection control | not equivalent | not equivalent |  |
| checking for cataracts / injection administration | not equivalent | not equivalent |  |
| checking for cataracts / medication dispensing | not equivalent | not equivalent |  |
| checking for cataracts / patient counselling on medication | not equivalent | not equivalent |  |
| checking for cataracts / venipuncture | not equivalent | not equivalent |  |
| checking for cataracts / visual acuity screening | not equivalent | not equivalent |  |
| checking for cataracts / wound and bleeding control | not equivalent | not equivalent |  |
| checking for cataracts / wound dressing | not equivalent | not equivalent |  |
| chest compressions / dosage calculation | not equivalent | not equivalent |  |
| chest compressions / emergency triage | not equivalent | not equivalent |  |
| chest compressions / eye health education | not equivalent | not equivalent |  |
| chest compressions / family planning counselling | not equivalent | not equivalent |  |
| chest compressions / infection control | not equivalent | not equivalent |  |
| chest compressions / injection administration | not equivalent | not equivalent |  |
| chest compressions / medication dispensing | not equivalent | not equivalent |  |
| chest compressions / patient counselling on medication | not equivalent | not equivalent |  |
| chest compressions / venipuncture | not equivalent | not equivalent |  |
| chest compressions / visual acuity screening | not equivalent | not equivalent |  |
| chest compressions / wound and bleeding control | not equivalent | not equivalent |  |
| chest compressions / wound dressing | not equivalent | not equivalent |  |
| community mobilisation / dosage calculation | not equivalent | not equivalent |  |
| community mobilisation / emergency triage | not equivalent | not equivalent |  |
| community mobilisation / eye health education | not equivalent | not equivalent |  |
| community mobilisation / family planning counselling | not equivalent | not equivalent |  |
| community mobilisation / infection control | not equivalent | not equivalent |  |
| community mobilisation / injection administration | not equivalent | not equivalent |  |
| community mobilisation / medication dispensing | not equivalent | not equivalent |  |
| community mobilisation / patient counselling on medication | not equivalent | not equivalent |  |
| community mobilisation / venipuncture | not equivalent | not equivalent |  |
| community mobilisation / visual acuity screening | not equivalent | not equivalent |  |
| community mobilisation / wound and bleeding control | not equivalent | not equivalent |  |
| community mobilisation / wound dressing | not equivalent | not equivalent |  |
| contraception counselling / dosage calculation | not equivalent | not equivalent |  |
| contraception counselling / emergency triage | not equivalent | not equivalent |  |
| contraception counselling / eye health education | not equivalent | not equivalent |  |
| contraception counselling / infection control | not equivalent | not equivalent |  |
| contraception counselling / injection administration | not equivalent | not equivalent |  |
| contraception counselling / medication dispensing | not equivalent | not equivalent |  |
| contraception counselling / patient counselling on medication | not equivalent | not equivalent |  |
| contraception counselling / venipuncture | not equivalent | not equivalent |  |
| contraception counselling / visual acuity screening | not equivalent | not equivalent |  |
| contraception counselling / wound and bleeding control | not equivalent | not equivalent |  |
| contraception counselling / wound dressing | not equivalent | not equivalent |  |
| cpr / dosage calculation | not equivalent | not equivalent |  |
| cpr / eye health education | not equivalent | not equivalent |  |
| cpr / family planning counselling | not equivalent | not equivalent |  |
| cpr / infection control | not equivalent | not equivalent |  |
| cpr / injection administration | not equivalent | not equivalent |  |
| cpr / medication dispensing | not equivalent | not equivalent |  |
| cpr / patient counselling on medication | not equivalent | not equivalent |  |
| cpr / venipuncture | not equivalent | not equivalent |  |
| cpr / visual acuity screening | not equivalent | not equivalent |  |
| cpr / wound and bleeding control | not equivalent | not equivalent |  |
| cpr / wound dressing | not equivalent | not equivalent |  |
| crowd and queue management / dosage calculation | not equivalent | not equivalent |  |
| crowd and queue management / emergency triage | not equivalent | not equivalent |  |
| crowd and queue management / eye health education | not equivalent | not equivalent |  |
| crowd and queue management / family planning counselling | not equivalent | not equivalent |  |
| crowd and queue management / infection control | not equivalent | not equivalent |  |
| crowd and queue management / injection administration | not equivalent | not equivalent |  |
| crowd and queue management / medication dispensing | not equivalent | not equivalent |  |
| crowd and queue management / patient counselling on medication | not equivalent | not equivalent |  |
| crowd and queue management / venipuncture | not equivalent | not equivalent |  |
| crowd and queue management / visual acuity screening | not equivalent | not equivalent |  |
| crowd and queue management / wound and bleeding control | not equivalent | not equivalent |  |
| crowd and queue management / wound dressing | not equivalent | not equivalent |  |
| data entry / dosage calculation | not equivalent | not equivalent |  |
| data entry / emergency triage | not equivalent | not equivalent |  |
| data entry / eye health education | not equivalent | not equivalent |  |
| data entry / family planning counselling | not equivalent | not equivalent |  |
| data entry / infection control | not equivalent | not equivalent |  |
| data entry / injection administration | not equivalent | not equivalent |  |
| data entry / medication dispensing | not equivalent | not equivalent |  |
| data entry / patient counselling on medication | not equivalent | not equivalent |  |
| data entry / venipuncture | not equivalent | not equivalent |  |
| data entry / visual acuity screening | not equivalent | not equivalent |  |
| data entry / wound and bleeding control | not equivalent | not equivalent |  |
| data entry / wound dressing | not equivalent | not equivalent |  |
| dispensing medicines / dosage calculation | not equivalent | not equivalent |  |
| dispensing medicines / emergency triage | not equivalent | not equivalent |  |
| dispensing medicines / eye health education | not equivalent | not equivalent |  |
| dispensing medicines / family planning counselling | not equivalent | not equivalent |  |
| dispensing medicines / infection control | not equivalent | not equivalent |  |
| dispensing medicines / injection administration | not equivalent | not equivalent |  |
| dispensing medicines / patient counselling on medication | not equivalent | not equivalent |  |
| dispensing medicines / venipuncture | not equivalent | not equivalent |  |
| dispensing medicines / visual acuity screening | not equivalent | not equivalent |  |
| dispensing medicines / wound and bleeding control | not equivalent | not equivalent |  |
| dispensing medicines / wound dressing | not equivalent | not equivalent |  |
| dosage calculation / dressing wounds | not equivalent | not equivalent |  |
| dosage calculation / emergency triage | not equivalent | not equivalent |  |
| dosage calculation / eye chart vision testing | not equivalent | not equivalent |  |
| dosage calculation / eye health education | not equivalent | not equivalent |  |
| dosage calculation / family planning counselling | not equivalent | not equivalent |  |
| dosage calculation / finger-prick glucose test | not equivalent | not equivalent |  |
| dosage calculation / giving injections | not equivalent | not equivalent |  |
| dosage calculation / haemorrhage control | not equivalent | not equivalent |  |
| dosage calculation / health education | not equivalent | not equivalent |  |
| dosage calculation / infection control | not equivalent | not equivalent |  |
| dosage calculation / infection prevention and control | not equivalent | not equivalent |  |
| dosage calculation / injection administration | not equivalent | not equivalent |  |
| dosage calculation / intramuscular injections | not equivalent | not equivalent |  |
| dosage calculation / intraocular pressure measurement | not equivalent | not equivalent |  |
| dosage calculation / lactation support | not equivalent | not equivalent |  |
| dosage calculation / logistics and setup | not equivalent | not equivalent |  |
| dosage calculation / medication counselling | not equivalent | not equivalent |  |
| dosage calculation / patient registration | not equivalent | not equivalent |  |
| dosage calculation / phlebotomy | not equivalent | not equivalent |  |
| dosage calculation / postnatal care | not equivalent | not equivalent |  |
| dosage calculation / pregnancy check-ups | not equivalent | not equivalent |  |
| dosage calculation / prenatal care | not equivalent | not equivalent |  |
| dosage calculation / prescription review | not equivalent | not equivalent |  |
| dosage calculation / pulse oximetry | not equivalent | not equivalent |  |
| dosage calculation / record keeping | not equivalent | not equivalent |  |
| dosage calculation / snellen chart testing | not equivalent | not equivalent |  |
| dosage calculation / splinting and immobilisation | not equivalent | not equivalent |  |
| dosage calculation / stopping severe bleeding | not equivalent | not equivalent |  |
| dosage calculation / taking blood pressure | not equivalent | not equivalent |  |
| dosage calculation / teaching eye care | not equivalent | not equivalent |  |
| dosage calculation / translation/interpretation | not equivalent | not equivalent |  |
| dosage calculation / triage | not equivalent | not equivalent |  |
| dosage calculation / vaccination administration | not equivalent | not equivalent |  |
| dosage calculation / venipuncture | not equivalent | not equivalent |  |
| dosage calculation / visual acuity screening | not equivalent | not equivalent |  |
| dosage calculation / wound and bleeding control | not equivalent | not equivalent |  |
| dosage calculation / wound care | not equivalent | not equivalent |  |
| dosage calculation / wound dressing | not equivalent | not equivalent |  |
| dressing wounds / emergency triage | not equivalent | not equivalent |  |
| dressing wounds / eye health education | not equivalent | not equivalent |  |
| dressing wounds / family planning counselling | not equivalent | not equivalent |  |
| dressing wounds / infection control | not equivalent | not equivalent |  |
| dressing wounds / medication dispensing | not equivalent | not equivalent |  |
| dressing wounds / patient counselling on medication | not equivalent | not equivalent |  |
| dressing wounds / venipuncture | not equivalent | not equivalent |  |
| dressing wounds / visual acuity screening | not equivalent | not equivalent |  |
| emergency triage / explaining how to take medicines | not equivalent | not equivalent |  |
| emergency triage / eye chart vision testing | not equivalent | not equivalent |  |
| emergency triage / eye health education | not equivalent | not equivalent |  |
| emergency triage / family planning counselling | not equivalent | not equivalent |  |
| emergency triage / finger-prick glucose test | not equivalent | not equivalent |  |
| emergency triage / giving injections | not equivalent | not equivalent |  |
| emergency triage / haemorrhage control | not equivalent | not equivalent |  |
| emergency triage / health education | not equivalent | not equivalent |  |
| emergency triage / infection control | not equivalent | not equivalent |  |
| emergency triage / infection prevention and control | not equivalent | not equivalent |  |
| emergency triage / injection administration | not equivalent | not equivalent |  |
| emergency triage / intramuscular injections | not equivalent | not equivalent |  |
| emergency triage / intraocular pressure measurement | not equivalent | not equivalent |  |
| emergency triage / lactation support | not equivalent | not equivalent |  |
| emergency triage / logistics and setup | not equivalent | not equivalent |  |
| emergency triage / medication counselling | not equivalent | not equivalent |  |
| emergency triage / medication dispensing | not equivalent | not equivalent |  |
| emergency triage / patient counselling on medication | not equivalent | not equivalent |  |
| emergency triage / patient registration | not equivalent | not equivalent |  |
| emergency triage / phlebotomy | not equivalent | not equivalent |  |
| emergency triage / postnatal care | not equivalent | not equivalent |  |
| emergency triage / pregnancy check-ups | not equivalent | not equivalent |  |
| emergency triage / prenatal care | not equivalent | not equivalent |  |
| emergency triage / prescription review | not equivalent | not equivalent |  |
| emergency triage / pulse oximetry | not equivalent | not equivalent |  |
| emergency triage / record keeping | not equivalent | not equivalent |  |
| emergency triage / snellen chart testing | not equivalent | not equivalent |  |
| emergency triage / splinting and immobilisation | not equivalent | not equivalent |  |
| emergency triage / taking blood pressure | not equivalent | not equivalent |  |
| emergency triage / teaching eye care | not equivalent | not equivalent |  |
| emergency triage / translation/interpretation | not equivalent | not equivalent |  |
| emergency triage / vaccination administration | not equivalent | not equivalent |  |
| emergency triage / venipuncture | not equivalent | not equivalent |  |
| emergency triage / visual acuity screening | not equivalent | not equivalent |  |
| emergency triage / wound care | not equivalent | not equivalent |  |
| emergency triage / wound dressing | not equivalent | not equivalent |  |
| explaining how to take medicines / eye health education | not equivalent | not equivalent |  |
| explaining how to take medicines / family planning counselling | not equivalent | not equivalent |  |
| explaining how to take medicines / infection control | not equivalent | not equivalent |  |
| explaining how to take medicines / injection administration | not equivalent | not equivalent |  |
| explaining how to take medicines / medication dispensing | not equivalent | not equivalent |  |
| explaining how to take medicines / venipuncture | not equivalent | not equivalent |  |
| explaining how to take medicines / visual acuity screening | not equivalent | not equivalent |  |
| explaining how to take medicines / wound and bleeding control | not equivalent | not equivalent |  |
| explaining how to take medicines / wound dressing | not equivalent | not equivalent |  |
| eye chart vision testing / family planning counselling | not equivalent | not equivalent |  |
| eye chart vision testing / infection control | not equivalent | not equivalent |  |
| eye chart vision testing / injection administration | not equivalent | not equivalent |  |
| eye chart vision testing / medication dispensing | not equivalent | not equivalent |  |
| eye chart vision testing / patient counselling on medication | not equivalent | not equivalent |  |
| eye chart vision testing / venipuncture | not equivalent | not equivalent |  |
| eye chart vision testing / wound and bleeding control | not equivalent | not equivalent |  |
| eye chart vision testing / wound dressing | not equivalent | not equivalent |  |
| eye health education / family planning counselling | not equivalent | not equivalent |  |
| eye health education / finger-prick glucose test | not equivalent | not equivalent |  |
| eye health education / giving injections | not equivalent | not equivalent |  |
| eye health education / haemorrhage control | not equivalent | not equivalent |  |
| eye health education / health education | not equivalent | not equivalent |  |
| eye health education / infection control | not equivalent | not equivalent |  |
| eye health education / infection prevention and control | not equivalent | not equivalent |  |
| eye health education / injection administration | not equivalent | not equivalent |  |
| eye health education / intramuscular injections | not equivalent | not equivalent |  |
| eye health education / intraocular pressure measurement | not equivalent | not equivalent |  |
| eye health education / lactation support | not equivalent | not equivalent |  |
| eye health education / logistics and setup | not equivalent | not equivalent |  |
| eye health education / medication counselling | not equivalent | not equivalent |  |
| eye health education / medication dispensing | not equivalent | not equivalent |  |
| eye health education / patient counselling on medication | not equivalent | not equivalent |  |
| eye health education / patient registration | not equivalent | not equivalent |  |
| eye health education / phlebotomy | not equivalent | not equivalent |  |
| eye health education / postnatal care | not equivalent | not equivalent |  |
| eye health education / pregnancy check-ups | not equivalent | not equivalent |  |
| eye health education / prenatal care | not equivalent | not equivalent |  |
| eye health education / prescription review | not equivalent | not equivalent |  |
| eye health education / pulse oximetry | not equivalent | not equivalent |  |
| eye health education / record keeping | not equivalent | not equivalent |  |
| eye health education / snellen chart testing | not equivalent | not equivalent |  |
| eye health education / splinting and immobilisation | not equivalent | not equivalent |  |
| eye health education / stopping severe bleeding | not equivalent | not equivalent |  |
| eye health education / taking blood pressure | not equivalent | not equivalent |  |
| eye health education / translation/interpretation | not equivalent | not equivalent |  |
| eye health education / triage | not equivalent | not equivalent |  |
| eye health education / vaccination administration | not equivalent | not equivalent |  |
| eye health education / venipuncture | not equivalent | not equivalent |  |
| eye health education / wound and bleeding control | not equivalent | not equivalent |  |
| eye health education / wound care | not equivalent | not equivalent |  |
| eye health education / wound dressing | not equivalent | not equivalent |  |
| family planning counselling / finger-prick glucose test | not equivalent | not equivalent |  |
| family planning counselling / giving injections | not equivalent | not equivalent |  |
| family planning counselling / haemorrhage control | not equivalent | not equivalent |  |
| family planning counselling / health education | not equivalent | not equivalent |  |
| family planning counselling / infection control | not equivalent | not equivalent |  |
| family planning counselling / infection prevention and control | not equivalent | not equivalent |  |
| family planning counselling / injection administration | not equivalent | not equivalent |  |
| family planning counselling / intramuscular injections | not equivalent | not equivalent |  |
| family planning counselling / intraocular pressure measurement | not equivalent | not equivalent |  |
| family planning counselling / lactation support | not equivalent | not equivalent |  |
| family planning counselling / logistics and setup | not equivalent | not equivalent |  |
| family planning counselling / medication counselling | not equivalent | not equivalent |  |
| family planning counselling / medication dispensing | not equivalent | not equivalent |  |
| family planning counselling / patient counselling on medication | not equivalent | not equivalent |  |
| family planning counselling / patient registration | not equivalent | not equivalent |  |
| family planning counselling / phlebotomy | not equivalent | not equivalent |  |
| family planning counselling / postnatal care | not equivalent | not equivalent |  |
| family planning counselling / pregnancy check-ups | not equivalent | not equivalent |  |
| family planning counselling / prenatal care | not equivalent | not equivalent |  |
| family planning counselling / prescription review | not equivalent | not equivalent |  |
| family planning counselling / pulse oximetry | not equivalent | not equivalent |  |
| family planning counselling / record keeping | not equivalent | not equivalent |  |
| family planning counselling / snellen chart testing | not equivalent | not equivalent |  |
| family planning counselling / splinting and immobilisation | not equivalent | not equivalent |  |
| family planning counselling / stopping severe bleeding | not equivalent | not equivalent |  |
| family planning counselling / taking blood pressure | not equivalent | not equivalent |  |
| family planning counselling / teaching eye care | not equivalent | not equivalent |  |
| family planning counselling / translation/interpretation | not equivalent | not equivalent |  |
| family planning counselling / triage | not equivalent | not equivalent |  |
| family planning counselling / vaccination administration | not equivalent | not equivalent |  |
| family planning counselling / venipuncture | not equivalent | not equivalent |  |
| family planning counselling / visual acuity screening | not equivalent | not equivalent |  |
| family planning counselling / wound and bleeding control | not equivalent | not equivalent |  |
| family planning counselling / wound care | not equivalent | not equivalent |  |
| family planning counselling / wound dressing | not equivalent | not equivalent |  |
| finger-prick glucose test / infection control | not equivalent | not equivalent |  |
| finger-prick glucose test / injection administration | not equivalent | not equivalent |  |
| finger-prick glucose test / medication dispensing | not equivalent | not equivalent |  |
| finger-prick glucose test / patient counselling on medication | not equivalent | not equivalent |  |
| finger-prick glucose test / venipuncture | not equivalent | not equivalent |  |
| finger-prick glucose test / visual acuity screening | not equivalent | not equivalent |  |
| finger-prick glucose test / wound and bleeding control | not equivalent | not equivalent |  |
| finger-prick glucose test / wound dressing | not equivalent | not equivalent |  |
| giving injections / infection control | not equivalent | not equivalent |  |
| giving injections / medication dispensing | not equivalent | not equivalent |  |
| giving injections / patient counselling on medication | not equivalent | not equivalent |  |
| giving injections / venipuncture | not equivalent | not equivalent |  |
| giving injections / visual acuity screening | not equivalent | not equivalent |  |
| giving injections / wound and bleeding control | not equivalent | not equivalent |  |
| giving injections / wound dressing | not equivalent | not equivalent |  |
| haemorrhage control / infection control | not equivalent | not equivalent |  |
| haemorrhage control / injection administration | not equivalent | not equivalent |  |
| haemorrhage control / medication dispensing | not equivalent | not equivalent |  |
| haemorrhage control / patient counselling on medication | not equivalent | not equivalent |  |
| haemorrhage control / venipuncture | not equivalent | not equivalent |  |
| haemorrhage control / visual acuity screening | not equivalent | not equivalent |  |
| haemorrhage control / wound dressing | not equivalent | not equivalent |  |
| health education / infection control | not equivalent | not equivalent |  |
| health education / injection administration | not equivalent | not equivalent |  |
| health education / medication dispensing | not equivalent | not equivalent |  |
| health education / patient counselling on medication | not equivalent | not equivalent |  |
| health education / venipuncture | not equivalent | not equivalent |  |
| health education / visual acuity screening | not equivalent | not equivalent |  |
| health education / wound and bleeding control | not equivalent | not equivalent |  |
| health education / wound dressing | not equivalent | not equivalent |  |
| infection control / intraocular pressure measurement | not equivalent | not equivalent |  |
| infection control / lactation support | not equivalent | not equivalent |  |
| infection control / logistics and setup | not equivalent | not equivalent |  |
| infection control / medication counselling | not equivalent | not equivalent |  |
| infection control / medication dispensing | not equivalent | not equivalent |  |
| infection control / patient counselling on medication | not equivalent | not equivalent |  |
| infection control / patient registration | not equivalent | not equivalent |  |
| infection control / phlebotomy | not equivalent | not equivalent |  |
| infection control / postnatal care | not equivalent | not equivalent |  |
| infection control / pregnancy check-ups | not equivalent | not equivalent |  |
| infection control / prenatal care | not equivalent | not equivalent |  |
| infection control / prescription review | not equivalent | not equivalent |  |
| infection control / pulse oximetry | not equivalent | not equivalent |  |
| infection control / record keeping | not equivalent | not equivalent |  |
| infection control / snellen chart testing | not equivalent | not equivalent |  |
| infection control / splinting and immobilisation | not equivalent | not equivalent |  |
| infection control / stopping severe bleeding | not equivalent | not equivalent |  |
| infection control / taking blood pressure | not equivalent | not equivalent |  |
| infection control / teaching eye care | not equivalent | not equivalent |  |
| infection control / translation/interpretation | not equivalent | not equivalent |  |
| infection control / triage | not equivalent | not equivalent |  |
| infection control / vaccination administration | not equivalent | not equivalent |  |
| infection control / venipuncture | not equivalent | not equivalent |  |
| infection control / visual acuity screening | not equivalent | not equivalent |  |
| infection control / wound and bleeding control | not equivalent | not equivalent |  |
| infection control / wound care | not equivalent | not equivalent |  |
| infection prevention and control / injection administration | not equivalent | not equivalent |  |
| infection prevention and control / medication dispensing | not equivalent | not equivalent |  |
| infection prevention and control / patient counselling on medication | not equivalent | not equivalent |  |
| infection prevention and control / venipuncture | not equivalent | not equivalent |  |
| infection prevention and control / visual acuity screening | not equivalent | not equivalent |  |
| infection prevention and control / wound and bleeding control | not equivalent | not equivalent |  |
| infection prevention and control / wound dressing | not equivalent | not equivalent |  |
| injection administration / intraocular pressure measurement | not equivalent | not equivalent |  |
| injection administration / lactation support | not equivalent | not equivalent |  |
| injection administration / logistics and setup | not equivalent | not equivalent |  |
| injection administration / medication counselling | not equivalent | not equivalent |  |
| injection administration / medication dispensing | not equivalent | not equivalent |  |
| injection administration / patient counselling on medication | not equivalent | not equivalent |  |
| injection administration / patient registration | not equivalent | not equivalent |  |
| injection administration / phlebotomy | not equivalent | not equivalent |  |
| injection administration / postnatal care | not equivalent | not equivalent |  |
| injection administration / pregnancy check-ups | not equivalent | not equivalent |  |
| injection administration / prenatal care | not equivalent | not equivalent |  |
| injection administration / prescription review | not equivalent | not equivalent |  |
| injection administration / pulse oximetry | not equivalent | not equivalent |  |
| injection administration / record keeping | not equivalent | not equivalent |  |
| injection administration / snellen chart testing | not equivalent | not equivalent |  |
| injection administration / splinting and immobilisation | not equivalent | not equivalent |  |
| injection administration / stopping severe bleeding | not equivalent | not equivalent |  |
| injection administration / taking blood pressure | not equivalent | not equivalent |  |
| injection administration / teaching eye care | not equivalent | not equivalent |  |
| injection administration / translation/interpretation | not equivalent | not equivalent |  |
| injection administration / triage | not equivalent | not equivalent |  |
| injection administration / venipuncture | not equivalent | not equivalent |  |
| injection administration / visual acuity screening | not equivalent | not equivalent |  |
| injection administration / wound and bleeding control | not equivalent | not equivalent |  |
| injection administration / wound care | not equivalent | not equivalent |  |
| intramuscular injections / medication dispensing | not equivalent | not equivalent |  |
| intramuscular injections / patient counselling on medication | not equivalent | not equivalent |  |
| intramuscular injections / venipuncture | not equivalent | not equivalent |  |
| intramuscular injections / visual acuity screening | not equivalent | not equivalent |  |
| intramuscular injections / wound and bleeding control | not equivalent | not equivalent |  |
| intraocular pressure measurement / medication dispensing | not equivalent | not equivalent |  |
| intraocular pressure measurement / patient counselling on medication | not equivalent | not equivalent |  |
| intraocular pressure measurement / venipuncture | not equivalent | not equivalent |  |
| intraocular pressure measurement / visual acuity screening | not equivalent | not equivalent |  |
| intraocular pressure measurement / wound and bleeding control | not equivalent | not equivalent |  |
| intraocular pressure measurement / wound dressing | not equivalent | not equivalent |  |
| lactation support / medication dispensing | not equivalent | not equivalent |  |
| lactation support / patient counselling on medication | not equivalent | not equivalent |  |
| lactation support / venipuncture | not equivalent | not equivalent |  |
| lactation support / visual acuity screening | not equivalent | not equivalent |  |
| lactation support / wound and bleeding control | not equivalent | not equivalent |  |
| lactation support / wound dressing | not equivalent | not equivalent |  |
| logistics and setup / medication dispensing | not equivalent | not equivalent |  |
| logistics and setup / patient counselling on medication | not equivalent | not equivalent |  |
| logistics and setup / venipuncture | not equivalent | not equivalent |  |
| logistics and setup / visual acuity screening | not equivalent | not equivalent |  |
| logistics and setup / wound and bleeding control | not equivalent | not equivalent |  |
| logistics and setup / wound dressing | not equivalent | not equivalent |  |
| medication counselling / medication dispensing | not equivalent | not equivalent |  |
| medication counselling / venipuncture | not equivalent | not equivalent |  |
| medication counselling / visual acuity screening | not equivalent | not equivalent |  |
| medication counselling / wound and bleeding control | not equivalent | not equivalent |  |
| medication counselling / wound dressing | not equivalent | not equivalent |  |
| medication dispensing / patient registration | not equivalent | not equivalent |  |
| medication dispensing / phlebotomy | not equivalent | not equivalent |  |
| medication dispensing / postnatal care | not equivalent | not equivalent |  |
| medication dispensing / pregnancy check-ups | not equivalent | not equivalent |  |
| medication dispensing / prenatal care | not equivalent | not equivalent |  |
| medication dispensing / prescription review | not equivalent | not equivalent |  |
| medication dispensing / pulse oximetry | not equivalent | not equivalent |  |
| medication dispensing / record keeping | not equivalent | not equivalent |  |
| medication dispensing / snellen chart testing | not equivalent | not equivalent |  |
| medication dispensing / splinting and immobilisation | not equivalent | not equivalent |  |
| medication dispensing / stopping severe bleeding | not equivalent | not equivalent |  |
| medication dispensing / taking blood pressure | not equivalent | not equivalent |  |
| medication dispensing / teaching eye care | not equivalent | not equivalent |  |
| medication dispensing / translation/interpretation | not equivalent | not equivalent |  |
| medication dispensing / triage | not equivalent | not equivalent |  |
| medication dispensing / vaccination administration | not equivalent | not equivalent |  |
| medication dispensing / venipuncture | not equivalent | not equivalent |  |
| medication dispensing / visual acuity screening | not equivalent | not equivalent |  |
| medication dispensing / wound and bleeding control | not equivalent | not equivalent |  |
| medication dispensing / wound care | not equivalent | not equivalent |  |
| medication dispensing / wound dressing | not equivalent | not equivalent |  |
| patient counselling on medication / patient registration | not equivalent | not equivalent |  |
| patient counselling on medication / phlebotomy | not equivalent | not equivalent |  |
| patient counselling on medication / postnatal care | not equivalent | not equivalent |  |
| patient counselling on medication / pregnancy check-ups | not equivalent | not equivalent |  |
| patient counselling on medication / prenatal care | not equivalent | not equivalent |  |
| patient counselling on medication / prescription review | not equivalent | not equivalent |  |
| patient counselling on medication / pulse oximetry | not equivalent | not equivalent |  |
| patient counselling on medication / record keeping | not equivalent | not equivalent |  |
| patient counselling on medication / snellen chart testing | not equivalent | not equivalent |  |
| patient counselling on medication / splinting and immobilisation | not equivalent | not equivalent |  |
| patient counselling on medication / stopping severe bleeding | not equivalent | not equivalent |  |
| patient counselling on medication / taking blood pressure | not equivalent | not equivalent |  |
| patient counselling on medication / teaching eye care | not equivalent | not equivalent |  |
| patient counselling on medication / translation/interpretation | not equivalent | not equivalent |  |
| patient counselling on medication / triage | not equivalent | not equivalent |  |
| patient counselling on medication / vaccination administration | not equivalent | not equivalent |  |
| patient counselling on medication / venipuncture | not equivalent | not equivalent |  |
| patient counselling on medication / visual acuity screening | not equivalent | not equivalent |  |
| patient counselling on medication / wound and bleeding control | not equivalent | not equivalent |  |
| patient counselling on medication / wound care | not equivalent | not equivalent |  |
| patient counselling on medication / wound dressing | not equivalent | not equivalent |  |
| patient registration / venipuncture | not equivalent | not equivalent |  |
| patient registration / visual acuity screening | not equivalent | not equivalent |  |
| patient registration / wound and bleeding control | not equivalent | not equivalent |  |
| patient registration / wound dressing | not equivalent | not equivalent |  |
| phlebotomy / visual acuity screening | not equivalent | not equivalent |  |
| phlebotomy / wound and bleeding control | not equivalent | not equivalent |  |
| phlebotomy / wound dressing | not equivalent | not equivalent |  |
| postnatal care / venipuncture | not equivalent | not equivalent |  |
| postnatal care / visual acuity screening | not equivalent | not equivalent |  |
| postnatal care / wound and bleeding control | not equivalent | not equivalent |  |
| postnatal care / wound dressing | not equivalent | not equivalent |  |
| pregnancy check-ups / venipuncture | not equivalent | not equivalent |  |
| pregnancy check-ups / visual acuity screening | not equivalent | not equivalent |  |
| pregnancy check-ups / wound and bleeding control | not equivalent | not equivalent |  |
| pregnancy check-ups / wound dressing | not equivalent | not equivalent |  |
| prenatal care / venipuncture | not equivalent | not equivalent |  |
| prenatal care / visual acuity screening | not equivalent | not equivalent |  |
| prenatal care / wound and bleeding control | not equivalent | not equivalent |  |
| prenatal care / wound dressing | not equivalent | not equivalent |  |
| prescription review / venipuncture | not equivalent | not equivalent |  |
| prescription review / visual acuity screening | not equivalent | not equivalent |  |
| prescription review / wound and bleeding control | not equivalent | not equivalent |  |
| prescription review / wound dressing | not equivalent | not equivalent |  |
| pulse oximetry / venipuncture | not equivalent | not equivalent |  |
| pulse oximetry / visual acuity screening | not equivalent | not equivalent |  |
| pulse oximetry / wound and bleeding control | not equivalent | not equivalent |  |
| pulse oximetry / wound dressing | not equivalent | not equivalent |  |
| record keeping / venipuncture | not equivalent | not equivalent |  |
| record keeping / visual acuity screening | not equivalent | not equivalent |  |
| record keeping / wound and bleeding control | not equivalent | not equivalent |  |
| record keeping / wound dressing | not equivalent | not equivalent |  |
| snellen chart testing / venipuncture | not equivalent | not equivalent |  |
| snellen chart testing / wound and bleeding control | not equivalent | not equivalent |  |
| snellen chart testing / wound dressing | not equivalent | not equivalent |  |
| splinting and immobilisation / venipuncture | not equivalent | not equivalent |  |
| splinting and immobilisation / visual acuity screening | not equivalent | not equivalent |  |
| splinting and immobilisation / wound and bleeding control | not equivalent | not equivalent |  |
| stopping severe bleeding / venipuncture | not equivalent | not equivalent |  |
| stopping severe bleeding / visual acuity screening | not equivalent | not equivalent |  |
| stopping severe bleeding / wound dressing | not equivalent | not equivalent |  |
| taking blood pressure / venipuncture | not equivalent | not equivalent |  |
| taking blood pressure / visual acuity screening | not equivalent | not equivalent |  |
| taking blood pressure / wound and bleeding control | not equivalent | not equivalent |  |
| taking blood pressure / wound dressing | not equivalent | not equivalent |  |
| teaching eye care / venipuncture | not equivalent | not equivalent |  |
| teaching eye care / visual acuity screening | not equivalent | not equivalent |  |
| teaching eye care / wound and bleeding control | not equivalent | not equivalent |  |
| teaching eye care / wound dressing | not equivalent | not equivalent |  |
| translation/interpretation / venipuncture | not equivalent | not equivalent |  |
| translation/interpretation / visual acuity screening | not equivalent | not equivalent |  |
| translation/interpretation / wound and bleeding control | not equivalent | not equivalent |  |
| translation/interpretation / wound dressing | not equivalent | not equivalent |  |
| triage / venipuncture | not equivalent | not equivalent |  |
| triage / visual acuity screening | not equivalent | not equivalent |  |
| triage / wound dressing | not equivalent | not equivalent |  |
| vaccination administration / venipuncture | not equivalent | not equivalent |  |
| vaccination administration / visual acuity screening | not equivalent | not equivalent |  |
| vaccination administration / wound and bleeding control | not equivalent | not equivalent |  |
| vaccination administration / wound dressing | not equivalent | not equivalent |  |
| venipuncture / visual acuity screening | not equivalent | not equivalent |  |
| venipuncture / wound and bleeding control | not equivalent | not equivalent |  |
| venipuncture / wound care | not equivalent | not equivalent |  |
| venipuncture / wound dressing | not equivalent | not equivalent |  |
| visual acuity screening / wound and bleeding control | not equivalent | not equivalent |  |
| visual acuity screening / wound care | not equivalent | not equivalent |  |
| visual acuity screening / wound dressing | not equivalent | not equivalent |  |

**Agreement with the tags:** 907 of 912 pairs; 5 mistakes (4 judged equivalent wrongly, 1 judged not equivalent wrongly).

**Answers dropped by the engine's check** (missing, or the copied pair did not match what was asked): 0 of 912 pairs in readable responses.

**Pairs that needed a judgement but were never answered in either run:** 0 of 912. Final cache size: 912 rows.

## 1.6 Before and after the answer-format fix

The first real-key run (2026-09-25, model `gemini-3.5-flash-lite`) used the original answer format: one list of true/false values matched to the pairs by position. It found 24 wrong "equivalent" answers, 13 of them CPR against unrelated skills, consistent with answers drifting onto neighbouring pairs. The format was then changed so every answer names its pair (its number and both terms, copied back), and an answer is used only if all three match. No test pair was added to the prompt. The earlier run had no pacing and lost two calls to the free tier's per-minute limit; this run waits 15 seconds between requests.

| | Before the fix | After the fix |
|---|---|---|
| Pairs answered (cache rows) | 802 | 912 |
| Agree with the meaning tags | 778 (97.0%) | 907 (99.5%) |
| Wrongly "equivalent" | 24 | 4 |
| Wrongly "not equivalent" | 0 | 1 |
| Precision at 4, O1 (run B) | 1.00 | 1.00 |
| Precision at 3, O2 (run B) | 1.00 | 1.00 |
| Precision at 4, O3 (run B) | 1.00 | 1.00 |
| Precision at 3, O4 (run B) | 1.00 | 1.00 |
| Precision at 5, O5 (run B) | 1.00 | 1.00 |
| Precision at 3, O6 (run B) | 1.00 | 1.00 |

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

# 2. Forced failure (research question 3)

Run on 2026-09-25 by `scripts/evaluation/failure.eval.ts`. The real `/api/match` route (`score_applicants`, outreach O1, 72 applicants) was called first with no Gemini key, giving the Layer 1 baseline (HTTP 200, 72 results, layer2Applied = false, 61 ms). It was then called once per failure below, with a key set and the request to Google answered by a stand-in that fails in that way. The cache was empty each time, so every run had to ask Gemini. "Identical" compares every volunteer's position and match score with the baseline.

The first row is a control with no failure: it shows how many Gemini requests a normal run of this outreach makes (every pair is sent, in batches of up to 60 run in parallel) and that it reports layer2Applied = true. Its answers are all "not equivalent", so its ranking is also identical to Layer 1.

| Failure | How it was produced | Gemini requests attempted | Engine returned | Ranking complete | Identical to Layer 1 | layer2Applied | Request time (ms) |
|---|---|---|---|---|---|---|---|
| Control: no failure | every Gemini request answers correctly, every pair "not equivalent" | 6 | HTTP 200, 72 results | yes | yes | true | 47 |
| Network error | the request rejects with TypeError("fetch failed"), as when there is no connection | 6 | HTTP 200, 72 results | yes | yes | false | 28 |
| Timeout over 8000 ms | the request never answers; only the engine's own 8000 ms abort ends it | 6 | HTTP 200, 72 results | yes | yes | false | 8029 |
| HTTP 429 | Gemini answers 429 Too Many Requests (quota exhausted) | 6 | HTTP 200, 72 results | yes | yes | false | 11 |
| HTTP 500 | Gemini answers 500 Internal Server Error | 6 | HTTP 200, 72 results | yes | yes | false | 8 |
| Malformed JSON | HTTP 200, but the model's answer is not valid JSON | 6 | HTTP 200, 72 results | yes | yes | false | 23 |
| One of the batches fails (HTTP 500), the others answer | the first Gemini request answers 500; every other request answers correctly (every pair "not equivalent") | 6 | HTTP 200, 72 results | yes | yes | false | 13 |
| Answer list of the wrong length | HTTP 200 and valid JSON, but the answer for one pair is missing (all the others say "equivalent") | 6 | HTTP 200, 72 results | yes | NO | false | 16 |
| Answers attached to the wrong pairs | HTTP 200 and valid JSON, one answer per pair, every answer "equivalent", but each carries the terms of the next pair (shifted by one) | 6 | HTTP 200, 72 results | yes | yes | false | 27 |

**Why "Answer list of the wrong length" is not identical to Layer 1.** Since the answer-format fix, every answer names its pair and is checked, so one missing answer no longer discards the whole batch: the other answers, each proven to belong to its pair, are used, and only the missing pair falls back. The stand-in answered "equivalent" for all of them, so those volunteers scored higher; the ranking is still complete, and layer2Applied = false reports that the batch was incomplete. Under the original format (a bare list matched by position) a list one entry short was rejected entirely, because a shorter list cannot say which pair lost its answer.

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

## 4.0 Release v1.0.1 round (2026-09-25)

Reported by the owner on 2026-09-25 after installing release v1.0.1 from the GitHub download link. **Device: Samsung Galaxy A07, model SM-A075F/DS, Android 16**, with a large system font size.

| Journey | Result | Defect found | Status of the defect |
|---|---|---|---|
| Onboarding as an Allied Health Professional, with Gemini skill suggestions | Passed functionally: describing the work as a dietitian returned four suggestions including nutrition counselling and malnutrition screening | The skills screen's top section did not scroll, and the keyboard covered the Gemini box; the Gemini box sat between the search field and the skills it filters | Fixed in code the same day (one scrolling column: explainer, Gemini, required skills, search, skills; keyboard handling added). Needs a new build and a re-test |
| Registration and the six-digit code | **Passed, with a finding:** the code arrived, but in the Spam folder, so it looked as if it had not been sent. The account showed "Waiting for verification" in Supabase until the code was entered | The spam advice on the code screen was a small grey line and was missed; after the code, a new organisation went straight to the dashboard instead of its verification step, because the login screen's route to the code screen did not carry the role | Fixed in code: the spam line is now prominent (and added to password reset); the role is read from the confirmed account. Needs a new build and a re-test |
| Forgot password and its code | Passed: the code arrived | None | |
| Admin alert email | Passed: the admin received the email | None | |
| Credential review (admin reviews and accepts a volunteer's document) | Passed | None | |
| Create and publish an outreach | **Passed functionally, with defects** | The outreach could reach Preview with no profession and no skills chosen (the first role was pre-set to a support role for any profession, and support roles do not require skills); after publishing, the second button was "Stay here" on an empty form; a single-role outreach did not tell volunteers which profession it wanted | Fixed in code: profession and clinical or support must now be chosen; the buttons are "Open Manage Event" and "Go to Home"; the volunteer's outreach page shows "Who they need". Needs a new build and a re-test |
| Large system font | **Defect:** the login password placeholder and two organisation verification placeholders were cut off | A placeholder is a single line; long ones do not fit at a large font | Fixed in code: 12 long placeholders shortened across 8 screens, explanations moved to wrapping lines under the fields. Needs a re-test |
| An approval reaching the organisation or volunteer | **Defect:** the approved document still showed "waiting review" until the person signed out and in | The profile was read once at sign-in and never refreshed; screens did not refetch when the app returned to the front | Fixed in code: refresh on returning to the app and on any notification received. Needs a re-test |
| Offline behaviour (opening the app with no internet) | **Failed:** the app went to the welcome carousel | Opening the app offline signed the user out, because a failed profile load at launch was treated as a failed sign-in | Fixed in code the same day (the last loaded profile is kept in encrypted storage and used offline; with nothing saved, the offline screen is shown). Needs a new build and a re-test |

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
| Creating and publishing an outreach | 2026-09-21 and 2026-09-22 | Saving a draft navigated into Manage Event; publishing from the dashboard gave no confirmation | fix lists of 2026-09-21 and 2026-09-22 |
| Accepting applicants (single decision) | 2026-08-21 | Deciding an applicant sent an email but no push; the applicant card offered every action whatever the status; no confirmation after a decision | `docs/REPORT_NOTES.md`, "Device round 2 (2026-08-21)" |

## 4.3 Journeys with no recorded device test

These have unit or integration coverage in the code but no record of having been carried out on a phone. They are **not** reported as passed.

- The verification gate on a clinical role (an unverified volunteer refused a clinical Full Application)
- Accept top N
- Withdrawal that triggers waitlist promotion, with the promotion email and push
- Post-event review

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
