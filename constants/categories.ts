export type VolunteerCategory =
  | 'nurse'
  | 'pharmacy_student'
  | 'first_aider'
  | 'doctor'
  | 'midwife'
  | 'other';

export const VOLUNTEER_CATEGORIES: { value: VolunteerCategory; label: string }[] = [
  { value: 'nurse', label: 'Nurse' },
  { value: 'pharmacy_student', label: 'Pharmacy Student' },
  { value: 'first_aider', label: 'First Aider' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'midwife', label: 'Midwife' },
  { value: 'other', label: 'Other' },
];

export type ExperienceLevel = 'beginner' | 'intermediate' | 'experienced';

export const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'experienced', label: 'Experienced' },
];

export type RoleType = 'clinical' | 'support';

export const ROLE_TYPES: { value: RoleType; label: string }[] = [
  { value: 'clinical', label: 'Clinical' },
  { value: 'support', label: 'Support' },
];

export type OutreachStatus = 'draft' | 'open' | 'closed' | 'completed';

export const OUTREACH_STATUSES: { value: OutreachStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'completed', label: 'Completed' },
];

export type ApplicationType = 'quick_join' | 'full';

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'waitlisted' | 'cancelled';

export const APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'cancelled', label: 'Cancelled' },
];
