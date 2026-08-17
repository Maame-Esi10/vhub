export interface SkillCategory {
  name: string;
  /**
   * MaterialCommunityIcons glyph name for the category card.
   *
   * A plain string rather than an imported icon type, so this file stays pure
   * data with no React Native dependency: it is imported by the matching tests,
   * which run in a Jest config that has no RN preset.
   */
  icon: string;
  skills: string[];
}

/**
 * The skills vocabulary volunteers pick from and outreaches ask for.
 *
 * REWRITTEN 2026-08-19 against what Ghanaian medical outreaches actually run,
 * rather than a generic clinical list. The three additions below all describe
 * outreach types that are common here and were previously unrepresentable:
 *
 *   - Eye and vision. Uncorrected refractive error and cataract are the leading
 *     causes of severe visual impairment in Ghana and around 95% of people who
 *     need glasses do not have them, so eye camps are among the most heavily
 *     run outreach types in the country. The old list described one of them
 *     ("Visual acuity screening") and nothing else.
 *   - Screening and early detection. Clinical breast examination and visual
 *     inspection with acetic acid are the two techniques Ghana's cervical and
 *     breast programmes are built on, and nurses and midwives are the ones
 *     trained to perform them. Hepatitis B, HIV testing, malaria RDTs and PSA
 *     all appear on the Ministry of Health's own description of what its
 *     Community Health Screening Outreach Project offers.
 *   - Blood donation. The National Blood Service runs mobile sessions with
 *     schools, churches, workplaces and market groups, and treats donor
 *     counselling before, during and after donation as part of its duty of
 *     care, so it is real work a volunteer is asked to do.
 *
 * Sources are listed in docs/REPORT_NOTES.md.
 *
 * ORDERING IS DELIBERATE. The categories a volunteer is most likely to have
 * something in come first, because this list is scrolled on a phone.
 *
 * ADDING IS SAFE, REMOVING IS NOT. `volunteer_profiles.skill_tags` stores these
 * as plain strings, so deleting an entry here does not delete it from anyone's
 * saved profile: it simply stops being offered, and stops being renderable in
 * the picker. Check the database before removing anything.
 */
export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    name: 'Clinical Assessment',
    icon: 'stethoscope',
    skills: [
      'Vital signs monitoring',
      'Blood pressure measurement',
      'Temperature measurement',
      'Pulse oximetry',
      'Blood glucose testing',
      'Physical examination',
      'Triage',
      'Patient history taking',
      'Anthropometric measurement',
      'Dental and oral health screening',
      'Oral health education',
    ],
  },
  {
    name: 'Screening & Early Detection',
    icon: 'magnify-scan',
    skills: [
      'Clinical breast examination',
      'Breast self-examination teaching',
      'Cervical screening (visual inspection with acetic acid)',
      'HPV sample collection',
      'Prostate specific antigen (PSA) testing',
      'Hepatitis B screening',
      'HIV counselling and testing',
      'Malaria rapid diagnostic testing',
      'Sickle cell screening',
      'Referral and follow-up coordination',
    ],
  },
  {
    name: 'Eye & Vision',
    icon: 'eye-outline',
    skills: [
      'Visual acuity screening',
      'Refraction and lens prescribing',
      'Dispensing spectacles',
      'Cataract screening',
      'Pterygium screening',
      'Intraocular pressure measurement',
      'Eye health education',
      'Post-operative eye care',
    ],
  },
  {
    name: 'Nursing Procedures',
    icon: 'needle',
    skills: [
      'Venipuncture',
      'Intravenous cannulation',
      'Wound dressing',
      'Injection administration',
      'Medication administration',
      'Infection control',
      'Vaccination administration',
      'Sterile technique',
    ],
  },
  {
    name: 'Blood Donation',
    icon: 'blood-bag',
    skills: [
      'Donor registration',
      'Donor eligibility screening',
      'Donor counselling',
      'Haemoglobin testing',
      'Phlebotomy for donation',
      'Post-donation care',
    ],
  },
  {
    name: 'Pharmacy',
    icon: 'pill',
    skills: [
      'Medication dispensing',
      'Prescription review',
      'Drug interaction screening',
      'Patient counselling on medication',
      'Inventory management',
      'Dosage calculation',
    ],
  },
  {
    name: 'Emergency & First Aid',
    icon: 'medical-bag',
    skills: [
      'Basic Life Support (BLS)',
      'Cardiopulmonary resuscitation (CPR)',
      'Wound and bleeding control',
      'Splinting and immobilisation',
      'Airway management',
      'Emergency triage',
      'Automated external defibrillator (AED) use',
      'Burns management',
      'Shock management',
    ],
  },
  {
    name: 'Maternal & Child Health',
    icon: 'mother-nurse',
    skills: [
      'Antenatal care',
      'Postnatal care',
      'Normal delivery assistance',
      'Newborn resuscitation',
      'Child growth monitoring',
      'Immunisation counselling',
      'Family planning counselling',
      'Breastfeeding support',
    ],
  },
  {
    name: 'General Support',
    icon: 'hand-heart-outline',
    skills: [
      'Patient registration',
      'Health education',
      'Crowd and queue management',
      'Translation/interpretation',
      'NHIS registration and renewal',
      'Data entry',
      'Logistics and setup',
      'Community mobilisation',
      'Record keeping',
    ],
  },
];

/**
 * Skills that were offered once and no longer are.
 *
 * Kept as a list rather than deleted outright so the picker can still RENDER a
 * volunteer's existing selection: `skill_tags` holds plain strings, so someone
 * who saved "Catheterisation" still has it, and a picker that cannot draw it
 * would silently erase it the next time they edited their profile.
 *
 * These are hospital or pharmacy-department procedures rather than anything a
 * field outreach does. An outreach cannot ask for them any more, and nobody new
 * can add them.
 */
export const RETIRED_SKILLS: string[] = [
  'Catheterisation',
  'Patient positioning',
  'Compounding',
  'Pharmacovigilance',
  'Advanced Cardiac Life Support (ACLS)',
];

export const ALL_SKILLS = SKILL_CATEGORIES.flatMap((category) => category.skills);

export function getSkillCategory(skill: string): string | undefined {
  return SKILL_CATEGORIES.find((category) => category.skills.includes(skill))?.name;
}

/** True for a skill nobody can choose any more, but which someone may still hold. */
export function isRetiredSkill(skill: string): boolean {
  return RETIRED_SKILLS.includes(skill);
}

/**
 * The sections to show a volunteer, with any retired skills they still hold
 * appended in a section of their own.
 *
 * Without this the edit screen would list a volunteer's saved skills as chips,
 * fail to find the retired ones in any section, and drop them the moment
 * anything else was toggled. Showing them under a heading that says they are no
 * longer offered lets the volunteer keep them or clear them deliberately.
 */
export function skillSectionsFor(selected: readonly string[]): SkillCategory[] {
  const held = RETIRED_SKILLS.filter((skill) => selected.includes(skill));
  if (held.length === 0) return SKILL_CATEGORIES;
  return [...SKILL_CATEGORIES, { name: 'No longer offered', icon: 'archive-outline', skills: held }];
}
