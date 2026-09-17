import type { ExperienceLevel, OutreachRoleType, VolunteerCategory } from '@/types/database';
// From the module, not the '@/components/ui' barrel. This file is pure logic
// with no UI in it, and the barrel's first export pulls in React Native — which
// made the module unloadable in Jest, whose config here has no RN preset.
import { isTimeAfter, parseClockTime } from '@/components/ui/dateUtils';
import {
  dayDraftsFromRows,
  dayStringsOf,
  sortDayStrings,
  validateDays,
  type OutreachDayDraft,
} from '@/lib/outreachDays';

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
  /**
   * Every day the outreach runs on, `YYYY-MM-DD`, chronological.
   *
   * ONE FIELD, NO MODE — the same lesson as `roles` above. This replaced a
   * single `date`, with an empty list meaning nothing and a one-entry list
   * meaning an ordinary one-day event. There is no "is this multi-day" switch
   * for the organisation to understand, because running a clinic on three days
   * is not a different kind of event from running it on one; it is the n=3
   * case.
   *
   * `outreaches.date` is the FIRST of these, and the database keeps it in step
   * by trigger — which is why the feed's date bound, the reminder window, the
   * under-subscription stages and the lifecycle close all still work untouched.
   * The form never writes that column's value itself beyond sending the first
   * day; see `firstDay`.
   *
   * Each entry carries its OWN hours as well as its date, null meaning "the
   * same hours as the event" exactly as `outreach_days.start_time` does. They
   * live on the day rather than in a map beside the list for the reason stated
   * on `OutreachDayDraft`: two structures that must agree eventually will not,
   * and here the failure would be a removed day's hours quietly re-attaching
   * themselves to a different day added later.
   */
  days: OutreachDayDraft[];
  startTime: string;
  endTime: string;
  region: string | null;
  district: string | null;
  locationName: string;
  /**
   * The venue photo and pin. Both optional and deliberately unvalidated: an
   * organisation filling the form from another region cannot capture a
   * position, and a required field here would be answered with a guess -- a
   * guessed coordinate sends people to the wrong place with confidence.
   */
  locationImageUrl: string | null;
  locationLat: number | null;
  locationLng: number | null;
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
  /**
   * Gallery image URLs, already uploaded to Cloudinary, in display order.
   *
   * SEPARATE FROM `flyerUrl` AND WITH NO RELATIONSHIP TO IT. The flyer is the
   * one banner that heads the card and the detail hero; these are the event's
   * poster and photographs. Neither substitutes for the other and neither is a
   * fallback for the other.
   *
   * Held here rather than written as they are picked because the outreach row
   * does not exist yet during creation — the rows are inserted after it does,
   * the same way the roles are. In the EDITOR the outreach already exists, so
   * this field is unused and gallery changes are written immediately.
   */
  galleryUrls: string[];
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
  days: [],
  startTime: '',
  endTime: '',
  region: null,
  district: null,
  locationName: '',
  locationImageUrl: null,
  locationLat: null,
  locationLng: null,
  requiredSkills: [],
  roles: [INITIAL_ROLE],
  flyerUrl: null,
  galleryUrls: [],
};

export type WizardFieldError = Partial<
  Record<
    | 'title'
    | 'description'
    | 'region'
    | 'district'
    | 'locationName'
    | 'date'
    | 'startTime'
    | 'endTime'
    | 'roles'
    | 'requiredSkills',
    string
  >
>;

/**
 * The FIRST day the outreach runs on — what `outreaches.date` holds, and what
 * every existing date-based query still reads.
 *
 * Empty string when no day has been picked yet, which only happens on a form
 * that has not been validated. Sorting here rather than trusting insertion
 * order means the first day is the earliest one however the organisation added
 * them.
 */
export function firstDay(state: OutreachWizardState): string {
  return dayStringsOf(state.days)[0] ?? '';
}

/** Validates the fields the spec calls out explicitly: title, days, time ordering, slots. */
export function validateWizard(state: OutreachWizardState): WizardFieldError {
  const errors: WizardFieldError = {};

  if (!state.title.trim()) {
    errors.title = 'Give this outreach a title.';
  }

  // One rule for the whole day list rather than one for a scalar date: an
  // outreach with no days, a duplicate day or a day in the past are all the
  // same class of mistake and are named by `validateDays`.
  const dayError = validateDays(dayStringsOf(state.days), { requireFuture: true });
  if (dayError) {
    errors.date = dayError;
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

  /*
    WHAT "REQUIRED" MEANS HERE, since the database enforces almost none of it.

    Only title, date and slots_total are NOT NULL on `outreaches`. Everything
    below is required because the APP breaks without it, not because Postgres
    says so, and each one earns its place:

      description   what a volunteer reads to decide. Nothing else on the card
                    explains what the day actually involves.
      region        20 of the 100 match points AND the feed pre-filter, which
                    selects candidates by region and its neighbours. An
                    outreach with no region cannot appear in a ranked feed at
                    all — it is not merely scored badly, it is invisible.
      district      the difference between a 1.0 and a 0.5 location score. A
                    volunteer on the same street would score as merely
                    same-region.
      locationName  a volunteer has to know where to go, and the check-in venue
                    anchor is captured against this event.
      startTime /
      endTime       15 of the 100 points. Availability is scored by which slot
                    (morning / afternoon / evening) the event overlaps, and
                    that is derived from these two. Both also gate attendance
                    and "is it over".
      requiredSkills 35 of the 100 points, the largest component. An empty
                    requirement scores 1.0 for EVERY applicant, so the biggest
                    component stops discriminating and the ranking collapses.

    The alternative for skills — allow zero and REDISTRIBUTE those 35 points —
    is arguably more correct and deliberately not taken: it changes the
    matching engine, which is gated, and would move every score already stored.

    Messages are ONE SHORT LINE each. The red asterisk on the field carries
    "this is required", so the message only has to say what is wrong.
  */
  if (!state.description.trim()) {
    errors.description = 'Add a short description.';
  }

  if (!state.region) {
    errors.region = 'Choose a region.';
  }

  if (!state.district) {
    errors.district = 'Choose a district.';
  }

  if (!state.locationName.trim()) {
    errors.locationName = 'Name the venue.';
  }

  if (!state.startTime) {
    errors.startTime = 'Set a start time.';
  }

  if (!state.endTime) {
    errors.endTime = 'Set an end time.';
  }

  /*
    SKILLS ARE REQUIRED FOR CLINICAL WORK AND OPTIONAL FOR SUPPORT
    (owner-approved 2026-09-15).

    Forcing an organisation to name skills for a registration desk asks for
    data that then does nothing, and it is HOW SUPPORT EVENTS ENDED UP CARRYING
    REQUIREMENTS NOBODY MEANT -- which the matcher then scored against, across
    the largest component of the score, ranking students and willing helpers
    low for work they would have been perfectly good at.

    The matcher no longer scores skills on a support outreach at all (see the
    support-role skills override in lib/matching/layer1.ts), so a requirement
    here would be collected, stored, shown, and ignored.

    Clinical keeps the rule, and the reason above still holds there: an empty
    requirement scores 1.0 for every applicant, so the biggest component stops
    discriminating and the ranking collapses to location and availability.
  */
  if (hasClinicalRole(state.roles) && state.requiredSkills.length === 0) {
    errors.requiredSkills = 'Pick at least one skill.';
  }

  return errors;
}

/**
 * True when any role on this outreach is clinical.
 *
 * ANY, not all: a drive needing three nurses and six helpers is a clinical
 * event as far as the credential gate and the skills requirement are
 * concerned, which is the same summarising rule `outreaches.role_type` already
 * follows.
 */
export function hasClinicalRole(roles: readonly RoleDraft[]): boolean {
  return roles.some((role) => role.roleType === 'clinical');
}

/**
 * Which step each field lives on.
 *
 * Exported because two different things need it and must not disagree: the
 * screen decides whether to SHOW an error from it, and the submit path decides
 * which step to jump BACK to. A second hand-written copy of this mapping would
 * eventually send someone to a step that does not contain the problem.
 */
export const WIZARD_FIELD_STEP: Record<keyof WizardFieldError, number> = {
  title: 1,
  description: 1,
  region: 2,
  district: 2,
  locationName: 2,
  date: 2,
  startTime: 2,
  endTime: 2,
  requiredSkills: 3,
  roles: 3,
};

/** Just the errors belonging to one step, in the order the fields appear on it. */
export function errorsForStep(errors: WizardFieldError, step: number): WizardFieldError {
  const out: WizardFieldError = {};
  for (const key of Object.keys(errors) as (keyof WizardFieldError)[]) {
    if (WIZARD_FIELD_STEP[key] === step && errors[key]) out[key] = errors[key];
  }
  return out;
}

/** The earliest step carrying a problem, or null when there is none. */
export function firstStepWithError(errors: WizardFieldError): number | null {
  const steps = (Object.keys(errors) as (keyof WizardFieldError)[])
    .filter((key) => errors[key])
    .map((key) => WIZARD_FIELD_STEP[key]);
  return steps.length > 0 ? Math.min(...steps) : null;
}

/**
 * The field a failed step should scroll to: the first one with a problem, in
 * the order the fields are laid out rather than the order the object happens to
 * enumerate them in.
 */
const FIELD_ORDER: (keyof WizardFieldError)[] = [
  'title',
  'description',
  'region',
  'district',
  'locationName',
  'date',
  'startTime',
  'endTime',
  'requiredSkills',
  'roles',
];

export function firstFieldWithError(
  errors: WizardFieldError,
  step: number
): keyof WizardFieldError | null {
  return FIELD_ORDER.find((key) => WIZARD_FIELD_STEP[key] === step && errors[key]) ?? null;
}

/** "Region, district and venue" — what a step is still missing, said in one line. */
export function summariseStepErrors(errors: WizardFieldError, step: number): string | null {
  const names: Partial<Record<keyof WizardFieldError, string>> = {
    title: 'a title',
    description: 'a description',
    region: 'a region',
    district: 'a district',
    locationName: 'a venue',
    date: 'a day',
    startTime: 'a start time',
    endTime: 'an end time',
    requiredSkills: 'at least one skill',
    roles: 'how many volunteers you need',
  };

  const missing = FIELD_ORDER.filter(
    (key) => WIZARD_FIELD_STEP[key] === step && errors[key]
  ).map((key) => names[key] ?? key);

  if (missing.length === 0) return null;
  if (missing.length === 1) return `This step still needs ${missing[0]}.`;
  const last = missing[missing.length - 1];
  return `This step still needs ${missing.slice(0, -1).join(', ')} and ${last}.`;
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
    return 'This role needs a profession.';
  }

  if (roles.length > 1 && roles.some((role) => !role.category)) {
    return 'Each role needs a profession.';
  }

  const seen = new Set<string>();
  for (const role of roles) {
    const key = `${role.category ?? 'any'}|${role.minExperienceLevel ?? 'any'}`;
    if (seen.has(key)) {
      return 'Two roles are identical. Combine them.';
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
  originalDays: readonly string[]
): WizardFieldError {
  const errors = validateWizard(state);

  // Only the "must be today or later" part is relaxed, and only when the day
  // set is untouched. A list that is still malformed — empty, duplicated,
  // unparsable — is an error whatever its history, so it is re-checked without
  // the future rule rather than simply dropped.
  if (errors.date && !daysChanged(originalDays, dayStringsOf(state.days))) {
    const stillWrong = validateDays(dayStringsOf(state.days), { requireFuture: false });
    if (stillWrong) {
      errors.date = stillWrong;
    } else {
      delete errors.date;
    }
  }

  return errors;
}

/** True when the day set differs from the one already stored, order ignored. */
export function daysChanged(before: readonly string[], after: readonly string[]): boolean {
  if (before.length !== after.length) return true;
  const sortedBefore = sortDayStrings(before);
  const sortedAfter = sortDayStrings(after);
  return sortedBefore.some((day, index) => day !== sortedAfter[index]);
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
    location_image_url?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
  },
  roles: {
    category: VolunteerCategory;
    role_type: OutreachRoleType;
    min_experience_level: ExperienceLevel | null;
    slots_total: number;
  }[],
  /**
   * The outreach's `outreach_days` rows. Every outreach has at least one, so an
   * EMPTY list here means the days have not loaded yet or the read failed — in
   * which case the outreach's own `date` stands in, which is the one day it is
   * guaranteed to have.
   */
  days: { day: string; start_time?: string | null; end_time?: string | null }[] = []
): OutreachWizardState {
  return {
    title: outreach.title,
    description: outreach.description ?? '',
    // A day's own hours come through as they are stored, seconds trimmed to
    // match what the time picker reads and writes -- the same correction
    // `startTime`/`endTime` below have always needed.
    days:
      days.length > 0
        ? dayDraftsFromRows(days).map((draft) => ({
            day: draft.day,
            startTime: trimClockSecondsOrNull(draft.startTime),
            endTime: trimClockSecondsOrNull(draft.endTime),
          }))
        : [{ day: outreach.date, startTime: null, endTime: null }],
    // The pickers read and write 'HH:MM'; Postgres `time` comes back as
    // 'HH:MM:SS', and the extra seconds would fail parseClockTime on save.
    startTime: trimClockSeconds(outreach.start_time),
    endTime: trimClockSeconds(outreach.end_time),
    region: outreach.region,
    district: outreach.district,
    locationName: outreach.location_name ?? '',
    // The stored id, and no preview URL: the editor has the public_id but not
    // a delivery URL, and constructing one here would hard-code a Cloudinary
    // cloud name and transformation into the form. An organisation replacing
    // the photo picks a new one; one leaving it alone sends the same id back.
    locationImageUrl: outreach.location_image_url ?? null,
    locationLat: outreach.location_lat ?? null,
    locationLng: outreach.location_lng ?? null,
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
    // Always empty on hydration. The editor reads and writes the real
    // outreach_images rows directly, because by then the outreach exists and
    // there is nothing to defer.
    galleryUrls: [],
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

/**
 * The same trim for a day's OWN hours, where the absence of a value is
 * meaningful and must stay null rather than becoming an empty string. On the
 * outreach itself an empty string is the form's "not set"; on a day, null is
 * the database's "inherit the event's hours", and collapsing the two would make
 * every ordinary day look like a cleared override.
 */
function trimClockSecondsOrNull(time: string | null): string | null {
  if (!time) return null;
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

/**
 * Moves one item one place left or right, returning a new array.
 *
 * Shared by the wizard and the editor, which both reorder a gallery with the
 * same two arrows but hold different things — the wizard holds URLs it has not
 * saved yet, the editor holds row ids it is about to persist. Writing the swap
 * twice is how the two quietly stop agreeing about what "move left" means at
 * the ends of the list.
 *
 * Out-of-range moves return the ORIGINAL array, identity included, so a caller
 * setting state with it re-renders nothing.
 */
export function swapAdjacent<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return items as T[];
  }

  const next = [...items];
  const moved = next[index]!;
  next[index] = next[target]!;
  next[target] = moved;
  return next;
}
