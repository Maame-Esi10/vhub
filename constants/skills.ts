export interface SkillCategory {
  name: string;
  skills: string[];
}

export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    name: 'Clinical Assessment',
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
      'Visual acuity screening',
    ],
  },
  {
    name: 'Nursing Procedures',
    skills: [
      'Venipuncture',
      'Intravenous cannulation',
      'Wound dressing',
      'Injection administration',
      'Catheterisation',
      'Medication administration',
      'Infection control',
      'Patient positioning',
      'Vaccination administration',
      'Sterile technique',
    ],
  },
  {
    name: 'Pharmacy',
    skills: [
      'Medication dispensing',
      'Prescription review',
      'Drug interaction screening',
      'Patient counselling on medication',
      'Inventory management',
      'Dosage calculation',
      'Pharmacovigilance',
      'Compounding',
    ],
  },
  {
    name: 'Emergency & First Aid',
    skills: [
      'Basic Life Support (BLS)',
      'Cardiopulmonary resuscitation (CPR)',
      'Advanced Cardiac Life Support (ACLS)',
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
    skills: [
      'Patient registration',
      'Health education',
      'Crowd and queue management',
      'Translation/interpretation',
      'Data entry',
      'Logistics and setup',
      'Community mobilisation',
      'Record keeping',
    ],
  },
];

export const ALL_SKILLS = SKILL_CATEGORIES.flatMap((category) => category.skills);

export function getSkillCategory(skill: string): string | undefined {
  return SKILL_CATEGORIES.find((category) => category.skills.includes(skill))?.name;
}
