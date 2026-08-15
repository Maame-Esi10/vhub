import type { ExperienceLevel, OutreachRoleType, VolunteerCategory } from '@/types/database';
// From the module, not the '@/components/ui' barrel. This file is pure logic
// with no UI in it, and the barrel's first export pulls in React Native — which
// made the module unloadable in Jest, whose config here has no RN preset.
import { isTimeAfter, isTodayOrFutureDate, parseClockTime } from '@/components/ui/dateUtils';

/**
 * One role the outreach is asking for, as the form holds it.
 *
 * `category` is NULLABLE here and not null in the database, on purpose. "Any
 * volunteer, no particular profession" is a real requirement an organisation
 * has always been able to express (`outreaches.required_category = null`), and
 * collapsing the two staffing modes into one list must not quietly take it
 * away. A category-less role is therefore only representable as the SINGLE
 * role of an outreach, which is exactly the shape single-role storage holds —
 * see `toStoragePayload`. Any list of two or more roles requires a category on
 * every one, because those become `outreach_roles` rows.
 */
export interface RoleDraft {
  category: VolunteerCategory | null;
  roleType: OutreachRoleType;
  /** Null means any level. A FLOOR, not an exact match. */
  minExperienceLevel: ExperienceLevel | null;
  slotsTotal: number;
}

/**
 * Local Create/Edit form state.
 *
 * THERE IS ONE STAFFING FIELD, `roles`, AND NO MODE.
 *
 * This used to carry `requiredCategory` / `roleType` / `slotsTotal` alongside
 * `roles`, with an empty `roles` meaning "use the other three" — the database's
 * own single-role/multi-role distinction, surfaced to the organisation as a
 * toggle they had to understand and choose between. That was a storage detail
 * leaking into the interface. Needing one kind of volunteer is not a different
 * mode from needing three; it is the one-role case.
 *
 * The two storage shapes still exist and are untouched — nothing was
 * backfilled, no existing outreach moved, and no score changed. The mapping
 * between this list and whichever shape fits it lives in `toStoragePayload`,
 * in one place, so the form never has to think about it.
 */
export interface OutreachWizardState {
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  region: string | null;
  district: string | null;
  locationName: string;
  requiredSkills: string[];
  /** Always at least one. The organisation adds and removes entries; there is no mode. */
  roles: RoleDraft[];
  /**
   * Cloudinary URL of the flyer, or null. Uploaded as soon as it is picked
   * rather than held as a local file and sent on submit: the wizard has four
   * steps and an abandoned draft would otherwise leave the org waiting on an
   * upload at the very end. An orphaned Cloudinary asset from an abandoned
   * wizard is the accepted cost, and is cheap on the free tier.
   */
  flyerUrl: string | null;
}

/**
 * A blank form asks for five volunteers of no particular profession — the
 * commonest thing an outreach needs, and the shape that used to be the
 * "Any volunteers" default. Adding a category or a second role is now an edit
 * to this row rather than a switch into another mode.
 */
export const INITIAL_ROLE: RoleDraft = {
  category: null,
  roleType: 'support',
  minExperienceLevel: null,
  slotsTotal: 5,
};

export const INITIAL_WIZARD_STATE: OutreachWizardState = {
  title: '',
  description: '',
  date: '',
  startTime: '',
  endTime: '',
  region: null,
  district: null,
  locationName: '',
  requiredSkills: [],
  roles: [INITIAL_ROLE],
  flyerUrl: null,
};

export type WizardFieldError = Partial<
  Record<'title' | 'date' | 'startTime' | 'endTime' | 'roles', string>
>;

/** Validates the fields the spec calls out explicitly: title, date, time ordering, slots. */
export function validateWizard(state: OutreachWizardState): WizardFieldError {
  const errors: WizardFieldError = {};

  if (!state.title.trim()) {
    errors.title = 'Give this outreach a title.';
  }

  if (!state.date.trim()) {
    errors.date = 'Pick an event date.';
  } else if (!isTodayOrFutureDate(state.date)) {
    errors.date = 'Enter a valid date (YYYY-MM-DD) that is today or later.';
  }

  if (state.startTime && !parseClockTime(state.startTime)) {
    errors.startTime = 'Enter a valid 24-hour time (HH:MM).';
  }
  if (state.endTime && !parseClockTime(state.endTime)) {
    errors.endTime = 'Enter a valid 24-hour time (HH:MM).';
  }
  if (
    state.startTime &&
    state.endTime &&
    parseClockTime(state.startTime) &&
    parseClockTime(state.endTime) &&
    !isTimeAfter(state.startTime, state.endTime)
  ) {
    errors.endTime = 'End time must be after the start time.';
  }

  const roleError = validateRoles(state.roles);
  if (roleError) {
    errors.roles = roleError;
  }

  return errors;
}

/**
 * The staffing list, checked as a whole.
 *
 * The category rule is the one that carries real meaning: a single role may go
 * without one, because that maps to `required_category = null` on the outreach
 * itself and means "anyone". Two or more roles become `outreach_roles` rows,
 * where `category` is NOT NULL — so "anyone" stops being expressible the moment
 * a second role exists, and asking for it is a mistake rather than a preference.
 */
export function validateRoles(roles: readonly RoleDraft[]): string | null {
  if (roles.length === 0) {
    return 'Say how many volunteers you need.';
  }

  if (roles.some((role) => !Number.isInteger(role.slotsTotal) || role.slotsTotal < 1)) {
    return 'Every role needs at least 1 place.';
  }

  // A single role can carry an experience floor only as an outreach_roles row,
  // and that row needs a category. Without one there is nothing to attach the
  // floor to.
  if (roles.length === 1 && roles[0] && !roles[0].category && roles[0].minExperienceLevel) {
    return 'Choose a profession for this role, or set its experience back to any level.';
  }

  if (roles.length > 1 && roles.some((role) => !role.category)) {
    return 'Once there is more than one role, each one needs a profession.';
  }

  const seen = new Set<string>();
  for (const role of roles) {
    const key = `${role.category ?? 'any'}|${role.minExperienceLevel ?? 'any'}`;
    if (seen.has(key)) {
      return 'Two roles ask for the same profession at the same experience level. Combine them into one.';
    }
    seen.add(key);
  }

  return null;
}

export function hasWizardErrors(errors: WizardFieldError): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Validation for EDITING an outreach that already exists.
 *
 * Identical to `validateWizard` with one deliberate relaxation: a date in the
 * past is only an error if the organisation actually CHANGED it. Creating an
 * event in the past is meaningless, but an event that has already happened is
 * an ordinary thing to edit — fixing a typo in the title of last month's
 * clinic, or attaching the flyer to an outreach posted before flyers existed
 * (which is the case for every outreach on the platform predating that
 * feature). Refusing to save those because their own date is behind us would
 * make the whole screen useless for exactly the events that need it most.
 *
 * Rescheduling INTO the past is still refused, which is the rule that matters.
 */
export function validateOutreachEdit(
  state: OutreachWizardState,
  originalDate: string
): WizardFieldError {
  const errors = validateWizard(state);

  if (errors.date && state.date.trim() === originalDate) {
    delete errors.date;
  }

  return errors;
}

/**
 * Hydrates the form from the rows already in the database.
 *
 * Both storage shapes arrive as the SAME one list. An outreach with role rows
 * becomes those roles; an outreach without them becomes a single role built
 * from `required_category` / `role_type` / `slots_total`. The form never learns
 * which shape it came from, which is the entire point of the collapse — and it
 * means an existing single-role outreach can gain a second role by pressing
 * "Add another role", with the mapping on save doing the rest.
 */
export function wizardStateFromOutreach(
  outreach: {
    title: string;
    description: string | null;
    date: string;
    start_time: string | null;
    end_time: string | null;
    region: string | null;
    district: string | null;
    location_name: string | null;
    required_skills: string[] | null;
    required_category: string | null;
    role_type: OutreachRoleType | null;
    slots_total: number;
    flyer_url: string | null;
  },
  roles: {
    category: VolunteerCategory;
    role_type: OutreachRoleType;
    min_experience_level: ExperienceLevel | null;
    slots_total: number;
  }[]
): OutreachWizardState {
  return {
    title: outreach.title,
    description: outreach.description ?? '',
    date: outreach.date,
    // The pickers read and write 'HH:MM'; Postgres `time` comes back as
    // 'HH:MM:SS', and the extra seconds would fail parseClockTime on save.
    startTime: trimClockSeconds(outreach.start_time),
    endTime: trimClockSeconds(outreach.end_time),
    region: outreach.region,
    district: outreach.district,
    locationName: outreach.location_name ?? '',
    requiredSkills: outreach.required_skills ?? [],
    roles:
      roles.length > 0
        ? roles.map((role) => ({
            category: role.category,
            roleType: role.role_type,
            minExperienceLevel: role.min_experience_level,
            slotsTotal: role.slots_total,
          }))
        : [
            {
              // `required_category` is loosely typed as text on the outreach.
              // Anything outside the vocabulary is treated as "no category
              // chosen" rather than passed through to a chip that cannot
              // render it.
              category: asVolunteerCategory(outreach.required_category),
              // NOT NULL at the column since 20260815_role_type_resilience,
              // but old rows read through this path before that migration ran,
              // so the fallback stays. It fails CLOSED, matching the gate.
              roleType: outreach.role_type ?? 'clinical',
              // Single-role storage has nowhere to put an experience floor, so
              // there can never be one to read back.
              minExperienceLevel: null,
              slotsTotal: outreach.slots_total,
            },
          ],
    flyerUrl: outreach.flyer_url,
  };
}

const VOLUNTEER_CATEGORY_VALUES: readonly VolunteerCategory[] = [
  'doctor',
  'nurse',
  'midwife',
  'pharmacist',
  'student',
  'first_aider',
  'other',
];

function asVolunteerCategory(value: string | null): VolunteerCategory | null {
  if (!value) return null;
  return VOLUNTEER_CATEGORY_VALUES.includes(value as VolunteerCategory)
    ? (value as VolunteerCategory)
    : null;
}

/** What the form's one list becomes on the way to the database. */
export interface OutreachStoragePayload {
  requiredCategory: string | null;
  roleType: OutreachRoleType;
  slotsTotal: number;
  /**
   * The `outreach_roles` rows to write. EMPTY means single-role storage, where
   * the three fields above carry the requirement and no child rows exist —
   * the same "presence of rows and nothing else" rule the database uses.
   */
  roles: { category: VolunteerCategory; roleType: OutreachRoleType; minExperienceLevel: ExperienceLevel | null; slotsTotal: number }[];
}

/**
 * THE ONE PLACE THAT KNOWS THERE ARE TWO STORAGE SHAPES.
 *
 * A single role with no experience floor is written the way every outreach has
 * always been written: `required_category`, `role_type` and `slots_total` on
 * the outreach, and no child rows. Anything else — two roles, or one role with
 * a floor, neither of which single-role storage can express — is written as
 * `outreach_roles` rows, with the outreach's own columns derived by trigger.
 *
 * `roleType` is ALWAYS a real value, never null. It used to be sent as null in
 * multi-role mode on the understanding that the trigger would fill it in; when
 * the role write failed, the null stayed, and a null role_type is read as
 * "support" by every gate in the app — an outreach that quietly stopped
 * requiring verification. The client now sends the summary it can compute from
 * the roles it is about to write, and the trigger re-derives the authoritative
 * value immediately afterwards. Same answer, no window in which it is missing.
 */
export function toStoragePayload(state: OutreachWizardState): OutreachStoragePayload {
  const roles = state.roles;
  const only = roles.length === 1 ? roles[0] : undefined;

  if (only && !only.minExperienceLevel) {
    return {
      requiredCategory: only.category,
      roleType: only.roleType,
      slotsTotal: only.slotsTotal,
      roles: [],
    };
  }

  return {
    // No single answer once there are several, and the roles carry it instead.
    requiredCategory: null,
    // 'clinical' if ANY role is — the same summary the trigger computes.
    roleType: roles.some((role) => role.roleType === 'clinical') ? 'clinical' : 'support',
    slotsTotal: roles.reduce((sum, role) => sum + role.slotsTotal, 0),
    roles: roles
      .filter((role): role is RoleDraft & { category: VolunteerCategory } => role.category !== null)
      .map((role) => ({
        category: role.category,
        roleType: role.roleType,
        minExperienceLevel: role.minExperienceLevel,
        slotsTotal: role.slotsTotal,
      })),
  };
}

function trimClockSeconds(time: string | null): string {
  if (!time) return '';
  return time.slice(0, 5);
}

/** True when the role list differs from the one already stored, in any field. */
export function rolesChanged(before: RoleDraft[], after: RoleDraft[]): boolean {
  if (before.length !== after.length) return true;

  const key = (role: RoleDraft) =>
    `${role.category}|${role.roleType}|${role.minExperienceLevel ?? 'any'}|${role.slotsTotal}`;
  const beforeKeys = before.map(key).sort();
  const afterKeys = after.map(key).sort();

  return beforeKeys.some((value, index) => value !== afterKeys[index]);
}
