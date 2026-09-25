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

_Not yet run: `01-layers.md` has not been produced._

# 2. Forced failure (research question 3)

_Not yet run: `02-failure.md` has not been produced._

# 3. V-Score simulation (research question 4)

_Not yet run: `03-vscore.md` has not been produced._

# 4. Functional testing

_Not yet run: `04-functional.md` has not been produced._

# 5. Performance

_Not yet run: `05-performance.md` has not been produced._

# 6. Test suite

_Not yet run: `06-jest.md` has not been produced._
