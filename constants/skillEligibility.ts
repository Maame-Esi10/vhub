import type { VolunteerCategory } from '@/types/database';
import { ALL_SKILLS, SKILL_CATEGORIES, type SkillCategory } from './skills';
import { MEDICAL_SPECIALTIES } from './specialties';

/*
  WHO MAY CLAIM WHICH SKILL (owner, 2026-09-25: "A first aider can't select
  skills like cardiologist" and "A VOL CAN'T SELECT 60 SKILLS. WHAT WILL BE
  USED TO EVALUATE THE MATCH").

  Before this file every volunteer could tick every skill and every specialty,
  whatever role they had declared. That matters because skills are the
  largest part of the match score (35 of 100 points) and the score is
  matched / REQUIRED: ticking everything could only ever raise a volunteer's
  score, never lower it, so the honest volunteer who ticked the five things
  they really do was outranked by anyone who ticked the whole list.

  THE RULE IS PER SKILL, NOT PER SKILL GROUP. Whole groups would be wrong in
  both directions: "Clinical Assessment" holds blood pressure measurement,
  which a trained first aider does at every screening day, next to physical
  examination, which they do not. Each skill therefore names the roles that
  can plausibly perform it at a community outreach in Ghana.

  THIS IS A CLAIM FILTER, NOT A CREDENTIAL CHECK. A nurse may still claim a
  nursing skill they are rusty at; what this stops is a role claiming work
  that role does not do at all. Verification (an admin reading the document
  against the declared role) is still what backs the claim.

  THE MATCHER IS UNTOUCHED. It reads `skill_tags` exactly as before; this only
  decides what can be put there.
*/

type Roles = readonly VolunteerCategory[];

/** Every role. Health education, logistics, crowd work: anybody can do it. */
const ANYONE: Roles = [
  'doctor',
  'nurse',
  'midwife',
  'pharmacist',
  'allied_health',
  'student',
  'first_aider',
  'other',
];
/** Every role with some health training. Excludes only `other`. */
const TRAINED: Roles = ['doctor', 'nurse', 'midwife', 'pharmacist', 'allied_health', 'student', 'first_aider'];
/**
 * Clinical and pharmacy roles plus students (who work under supervision at an
 * outreach). Point-of-care testing, counselling, medicines.
 */
const HEALTH_PROFESSIONAL: Roles = ['doctor', 'nurse', 'midwife', 'pharmacist', 'student'];
/**
 * Point-of-care and laboratory testing: the health professionals above plus
 * allied health (a lab scientist's core work). Kept apart from
 * HEALTH_PROFESSIONAL because that one also covers medicines, which allied
 * health does not handle.
 */
const TESTING: Roles = ['doctor', 'nurse', 'midwife', 'pharmacist', 'allied_health', 'student'];
/** Eye examination: examiners plus allied health (optometrists). */
const EYE_EXAMINER: Roles = ['doctor', 'nurse', 'allied_health', 'student'];
/** Hands-on clinical work on a patient's body. */
const CLINICAL: Roles = ['doctor', 'nurse', 'midwife', 'student'];
/** Clinical work a first aider is also trained for (emergencies, wounds, triage). */
const CLINICAL_AND_FIRST_AID: Roles = ['doctor', 'nurse', 'midwife', 'student', 'first_aider'];
/** Examination and screening outside maternity: doctors, nurses, students. */
const EXAMINER: Roles = ['doctor', 'nurse', 'student'];
/** Maternity care. */
const MATERNITY: Roles = ['doctor', 'nurse', 'midwife'];

export const SKILL_ELIGIBILITY: Readonly<Record<string, Roles>> = {
  // Clinical Assessment
  'Vital signs monitoring': TRAINED,
  'Blood pressure measurement': TRAINED,
  'Temperature measurement': TRAINED,
  'Pulse oximetry': TRAINED,
  'Blood glucose testing': TRAINED,
  'Physical examination': CLINICAL,
  Triage: CLINICAL_AND_FIRST_AID,
  'Patient history taking': TESTING,
  'Anthropometric measurement': ANYONE,
  // Dental therapists and hygienists are allied health.
  'Dental and oral health screening': ['doctor', 'nurse', 'allied_health', 'student'],
  'Oral health education': ANYONE,
  'Cholesterol and lipid testing': TESTING,

  // Screening & Early Detection
  'Clinical breast examination': CLINICAL,
  'Breast self-examination teaching': ANYONE,
  'Cervical screening (visual inspection with acetic acid)': MATERNITY,
  'HPV sample collection': MATERNITY,
  'Prostate specific antigen (PSA) testing': TESTING,
  'Hepatitis B screening': TESTING,
  'HIV counselling and testing': TESTING,
  'Malaria rapid diagnostic testing': TESTING,
  'Sickle cell screening': TESTING,
  'Typhoid testing': TESTING,
  'Skin condition screening': EXAMINER,
  'Referral and follow-up coordination': ANYONE,

  // Eye & Vision
  'Visual acuity screening': TRAINED,
  'Refraction and lens prescribing': EYE_EXAMINER,
  'Dispensing spectacles': TESTING,
  'Cataract screening': EYE_EXAMINER,
  'Pterygium screening': EYE_EXAMINER,
  'Intraocular pressure measurement': EYE_EXAMINER,
  'Eye health education': ANYONE,
  'Post-operative eye care': ['doctor', 'nurse'],

  // Nursing Procedures
  // Lab scientists draw blood as routine, so allied health is included.
  Venipuncture: ['doctor', 'nurse', 'midwife', 'allied_health', 'student'],
  'Wound dressing': CLINICAL_AND_FIRST_AID,
  'Injection administration': HEALTH_PROFESSIONAL,
  'Medication administration': HEALTH_PROFESSIONAL,
  'Infection control': TRAINED,
  'Vaccination administration': HEALTH_PROFESSIONAL,

  // Blood Donation
  'Donor registration': ANYONE,
  'Donor eligibility screening': HEALTH_PROFESSIONAL,
  'Donor counselling': HEALTH_PROFESSIONAL,
  'Haemoglobin testing': TESTING,
  'Phlebotomy for donation': ['doctor', 'nurse', 'midwife', 'allied_health', 'student'],
  'Post-donation care': TRAINED,

  // Pharmacy
  'Medication dispensing': ['pharmacist', 'doctor', 'nurse', 'student'],
  'Prescription review': ['pharmacist', 'doctor'],
  'Drug interaction screening': ['pharmacist', 'doctor'],
  'Patient counselling on medication': HEALTH_PROFESSIONAL,
  'Inventory management': ANYONE,
  'Dosage calculation': HEALTH_PROFESSIONAL,

  // Emergency & First Aid
  'Basic Life Support (BLS)': ANYONE,
  'Cardiopulmonary resuscitation (CPR)': ANYONE,
  'Wound and bleeding control': ANYONE,
  'Splinting and immobilisation': TRAINED,
  'Airway management': CLINICAL_AND_FIRST_AID,
  'Emergency triage': CLINICAL_AND_FIRST_AID,
  'Automated external defibrillator (AED) use': ANYONE,
  'Burns management': TRAINED,
  'Shock management': CLINICAL_AND_FIRST_AID,

  // Maternal & Child Health
  'Antenatal care': MATERNITY,
  'Postnatal care': MATERNITY,
  'Child growth monitoring': TRAINED,
  'Immunisation counselling': HEALTH_PROFESSIONAL,
  'Family planning counselling': HEALTH_PROFESSIONAL,
  'Breastfeeding support': CLINICAL,
  'Vitamin A supplementation': HEALTH_PROFESSIONAL,
  'Deworming administration': HEALTH_PROFESSIONAL,
  'Malnutrition screening (MUAC)': TRAINED,
  // Dietitians and nutritionists are allied health.
  'Nutrition counselling': ['doctor', 'nurse', 'midwife', 'allied_health', 'student'],

  // Mental Health & Wellbeing: community-level work, open to everyone.
  'Mental health awareness education': ANYONE,
  'Psychological first aid': ANYONE,
  'Active listening and support': ANYONE,
  'Stress and coping education': ANYONE,
  'Substance use awareness': ANYONE,
  'Referral to mental health services': ANYONE,

  // General Support: open to everyone by definition.
  'Patient registration': ANYONE,
  'Health education': ANYONE,
  'Crowd and queue management': ANYONE,
  'Translation/interpretation': ANYONE,
  'NHIS registration and renewal': ANYONE,
  'Data entry': ANYONE,
  'Logistics and setup': ANYONE,
  'Community mobilisation': ANYONE,
  'Record keeping': ANYONE,
  'Insecticide-treated net distribution': ANYONE,
  'Birth registration support': ANYONE,
};

/**
 * The most skills one volunteer can hold.
 *
 * WHY FIFTEEN. The largest role (a doctor) is eligible for almost all 86
 * skills, so without a ceiling the eligibility rule alone would not stop the
 * "tick everything" profile the owner reported. Fifteen is enough for a
 * genuinely broad clinician to list their core clinical work plus a few
 * support skills, while forcing everyone to choose the things they would
 * actually say out loud. Ten was considered and rejected as too tight for a
 * doctor who also screens and educates; twenty was rejected as still loose
 * enough to game.
 */
export const SKILL_LIMIT = 15;

/** The most specialties one volunteer can hold. A specialty is a real training path, not a list of interests. */
export const SPECIALTY_LIMIT = 3;

/**
 * Specialties are medical training paths (Cardiology, Surgery). Only roles that
 * train in one may claim one; a student, pharmacist, first aider or `other`
 * skips the step entirely. A midwife's scope covers only the maternal and
 * child specialties; allied health only the three its professions work in.
 */
const SPECIALTY_ELIGIBILITY: Partial<Record<VolunteerCategory, readonly string[]>> = {
  doctor: MEDICAL_SPECIALTIES,
  nurse: MEDICAL_SPECIALTIES,
  midwife: ['Obstetrics & Gynaecology', 'Pediatrics', 'Family Medicine'],
  // An optometrist, radiographer or physiotherapist works within one of these.
  allied_health: ['Ophthalmology', 'Radiology', 'Orthopaedics'],
};

/** True when a role may claim this skill. Unknown or retired skills are never claimable. */
export function canClaimSkill(category: VolunteerCategory | null | undefined, skill: string): boolean {
  if (!category) return false;
  return SKILL_ELIGIBILITY[skill]?.includes(category) ?? false;
}

/** The skill groups a role may pick from, with each group narrowed to its eligible skills. Empty groups are dropped. */
export function skillCategoriesFor(category: VolunteerCategory | null | undefined): SkillCategory[] {
  return SKILL_CATEGORIES.map((group) => ({
    ...group,
    skills: group.skills.filter((skill) => canClaimSkill(category, skill)),
  })).filter((group) => group.skills.length > 0);
}

/** Every skill a role may claim, flat. */
export function eligibleSkills(category: VolunteerCategory | null | undefined): string[] {
  return ALL_SKILLS.filter((skill) => canClaimSkill(category, skill));
}

/** The specialties a role may claim; empty when the role has no specialty step. */
export function eligibleSpecialties(category: VolunteerCategory | null | undefined): readonly string[] {
  if (!category) return [];
  return SPECIALTY_ELIGIBILITY[category] ?? [];
}

/** Whether this role sees the specialty step at all. */
export function hasSpecialtyStep(category: VolunteerCategory | null | undefined): boolean {
  return eligibleSpecialties(category).length > 0;
}

/** Keeps only the skills a role may claim, in their original order. */
export function pruneSkills(category: VolunteerCategory | null | undefined, skills: readonly string[]): string[] {
  return skills.filter((skill) => canClaimSkill(category, skill));
}

/** Keeps only the specialties a role may claim, in their original order. */
export function pruneSpecialties(
  category: VolunteerCategory | null | undefined,
  specialties: readonly string[]
): string[] {
  const allowed = eligibleSpecialties(category);
  return specialties.filter((specialty) => allowed.includes(specialty));
}
