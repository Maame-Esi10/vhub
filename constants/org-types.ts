export type OrgType =
  | 'ngo'
  | 'hospital_clinic'
  | 'academic_institution'
  | 'government_health_agency'
  | 'community_based_organisation'
  | 'other';

export const ORG_TYPES: { value: OrgType; label: string }[] = [
  { value: 'ngo', label: 'NGO' },
  { value: 'hospital_clinic', label: 'Hospital / Clinic' },
  { value: 'academic_institution', label: 'Academic Institution' },
  { value: 'government_health_agency', label: 'Government Health Agency' },
  { value: 'community_based_organisation', label: 'Community-Based Organisation' },
  { value: 'other', label: 'Other' },
];
