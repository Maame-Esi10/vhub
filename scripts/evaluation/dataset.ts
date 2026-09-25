import { RELATED_CATEGORIES } from '@/constants/categories';
import type { VolunteerCategory } from '@/types/database';

/*
  THE LAYER COMPARISON TEST SET (research question 2).

  Six clinical outreaches, twelve volunteers designed around each (72 in
  total). Every volunteer is scored against every outreach.

  HELD CONSTANT so that only skills and category can move a ranking:
    - every outreach and every volunteer is in Greater Accra, Ayawaso East
      (location component 1.0 for everyone);
    - every outreach is one Saturday morning and every volunteer is free all
      Saturday (availability 1.0 for everyone);
    - every volunteer is 'experienced' (experience 1.0 for everyone);
    - every volunteer's V-Score is 70 (Active band, multiplier 1.00), so the
      ranking order is the match order.
  All outreaches are CLINICAL: a support outreach forces the skills component
  to 1.0 and would make the comparison meaningless.

  MEANING TAGS. Every skill wording used anywhere below is tagged with the
  practical skill it means (CONCEPT_OF). Two wordings are equivalent exactly
  when they carry the same tag. These tags are the evaluator's judgement,
  written before any scoring was run, and they are the ONLY input to:
    - the relevance list (a volunteer is relevant to an outreach when, for
      EVERY required skill, they hold a skill with the same meaning, AND their
      category is the required one or related to it in RELATED_CATEGORIES);
    - the gold answer each Gemini judgement is marked against.

  Two of the equivalent pairs used here (venipuncture / blood draw and wound
  dressing / wound care) appear verbatim as worked examples in Layer 2's own
  prompt (api/src/server/gemini.ts), so Gemini's answer on those two is not
  an independent test. The report says so beside them.
*/

export const OUTREACH_DATE = '2026-11-07'; // a Saturday
const REGION = 'Greater Accra';
const DISTRICT = 'Ayawaso East';

export const CONCEPT_OF: Record<string, string> = {
  // blood draw
  'venipuncture': 'blood-draw',
  'blood draw': 'blood-draw',
  'phlebotomy': 'blood-draw',
  'drawing blood samples': 'blood-draw',
  // glucose
  'blood glucose testing': 'glucose',
  'blood sugar testing': 'glucose',
  'finger-prick glucose test': 'glucose',
  'glucometer checks': 'glucose',
  // blood pressure
  'blood pressure measurement': 'bp',
  'taking blood pressure': 'bp',
  'bp checks': 'bp',
  // wound dressing
  'wound dressing': 'wound-dressing',
  'wound care': 'wound-dressing',
  'dressing wounds': 'wound-dressing',
  // infection control
  'infection control': 'ipc',
  'infection prevention and control': 'ipc',
  // injections
  'injection administration': 'injection',
  'giving injections': 'injection',
  'intramuscular injections': 'injection',
  // visual acuity
  'visual acuity screening': 'acuity',
  'snellen chart testing': 'acuity',
  'eye chart vision testing': 'acuity',
  // cataract
  'cataract screening': 'cataract',
  'checking for cataracts': 'cataract',
  // eye education
  'eye health education': 'eye-education',
  'teaching eye care': 'eye-education',
  // antenatal
  'antenatal care': 'antenatal',
  'prenatal care': 'antenatal',
  'pregnancy check-ups': 'antenatal',
  // family planning
  'family planning counselling': 'family-planning',
  'contraception counselling': 'family-planning',
  // breastfeeding
  'breastfeeding support': 'breastfeeding',
  'lactation support': 'breastfeeding',
  // CPR
  'cardiopulmonary resuscitation (cpr)': 'cpr',
  'chest compressions': 'cpr',
  'cpr': 'cpr',
  // bleeding control
  'wound and bleeding control': 'bleeding',
  'haemorrhage control': 'bleeding',
  'stopping severe bleeding': 'bleeding',
  // triage
  'emergency triage': 'triage',
  'triage': 'triage',
  'casualty sorting': 'triage',
  // dispensing
  'medication dispensing': 'dispensing',
  'dispensing medicines': 'dispensing',
  // medication counselling
  'patient counselling on medication': 'med-counselling',
  'medication counselling': 'med-counselling',
  'explaining how to take medicines': 'med-counselling',
  // dosage
  'dosage calculation': 'dosage',
  'calculating drug doses': 'dosage',
  // NEAR MISSES: related to a required skill but a different skill
  'vaccination administration': 'vaccination',
  'postnatal care': 'postnatal',
  'prescription review': 'prescription-review',
  'intraocular pressure measurement': 'iop',
  'pulse oximetry': 'pulse-ox',
  'splinting and immobilisation': 'splinting',
  'burns management': 'burns',
  // UNRELATED
  'data entry': 'data-entry',
  'crowd and queue management': 'crowd',
  'logistics and setup': 'logistics',
  'translation/interpretation': 'translation',
  'community mobilisation': 'mobilisation',
  'record keeping': 'records',
  'health education': 'health-education',
  'patient registration': 'registration',
};

export interface EvalOutreach {
  id: string;
  title: string;
  category: VolunteerCategory;
  required_skills: string[];
  slots_total: number;
}

/** The route validates outreach ids as UUIDs; each test outreach has a fixed one. */
export function outreachUuid(id: string): string {
  return `00000000-0000-4000-8000-0000000000${id.replace('O', '').padStart(2, '0')}`;
}

export const OUTREACHES: EvalOutreach[] = [
  { id: 'O1', title: 'Blood screening day', category: 'nurse', slots_total: 4,
    required_skills: ['Venipuncture', 'Blood glucose testing', 'Blood pressure measurement'] },
  { id: 'O2', title: 'Wound care clinic', category: 'nurse', slots_total: 3,
    required_skills: ['Wound dressing', 'Infection control', 'Injection administration'] },
  { id: 'O3', title: 'Eye screening camp', category: 'allied_health', slots_total: 4,
    required_skills: ['Visual acuity screening', 'Cataract screening', 'Eye health education'] },
  { id: 'O4', title: 'Maternal health outreach', category: 'midwife', slots_total: 3,
    required_skills: ['Antenatal care', 'Family planning counselling', 'Breastfeeding support'] },
  { id: 'O5', title: 'Emergency first aid cover', category: 'first_aider', slots_total: 5,
    required_skills: ['Cardiopulmonary resuscitation (CPR)', 'Wound and bleeding control', 'Emergency triage'] },
  { id: 'O6', title: 'Community pharmacy day', category: 'pharmacist', slots_total: 3,
    required_skills: ['Medication dispensing', 'Patient counselling on medication', 'Dosage calculation'] },
];

export interface EvalVolunteer {
  id: string;
  /** What the volunteer was designed to test, for the report. */
  label: string;
  designedFor: string;
  category: VolunteerCategory;
  skill_tags: string[];
}

/*
  Twelve per outreach, in six kinds:
    exact x3        all required skills, identical wording, matching category
    reworded x3     all required skills by meaning; some or all worded differently
    partial x2      only some of the required skills (by meaning)
    unrelated x2    none of the required skills
    wrong-role x1   all required skills, identical wording, unrelated category
    near-miss x1    related-sounding but different skills
*/
function pool(
  o: string,
  roles: { match: VolunteerCategory; related: VolunteerCategory; wrong: VolunteerCategory },
  req: [string, string, string],
  alt: [[string, string], [string, string], [string, string]],
  nearMiss: string[]
): EvalVolunteer[] {
  const [a, b, c] = req;
  const [altA, altB, altC] = alt;
  const v = (n: number, label: string, category: VolunteerCategory, skill_tags: string[]): EvalVolunteer => ({
    id: `${o}-V${String(n).padStart(2, '0')}`,
    label,
    designedFor: o,
    category,
    skill_tags,
  });
  return [
    v(1, 'exact', roles.match, [a, b, c]),
    v(2, 'exact', roles.match, [a, b, c, 'Health education']),
    v(3, 'exact, related role', roles.related, [a, b, c]),
    v(4, 'reworded: all three', roles.match, [altA[0], altB[0], altC[0]]),
    v(5, 'reworded: two of three', roles.match, [altA[1], altB[1], c]),
    v(6, 'reworded: one of three', roles.related, [a, b, altC[1]]),
    v(7, 'partial: two of three', roles.match, [a, b, 'Record keeping']),
    v(8, 'partial: one, reworded', roles.match, [altA[0], 'Data entry']),
    v(9, 'unrelated', roles.match, ['Crowd and queue management', 'Logistics and setup']),
    v(10, 'unrelated', roles.related, ['Translation/interpretation', 'Community mobilisation', 'Patient registration']),
    v(11, 'wrong role, exact skills', roles.wrong, [a, b, c]),
    v(12, 'near miss', roles.match, nearMiss),
  ];
}

export const VOLUNTEERS: EvalVolunteer[] = [
  ...pool('O1', { match: 'nurse', related: 'student', wrong: 'first_aider' },
    ['Venipuncture', 'Blood glucose testing', 'Blood pressure measurement'],
    [['blood draw', 'phlebotomy'], ['blood sugar testing', 'finger-prick glucose test'], ['taking blood pressure', 'BP checks']],
    ['Injection administration', 'Pulse oximetry', 'Vaccination administration']),
  ...pool('O2', { match: 'nurse', related: 'doctor', wrong: 'other' },
    ['Wound dressing', 'Infection control', 'Injection administration'],
    [['wound care', 'dressing wounds'], ['infection prevention and control', 'infection prevention and control'], ['giving injections', 'intramuscular injections']],
    ['Wound and bleeding control', 'Burns management', 'Vaccination administration']),
  ...pool('O3', { match: 'allied_health', related: 'student', wrong: 'pharmacist' },
    ['Visual acuity screening', 'Cataract screening', 'Eye health education'],
    [['Snellen chart testing', 'eye chart vision testing'], ['checking for cataracts', 'checking for cataracts'], ['teaching eye care', 'teaching eye care']],
    ['Intraocular pressure measurement', 'Health education', 'Pulse oximetry']),
  ...pool('O4', { match: 'midwife', related: 'nurse', wrong: 'first_aider' },
    ['Antenatal care', 'Family planning counselling', 'Breastfeeding support'],
    [['prenatal care', 'pregnancy check-ups'], ['contraception counselling', 'contraception counselling'], ['lactation support', 'lactation support']],
    ['Postnatal care', 'Vaccination administration', 'Health education']),
  ...pool('O5', { match: 'first_aider', related: 'first_aider', wrong: 'pharmacist' },
    ['Cardiopulmonary resuscitation (CPR)', 'Wound and bleeding control', 'Emergency triage'],
    [['chest compressions', 'CPR'], ['haemorrhage control', 'stopping severe bleeding'], ['casualty sorting', 'triage']],
    ['Splinting and immobilisation', 'Burns management', 'Wound dressing']),
  ...pool('O6', { match: 'pharmacist', related: 'student', wrong: 'first_aider' },
    ['Medication dispensing', 'Patient counselling on medication', 'Dosage calculation'],
    [['dispensing medicines', 'dispensing medicines'], ['medication counselling', 'explaining how to take medicines'], ['calculating drug doses', 'calculating drug doses']],
    ['Prescription review', 'Health education', 'Record keeping']),
];

const norm = (s: string) => s.trim().toLowerCase();

export function conceptOf(skill: string): string {
  const concept = CONCEPT_OF[norm(skill)];
  if (!concept) throw new Error(`No meaning tag for skill "${skill}"`);
  return concept;
}

/** Gold answer for one Gemini judgement: same meaning tag. */
export function goldEquivalent(a: string, b: string): boolean {
  return conceptOf(a) === conceptOf(b);
}

export function categoryFits(required: VolunteerCategory, volunteer: VolunteerCategory): boolean {
  return required === volunteer || RELATED_CATEGORIES[required].includes(volunteer);
}

/** The relevance rule, applied to the meaning tags. See the header. */
export function isRelevant(o: EvalOutreach, v: EvalVolunteer): boolean {
  const held = new Set(v.skill_tags.map(conceptOf));
  return o.required_skills.every((s) => held.has(conceptOf(s))) && categoryFits(o.category, v.category);
}

/** Rows for the fake database: every volunteer applies to every outreach. */
export function databaseRows() {
  const organisationId = 'ORG';
  return {
    outreaches: OUTREACHES.map((o) => ({
      id: outreachUuid(o.id),
      organisation_id: organisationId,
      title: o.title,
      required_skills: o.required_skills,
      required_category: o.category,
      role_type: 'clinical',
      region: REGION,
      district: DISTRICT,
      date: OUTREACH_DATE,
      start_time: '09:00',
      end_time: '12:00',
      slots_total: o.slots_total,
      slots_filled: 0,
      status: 'open',
    })),
    outreach_days: OUTREACHES.map((o) => ({
      id: `${o.id}-D1`,
      outreach_id: outreachUuid(o.id),
      day: OUTREACH_DATE,
      start_time: null,
      end_time: null,
    })),
    outreach_roles: [],
    profiles: VOLUNTEERS.map((v) => ({ id: v.id, role: 'volunteer', region: REGION, district: DISTRICT })),
    volunteer_profiles: VOLUNTEERS.map((v) => ({
      id: v.id,
      category: v.category,
      skill_tags: v.skill_tags,
      experience_level: 'experienced',
      availability_slots: ['sat_morning', 'sat_afternoon', 'sat_evening'],
      v_score: 70,
    })),
    applications: OUTREACHES.flatMap((o) =>
      VOLUNTEERS.map((v) => ({
        id: `${o.id}:${v.id}`,
        outreach_id: outreachUuid(o.id),
        volunteer_id: v.id,
        status: 'pending',
        outreach_role_id: null,
        match_score: null,
      }))
    ),
    skill_match_cache: [],
  };
}
