import type { VolunteerCategory } from '@/types/database';

/**
 * What each kind of volunteer should send, and what everybody must get right.
 *
 * ONE SOURCE for this copy, imported by the guidelines screen and by the
 * consent block on the upload screen, so the two can never drift into telling
 * a volunteer different things about the same document.
 *
 * NO REAL OR SAMPLE CREDENTIAL IMAGES, anywhere, ever. The brief says so and it
 * is right: a sample licence is either somebody's real one, or a forgery
 * template with our name on it. The illustrations are generic icons.
 *
 * The named bodies are the Ghanaian ones a volunteer will actually hold a
 * document from. They are examples rather than a closed list — "or equivalent"
 * is in each one deliberately, because a Ghanaian-trained volunteer working
 * abroad, or one registered before a council was reorganised, holds something
 * that does not match the current name and is not thereby a fraud.
 */

export interface CredentialGuideline {
  /** Generic icon. Never an image of a document. */
  icon: 'stethoscope' | 'medical-bag' | 'baby-face-outline' | 'pill' | 'school-outline' | 'bandage' | 'file-account-outline';
  /** What to send. */
  what: string;
  /** What makes it acceptable, in one sentence. */
  accepted: string;
}

export const CREDENTIAL_GUIDELINES: Record<VolunteerCategory, CredentialGuideline> = {
  doctor: {
    icon: 'stethoscope',
    what: 'Your Medical and Dental Council registration certificate, or your current practising certificate.',
    accepted:
      'It must show your full name, your registration number and a date that has not passed — or the equivalent document from wherever you are registered.',
  },
  nurse: {
    icon: 'medical-bag',
    what: 'Your Nursing and Midwifery Council registration certificate, or your PIN card.',
    accepted:
      'Your full name and registration number must be readable, and the registration must be current — or the equivalent from wherever you are registered.',
  },
  midwife: {
    icon: 'baby-face-outline',
    what: 'Your Nursing and Midwifery Council midwifery registration, or your PIN card.',
    accepted:
      'Your full name and registration number must be readable, and the registration must be current — or the equivalent from wherever you are registered.',
  },
  pharmacist: {
    icon: 'pill',
    what: 'Your Pharmacy Council registration certificate or current licence to practise.',
    accepted:
      'Your full name and registration number must be readable, and it must not have expired — or the equivalent from wherever you are registered.',
  },
  student: {
    icon: 'school-outline',
    what: 'Your student identity card, or a letter from your school confirming you are enrolled.',
    accepted:
      'It must name you, name the school and the programme, and show that you are enrolled now — a card from a year you have finished is not enough on its own.',
  },
  first_aider: {
    icon: 'bandage',
    what: 'Your first-aid certificate — Red Cross, St John Ambulance, or the training your employer put you through.',
    accepted:
      'It must name you and the body that trained you, and it must still be within its validity period if it has one.',
  },
  other: {
    icon: 'file-account-outline',
    what: 'Whatever document supports the role you described in your profile.',
    accepted:
      'It must name you and show clearly what you are qualified or authorised to do. If you are unsure, send the strongest thing you have and say what it is.',
  },
};

/** The rules that apply to every document, whoever is sending it. */
export const CREDENTIAL_GENERAL_RULES: { icon: string; text: string }[] = [
  {
    icon: 'format-text',
    text: 'Every word must be readable. If you cannot read it on your own screen, neither can we.',
  },
  {
    icon: 'account-outline',
    text: 'Your full name has to be visible, and it has to be the name on your V-HUB profile.',
  },
  {
    icon: 'calendar-clock',
    text: 'It must not have expired. An out-of-date certificate is refused even when everything else is right.',
  },
  {
    icon: 'crop-free',
    text: 'Photograph the whole page, flat and square on. Corners cut off are the most common reason a document is sent back.',
  },
  {
    icon: 'file-outline',
    text: 'A photo (JPG, PNG or HEIC) or a PDF. Nothing else.',
  },
];

/** The consent text. Shown at the point of upload, never buried in terms. */
export const CREDENTIAL_CONSENT_POINTS: string[] = [
  'The document you upload is stored privately. It is not part of your public profile and no volunteer or visitor can reach it.',
  'A V-HUB administrator opens it to check that it is genuine, and an organisation can open it only if you have applied to one of its outreaches.',
  'It is used to verify who you are and nothing else — never for advertising, never sold, never shared with anyone outside V-HUB.',
  'You can replace it or withdraw it yourself at any time before you are verified, and withdrawing it deletes the file.',
];

/** The organisation's version. Same shape, different reader. */
export const ORGANISATION_CONSENT_POINTS: string[] = [
  'Your documents are stored privately. They are not shown on your public profile and volunteers cannot reach them.',
  'Only a V-HUB administrator opens them, and only to decide whether to verify your organisation.',
  'They are used for that decision and nothing else — never for advertising, never sold, never shared outside V-HUB.',
  'What volunteers see is the outcome: a verified badge, or nothing.',
];
