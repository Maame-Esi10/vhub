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
    // The awareness ribbon, not a magnifier. `magnify-scan` was two ideas in
    // one glyph (a lens plus corner brackets) and lost both at 20pt, and worse,
    // it looked like the QR scanner this app already has for check-in. The
    // ribbon is the symbol Ghanaian breast and cervical campaigns actually use,
    // which is most of what this category holds.
    icon: 'ribbon',
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
    // A drop, not a bag. `blood-bag` draws a pouch with tubing, which collapses
    // into an indistinct blob at 20pt; a droplet is the shape blood donation is
    // recognised by everywhere and stays legible when small. Beside the words
    // "Blood Donation" it cannot be mistaken for water.
    icon: 'water',
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
    /*
      ADDED 2026-09-15, because the gap was found the hard way: an organisation
      creating a "Mental Health Awareness" outreach asked for suggestions and
      got none. Gemini was right -- there was nothing in this list to suggest.
      Every "counselling" entry was bound to some other clinical context (HIV,
      donors, medication, immunisation, family planning), so a mental health
      day had no vocabulary at all on a platform for community outreach in
      Ghana, where these campaigns are common and growing.

      Deliberately modest and non-clinical in tone: these are the things a
      community outreach volunteer actually does, not a psychiatric scope of
      practice. Diagnosis and treatment are not on this list and should not be.
    */
    name: 'Mental Health & Wellbeing',
    icon: 'head-heart-outline',
    skills: [
      'Mental health awareness education',
      'Psychological first aid',
      'Active listening and support',
      'Stress and coping education',
      'Substance use awareness',
      'Referral to mental health services',
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

/**
 * Skills that are habitually done by the same person at the same event.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT GEMINI (owner, 2026-09-15). A volunteer
 * who ticks three skills is not less capable than one who ticks twenty; they
 * are usually someone who read the list, recognised the three they would name
 * out loud, and stopped. The rest of what they actually do sits unticked
 * because nobody prompted them. That is a prompting problem, not a matching
 * problem, and prompting from a fixed table costs nothing, works offline,
 * spends no quota and cannot invent anything.
 *
 * Each group is a set of skills that genuinely travel together at a Ghanaian
 * outreach: if you are doing one, you are very often doing the others. They are
 * SUGGESTIONS SHOWN AT THE TOP OF THE PICKER, never applied and never implied.
 * Holding one has no effect whatsoever on any score.
 *
 * Keep groups small and honest. A group that lumps in everything adjacent
 * stops being a prompt and becomes noise, and the volunteer goes back to
 * ticking three.
 */
const SKILL_AFFINITIES: readonly (readonly string[])[] = [
  // The screening table: you rarely take one of these without the others.
  ['Vital signs monitoring', 'Blood pressure measurement', 'Temperature measurement', 'Pulse oximetry'],
  // Anyone running a diabetes or NCD station.
  ['Blood glucose testing', 'Blood pressure measurement', 'Anthropometric measurement'],
  // The front desk of any outreach, and the reason a "support" volunteer is
  // not an unskilled one.
  ['Patient registration', 'Data entry', 'Crowd and queue management', 'Record keeping'],
  // Whoever talks to the community tends to do all of it.
  ['Health education', 'Community mobilisation', 'Translation/interpretation'],
  // Needle work travels as a set.
  ['Venipuncture', 'Injection administration', 'Infection control', 'Sterile technique'],
  // Anyone handling medicines.
  ['Medication dispensing', 'Patient counselling on medication', 'Prescription review', 'Dosage calculation'],
  // The examination pair, and the registration that always precedes it.
  ['Physical examination', 'Patient history taking', 'Patient registration'],
  // Maternal and child work.
  ['Antenatal care', 'Postnatal care', 'Child growth monitoring', 'Immunisation counselling'],
  // A breast or cervical screening day.
  ['Clinical breast examination', 'Breast self-examination teaching', 'Referral and follow-up coordination'],
  // An eye clinic.
  ['Visual acuity screening', 'Eye health education', 'Dispensing spectacles'],
  // A blood drive.
  ['Donor registration', 'Donor eligibility screening', 'Haemoglobin testing', 'Post-donation care'],
  // First aid cover.
  ['Basic Life Support (BLS)', 'Cardiopulmonary resuscitation (CPR)', 'Wound and bleeding control', 'Emergency triage'],
];

/**
 * Skills commonly chosen alongside the ones already selected, minus those
 * already held.
 *
 * Only fires once something is selected: with nothing ticked there is nothing
 * to reason from, and offering a set of "popular" skills to somebody who has
 * chosen none is just a second, shorter list to ignore.
 *
 * Every returned value is checked against the live vocabulary, so a typo in
 * the table above is dropped rather than shown as a skill that cannot be
 * selected.
 */
export function companionSkills(selected: readonly string[], limit = 6): string[] {
  if (selected.length === 0) return [];

  const held = new Set(selected);
  const real = new Set(ALL_SKILLS);
  const out: string[] = [];

  for (const group of SKILL_AFFINITIES) {
    if (!group.some((skill) => held.has(skill))) continue;
    for (const skill of group) {
      if (held.has(skill) || !real.has(skill) || out.includes(skill)) continue;
      out.push(skill);
      if (out.length >= limit) return out;
    }
  }

  return out;
}
