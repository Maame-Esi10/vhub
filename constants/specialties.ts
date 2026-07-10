// Medical specialty vocabulary for volunteer_profiles.specialties.
// Distinct from constants/skills.ts (granular clinical skills like
// "Venipuncture") — specialties are broader medical domains (e.g.
// "Cardiology") used to match volunteers to outreach specialisms.

export const MEDICAL_SPECIALTIES = [
  'Cardiology',
  'Dermatology',
  'Endocrinology',
  'Gastroenterology',
  'Neurology',
  'Oncology',
  'Pediatrics',
  'Psychiatry',
  'Radiology',
  'Surgery',
  'Urology',
  'Obstetrics & Gynaecology',
  'Emergency Medicine',
  'Family Medicine',
  'Internal Medicine',
  'Orthopaedics',
  'Ophthalmology',
  'Ear, Nose & Throat (ENT)',
  'Anaesthesiology',
] as const;

export type MedicalSpecialty = (typeof MEDICAL_SPECIALTIES)[number];
