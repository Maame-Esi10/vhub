import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { KEYBOARD_AVOID_BEHAVIOR } from '@/constants/keyboard';
import { Text } from '@/components/ui/Text';
import type { LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Input,
  ListSkeleton,
  MultiSelectField,
  SelectField,
} from '@/components/ui';
// Imported directly, not via the barrel: this pulls in a native module, and
// routing it through '@/components/ui' would crash every screen on a dev
// client that hasn't been rebuilt. See the note in components/ui/index.ts.
import { DateTimeField } from '@/components/ui/DateTimeField';
import { DayScheduleField } from '@/components/organisation/DayScheduleField';
import type { SelectOption } from '@/components/ui';
import {
  GalleryEditor,
  RoleBuilder,
  daysChanged,
  firstDay,
  hasWizardErrors,
  roleKey,
  rolesChanged,
  swapAdjacent,
  toStoragePayload,
  validateOutreachEdit,
  wizardStateFromOutreach,
} from '@/components/organisation';
import type { OutreachWizardState, WizardFieldError } from '@/components/organisation';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { GHANA_REGIONS } from '@/constants/ghana-locations';
import { SKILL_CATEGORIES } from '@/constants/skills';
import { VOLUNTEER_CATEGORIES } from '@/constants/categories';
import {
  MAX_GALLERY_IMAGES,
  useAddOutreachImages,
  useDeleteOutreachImage,
  useOutreach,
  useOutreachApplications,
  useOutreachCommitments,
  useOutreachDays,
  useSetOutreachDayHours,
  useOutreachImages,
  useOutreachRoles,
  useReorderOutreachImages,
  useSaveOutreach,
} from '@/hooks';
import { changedDayHours, dayDraftsFromRows, dayStringsOf } from '@/lib/outreachDays';
// Direct import, not the hooks barrel: this reaches the native picker
// modules. See the note in lib/cloudinary.ts.
import { useFlyerUpload, useGalleryImageUpload } from '@/hooks/useMediaUpload';
import { useAuthStore } from '@/stores/authStore';
import { humanError } from '@/lib/errorMessage';

const REGION_OPTIONS: SelectOption[] = GHANA_REGIONS.map((r) => ({ value: r.name, label: r.name }));
const SKILL_SECTIONS = SKILL_CATEGORIES.map((c) => ({
  title: c.name,
  icon: c.icon,
  data: c.skills,
}));

/**
 * Edit a posted outreach.
 *
 * ONE SCROLL, NOT A WIZARD. Create Outreach is four steps because the
 * organisation is composing something from nothing and the steps pace that.
 * Editing is the opposite shape: they arrive knowing the single thing they
 * want to change — a wrong time, a venue that moved, the flyer that could not
 * be attached at creation — and making them walk four screens to reach it
 * would be worse than the X-to-close they had before. Everything is visible
 * and every section is independently editable.
 */
export default function EditOutreach() {
  const router = useRouter();
  const { id, section } = useLocalSearchParams<{ id: string; section?: string }>();
  const outreachId = typeof id === 'string' ? id : undefined;
  const organisationId = useAuthStore((s) => s.user)?.id;

  const outreachQuery = useOutreach(outreachId);
  const rolesQuery = useOutreachRoles(outreachId);
  const daysQuery = useOutreachDays(outreachId);
  const commitmentsQuery = useOutreachCommitments(outreachId);
  const applicationsQuery = useOutreachApplications(outreachId);
  const saveOutreach = useSaveOutreach();
  const setDayHours = useSetOutreachDayHours();
  const flyerUpload = useFlyerUpload();

  /*
    THE GALLERY SAVES ITSELF, AND DOES NOT GO THROUGH save_outreach().

    The roles need that transaction because the outreach's own role_type and
    slots_total are DERIVED from them — a half-write leaves an event describing
    one thing and staffed as another. Nothing on `outreaches` is derived from
    the gallery. A failed image write leaves an outreach with fewer images,
    which is visible on the screen and fixed by pressing add again; it is not an
    inconsistent event.

    Adding a photo is also a discrete act rather than an edit to a field. An
    organisation who picks an image expects it to be there, not to be pending
    until they find a Save button belonging to a different section.
  */
  const imagesQuery = useOutreachImages(outreachId);
  const galleryUpload = useGalleryImageUpload();
  const addImages = useAddOutreachImages();
  const deleteImage = useDeleteOutreachImage();
  const reorderImages = useReorderOutreachImages();
  const [galleryError, setGalleryError] = useState<string | null>(null);

  const [state, setState] = useState<OutreachWizardState | null>(null);
  /*
    DERIVED, NOT STORED — the same fix as the create wizard, and the same bug:
    a message written once by attemptSave survived until the next tap of Save,
    so a field could read as invalid after it had been corrected.

    `attempted` is a single flag rather than a per-step map because the editor
    is one page: there is one Save, so there is one moment at which the
    organisation has asked to be told what is wrong.
  */
  const [attempted, setAttempted] = useState(false);
  const [slotsFloorError, setSlotsFloorError] = useState<string | null>(null);
  const [roleWarning, setRoleWarning] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /*
    DEEP LINKS INTO A SECTION.

    Reaching one field used to mean opening the editor at the top and scrolling
    past everything else. The rows on Manage event that DISPLAY the date and the
    place now open this screen at the section that owns them, so the tap that
    says "this is wrong" lands on the control that fixes it.

    Offsets are measured rather than guessed: the sections are different heights
    on different phones, and a hard-coded scroll position would be wrong on all
    but one of them.
  */
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});
  const scrolledToSection = useRef(false);

  function rememberSection(name: string) {
    return (event: LayoutChangeEvent) => {
      sectionOffsets.current[name] = event.nativeEvent.layout.y;
    };
  }

  const outreach = outreachQuery.data;
  const storedRoles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);
  const storedDays = useMemo(() => daysQuery.data ?? [], [daysQuery.data]);
  const storedDayStrings = useMemo(() => storedDays.map((day) => day.day), [storedDays]);
  // The same rows as form drafts, so a day's stored hours can be compared with
  // what the organisation has just set without re-reading the column shape.
  const storedDayDrafts = useMemo(() => dayDraftsFromRows(storedDays), [storedDays]);

  // Recomputed every render once Save has been attempted, so correcting a field
  // clears its message immediately instead of at the next tap of Save.
  const errors: WizardFieldError =
    attempted && state ? validateOutreachEdit(state, storedDayStrings) : {};

  /**
   * The days that already carry a commitment, as calendar dates.
   *
   * Shown locked in the day list, because the database refuses to delete them:
   * `application_days` cascades from `outreach_days`, so removing a day would
   * silently erase every promise made against it — and those rows are the
   * evidence a V-Score is derived from. The refusal is at the database rather
   * than only here, so a stale screen cannot get round it; this just means the
   * organisation is told before they try rather than after.
   */
  const committedDayDates = useMemo(() => {
    // A ONE-DAY OUTREACH IS NEVER LOCKED, and this is not an oversight.
    //
    // Its only day is committed the moment anybody applies, so locking it would
    // mean an organisation could never change the date of a one-day event with
    // applicants — which they have always been able to do, and which
    // save_outreach() explicitly still supports by MOVING the row in place
    // rather than deleting it. The padlock exists to stop a day being dropped
    // from a set, and a one-day event has no set to drop from.
    if (storedDays.length <= 1) return [];

    const committedDayIds = new Set(Object.values(commitmentsQuery.data ?? {}).flat());
    return storedDays.filter((day) => committedDayIds.has(day.id)).map((day) => day.day);
  }, [commitmentsQuery.data, storedDays]);

  /*
    HYDRATION IS KEYED ON THE OUTREACH, NOT ON "HAVE WE HYDRATED YET".

    THE BUG THIS FIXES. Every screen in the (organisation) group is a tab screen
    — that is what `href: null` registers — and tab screens STAY MOUNTED after
    their first visit. Opening a second event therefore changes the route params
    but does not remount this component. The old guard was `state !== null`,
    which is true forever after the first event, so the form was populated once
    and then showed THAT event's title, description, dates and roles on every
    later one. Saving from there would have written one event's content onto
    another. Applicant Vetting documents the same hazard; this screen had it too.

    Roles resolving to an empty array is still a real answer — single-role
    storage — so hydration waits for the query to SETTLE rather than for the
    array to be non-empty.
  */
  const hydratedFor = useRef<string | null>(null);
  // The DAYS query joins the wait for the same reason the roles one does:
  // hydrating before it settles would populate the form with a single day
  // derived from `outreaches.date`, and a save from there would delete every
  // other day of a multi-day event.
  const ready = !!outreach && !rolesQuery.isPending && !daysQuery.isPending;
  useEffect(() => {
    if (!ready || !outreach || !outreachId) return;
    // The query can still be serving the previous event's row for one render
    // after the id changes. Hydrating from that is precisely the mix-up.
    if (outreach.id !== outreachId) return;
    if (hydratedFor.current === outreachId) return;

    hydratedFor.current = outreachId;
    setState(wizardStateFromOutreach(outreach, storedRoles, storedDays));
    // Everything derived from the previous event goes with it.
    setAttempted(false);
    setSaveError(null);
    setSlotsFloorError(null);
    setGalleryError(null);
    setRoleWarning(false);
    scrolledToSection.current = false;
  }, [ready, outreach, outreachId, storedRoles, storedDays]);

  /** The roles as they are stored, in the form's own shape, for change detection. */
  const storedRoleDrafts = useMemo(
    () =>
      storedRoles.map((role) => ({
        category: role.category,
        roleType: role.role_type,
        minExperienceLevel: role.min_experience_level,
        slotsTotal: role.slots_total,
      })),
    [storedRoles]
  );

  /**
   * How many places are already taken on each role, keyed the way the unique
   * index is. A role's places can be raised freely but never cut below the
   * volunteers already accepted into it.
   */
  const filledByRoleKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const role of storedRoles) {
      map.set(
        roleKey({ category: role.category, minExperienceLevel: role.min_experience_level }),
        role.slots_filled
      );
    }
    return map;
  }, [storedRoles]);

  // Runs after layout, so the offsets exist. Once only: a later re-render must
  // not yank the organisation back up mid-edit.
  useEffect(() => {
    if (!section || scrolledToSection.current || !state) return;
    const y = sectionOffsets.current[section];
    if (y === undefined) return;
    scrolledToSection.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: false });
  }, [section, state]);

  const liveApplicationCount = (applicationsQuery.data ?? []).filter(
    (application) => application.status !== 'cancelled'
  ).length;

  function update<K extends keyof OutreachWizardState>(key: K, value: OutreachWizardState[K]) {
    setState((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const galleryImages = imagesQuery.data ?? [];

  function handleAddGalleryImage() {
    if (!outreachId) return;
    const remaining = MAX_GALLERY_IMAGES - galleryImages.length;
    if (remaining <= 0) return;

    setGalleryError(null);
    galleryUpload.mutate(remaining, {
      onSuccess: (results) => {
        if (results.length === 0) return;
        addImages.mutate(
          {
            outreachId,
            urls: results.map((r) => r.secureUrl),
            startPosition: galleryImages.length,
          },
          { onError: (error) => setGalleryError(error.message) }
        );
      },
      onError: (error) => setGalleryError(error.message),
    });
  }

  function handleRemoveGalleryImage(index: number) {
    const image = galleryImages[index];
    if (!image || !outreachId) return;
    setGalleryError(null);
    deleteImage.mutate(
      { imageId: image.id, outreachId },
      { onError: (error) => setGalleryError(error.message) }
    );
  }

  function handleMoveGalleryImage(index: number, direction: -1 | 1) {
    if (!outreachId) return;
    const current = galleryImages.map((image) => image.id);
    const ordered = swapAdjacent(current, index, direction);
    // Identity is unchanged when the move was out of range, which is the
    // cheapest way to say "nothing to do".
    if (ordered === current) return;

    setGalleryError(null);
    reorderImages.mutate(
      { outreachId, orderedIds: ordered },
      { onError: (error) => setGalleryError(error.message) }
    );
  }

  function handlePickFlyer() {
    flyerUpload.mutate(undefined, {
      onSuccess: (result) => {
        // null means the picker was dismissed — leave any existing flyer alone.
        if (result) update('flyerUrl', result.secureUrl);
      },
    });
  }

  if (!outreachId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message="That outreach could not be found."
            onRetry={() => router.replace('/(organisation)/dashboard')}
          />
        </View>
      </SafeAreaView>
    );
  }

  // `state` belonging to another event is the mix-up itself, so it counts as
  // "not ready" rather than as something to render.
  const stateMatchesRoute = hydratedFor.current === outreachId;

  if (outreachQuery.isPending || !state || !stateMatchesRoute) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.content}>
          <ListSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  if (outreachQuery.isError || !outreach) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message="Could not load this outreach."
            onRetry={() => outreachQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Editing is a management surface, so it is gated the same way the rest of
  // them are: RLS would refuse the write anyway, but an explanation beats a
  // form that fails on save.
  if (outreach.organisation_id !== organisationId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message="You can only edit outreaches your organisation created."
            onRetry={() => router.replace('/(organisation)/dashboard')}
          />
        </View>
      </SafeAreaView>
    );
  }

  const districtOptions: SelectOption[] =
    GHANA_REGIONS.find((r) => r.name === state.region)?.districts.map((d) => ({
      value: d,
      label: d,
    })) ?? [];

  // The list is compared in STORAGE terms, not form terms: a single role with
  // no experience floor is not an outreach_roles row at all, so a form showing
  // one role and a database holding none are in agreement, not conflict.
  const payload = toStoragePayload(state);
  const roleListChanged = rolesChanged(storedRoleDrafts, payload.roles);
  const dayListChanged = !!state && daysChanged(storedDayStrings, dayStringsOf(state.days));
  /**
   * The days whose OWN hours changed — a different question from whether the
   * day set changed, and answered separately because the two are written by
   * different statements. Re-timing Saturday touches no day but Saturday, and
   * must not drag the whole day set through a delete-and-reinsert that
   * `application_days` cascades from.
   */
  const dayHourChanges = state ? changedDayHours(storedDayDrafts, state.days) : [];

  /**
   * Places can never fall below the volunteers already accepted — the database
   * enforces `slots_filled <= slots_total` as a check constraint, and where
   * there are role rows the same rule applies per role. Caught here so the
   * organisation gets a sentence naming the role rather than a constraint
   * violation on save.
   */
  function findSlotsFloorProblem(form: OutreachWizardState): string | null {
    const shape = toStoragePayload(form);

    // Single-role storage: one total, checked against the outreach's own.
    if (shape.roles.length === 0) {
      if (shape.slotsTotal < outreach!.slots_filled) {
        return `You have already accepted ${outreach!.slots_filled} volunteer${
          outreach!.slots_filled === 1 ? '' : 's'
        }, so you cannot drop below ${outreach!.slots_filled} place${
          outreach!.slots_filled === 1 ? '' : 's'
        }.`;
      }
      return null;
    }

    for (const role of shape.roles) {
      const filled = filledByRoleKey.get(roleKey(role)) ?? 0;
      if (role.slotsTotal < filled) {
        const label =
          VOLUNTEER_CATEGORIES.find((c) => c.value === role.category)?.label ?? role.category;
        return `The ${label} role already has ${filled} accepted, so it cannot drop below ${filled} place${
          filled === 1 ? '' : 's'
        }.`;
      }
    }

    // A role REMOVED entirely, but with people in it. The rewrite would orphan
    // their role link, so it is worth naming rather than letting the
    // confirmation dialog cover it vaguely.
    for (const role of storedRoles) {
      if (role.slots_filled === 0) continue;
      const stillThere = shape.roles.some(
        (draft) =>
          draft.category === role.category &&
          (draft.minExperienceLevel ?? 'any') === (role.min_experience_level ?? 'any')
      );
      if (!stillThere) {
        const label =
          VOLUNTEER_CATEGORIES.find((c) => c.value === role.category)?.label ?? role.category;
        return `The ${label} role has ${role.slots_filled} accepted volunteer${
          role.slots_filled === 1 ? '' : 's'
        }. Reject or move them before removing the role.`;
      }
    }

    return null;
  }

  function attemptSave() {
    if (!state || !outreach) return;

    const nextErrors = validateOutreachEdit(state, storedDayStrings);
    setAttempted(true);
    if (hasWizardErrors(nextErrors)) return;

    const floorProblem = findSlotsFloorProblem(state);
    setSlotsFloorError(floorProblem);
    if (floorProblem) return;

    // Rewriting roles is a delete-then-insert (see useReplaceOutreachRoles), so
    // an application pointing at a removed role has its role link set to NULL.
    // That is fine on a draft nobody has seen and is worth a warning once
    // people have applied.
    if (roleListChanged && liveApplicationCount > 0) {
      setRoleWarning(true);
      return;
    }

    void save();
  }

  /**
   * ONE TRANSACTION, VIA save_outreach().
   *
   * The details and the roles live in different tables and supabase-js cannot
   * span them, so this used to be two or three separate requests — and every
   * request is its own transaction. A failure between them left the outreach
   * describing one thing and staffed as another, which is exactly what the
   * enum-cast bug produced. Writing the fragile one first narrowed the window;
   * it could not close it, and the role rewrite is itself a delete followed by
   * an insert, so a failure between THOSE lost the roles outright.
   *
   * A plpgsql function body IS a transaction. The details update, the role
   * delete and the role insert now either all commit or all roll back, and the
   * screen keeps every change either way.
   */
  async function save() {
    if (!state || !outreach || !organisationId) return;
    setRoleWarning(false);
    setSaveError(null);

    const shape = toStoragePayload(state);

    try {
      await saveOutreach.mutateAsync({
        outreachId: outreach.id,
        organisationId,
        title: state.title.trim(),
        description: state.description.trim() ? state.description.trim() : null,
        date: firstDay(state),
        startTime: state.startTime ? state.startTime : null,
        endTime: state.endTime ? state.endTime : null,
        region: state.region,
        district: state.district,
        locationName: state.locationName.trim() ? state.locationName.trim() : null,
        requiredSkills: state.requiredSkills,
        requiredCategory: shape.requiredCategory,
        roleType: shape.roleType,
        flyerUrl: state.flyerUrl,
        // Omitted where there are role rows: the total is their sum and is
        // maintained by trigger, so a client value would be overwritten.
        ...(shape.roles.length > 0 ? {} : { slotsTotal: shape.slotsTotal }),
        // null leaves the roles untouched entirely — the common save, where
        // only the details changed. Passing the list when nothing changed
        // would delete and reinsert rows for no reason, dropping the role link
        // off every application that pointed at them.
        roles: roleListChanged ? shape.roles : null,
        // Same contract as the roles: null leaves the days alone, which is the
        // common save. Sending an unchanged list would delete and re-insert
        // rows for no reason — and `application_days` cascades from them, so
        // that would destroy every commitment on the event.
        days: dayListChanged ? dayStringsOf(state.days) : null,
      });

      /*
        Per-day hours, AFTER the transaction and only for the days that changed.

        Not folded into `save_outreach()`, and that is the same call the gallery
        makes: the function is one transaction because `role_type` and
        `slots_total` are DERIVED from the role rows, so a half-applied role
        write leaves an outreach enforcing a requirement it no longer states.
        Nothing on `outreaches` is derived from a day's hours — they are an
        override, read through `dayStartTime`/`dayEndTime` — so a failure here
        leaves the days inheriting the event's hours, which is visible on the
        screen and is what they did a moment ago. Widening the RPC's signature
        to carry them would be a migration, and a gated one, for a write with
        nothing to keep in step.

        It runs after the save rather than before because a day added in this
        very edit does not exist until `save_outreach` has inserted it.

        Surfaced, not swallowed: the organisation set those hours deliberately.
      */
      if (dayHourChanges.length > 0) {
        try {
          await setDayHours.mutateAsync({ outreachId: outreach.id, days: dayHourChanges });
        } catch (error) {
          setSaveError(
            humanError(error, 'Your changes saved, but the hours for individual days did not. Try setting them again.')
          );
          return;
        }
      }

      // Confirmation belongs on the destination, not here: the organisation
      // asked to be returned to the event, and a message on the screen they
      // just left would be gone before they read it.
      router.replace({
        pathname: '/(organisation)/outreach/[id]',
        // The id, not a bare flag: the destination compares it to its own
        // route so the confirmation cannot appear on a different event.
        params: { id: outreach.id, saved: outreach.id },
      });
    } catch (error) {
      setSaveError(
        humanError(error, 'Could not save your changes. Please try again.')
      );
    }
  }

  const saving = saveOutreach.isPending;
  // One line for both refusals — the floor check and the database — because
  // from the organisation's side they are the same event: the save did not
  // happen, and here is why.
  const blockingMessage = saveError ?? slotsFloorError;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={KEYBOARD_AVOID_BEHAVIOR}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.replace(`/(organisation)/outreach/${outreach.id}`)}
            accessibilityRole="button"
            accessibilityLabel="Cancel editing"
            hitSlop={12}
          >
            <MaterialCommunityIcons name="close" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Edit event</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* ---------- Details ---------- */}
          <Text style={styles.sectionLabel} onLayout={rememberSection('details')}>
            DETAILS
          </Text>
          <View style={styles.section}>
            <Input
              label="Campaign Title"
              required
              placeholder="e.g. Community Health Screening 2024"
              value={state.title}
              onChangeText={(text) => update('title', text)}
              error={errors.title}
              accessibilityLabel="Campaign title"
            />
            <Input
              label="Program Description"
              required
              placeholder="Goals and target audience..."
              value={state.description}
              onChangeText={(text) => update('description', text)}
              error={errors.description}
              multiline
              accessibilityLabel="Program description"
            />

            <View>
              <Text style={styles.flyerLabel}>Flyer</Text>
              <Pressable
                onPress={handlePickFlyer}
                disabled={flyerUpload.isPending}
                accessibilityRole="button"
                accessibilityLabel={state.flyerUrl ? 'Replace flyer image' : 'Add a flyer image'}
                accessibilityState={{ disabled: flyerUpload.isPending }}
                style={styles.flyerPicker}
              >
                {state.flyerUrl ? (
                  <Image
                    source={{ uri: state.flyerUrl }}
                    style={styles.flyerPreview}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.flyerEmpty}>
                    <MaterialCommunityIcons
                      name={flyerUpload.isPending ? 'progress-upload' : 'image-plus'}
                      size={22}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.flyerEmptyText}>
                      {flyerUpload.isPending ? 'Uploading...' : 'Add a flyer image'}
                    </Text>
                  </View>
                )}
              </Pressable>
              {state.flyerUrl ? (
                <Pressable onPress={() => update('flyerUrl', null)} hitSlop={8}>
                  <Text style={styles.flyerRemove}>Remove flyer</Text>
                </Pressable>
              ) : null}
              {flyerUpload.error ? (
                <Text style={styles.flyerError}>{humanError(flyerUpload.error)}</Text>
              ) : null}
            </View>

            <GalleryEditor
              urls={galleryImages.map((image) => image.url)}
              onAdd={handleAddGalleryImage}
              onRemove={handleRemoveGalleryImage}
              onMove={handleMoveGalleryImage}
              uploading={galleryUpload.isPending || addImages.isPending}
              max={MAX_GALLERY_IMAGES}
              error={galleryError}
              savesImmediately
            />
          </View>

          {/* ---------- Where and when ---------- */}
          <Text style={styles.sectionLabel} onLayout={rememberSection('when')}>
            WHERE &amp; WHEN
          </Text>
          <View style={styles.section}>
            <SelectField
              label="Region"
              placeholder="Select a region"
              value={state.region}
              options={REGION_OPTIONS}
              searchable
              onSelect={(value) =>
                setState((prev) => (prev ? { ...prev, region: value, district: null } : prev))
              }
            />
            <SelectField
              label="District"
              placeholder="Select a district"
              value={state.district}
              options={districtOptions}
              searchable
              disabled={!state.region}
              disabledHint="Select a region first."
              onSelect={(value) => update('district', value)}
            />
            <Input
              label="Location Name"
              placeholder="e.g. Main Campus"
              value={state.locationName}
              onChangeText={(text) => update('locationName', text)}
              accessibilityLabel="Venue name"
            />
            {/*
              minimumToday is deliberately NOT set here. An outreach that has
              already happened is an ordinary thing to edit, and pinning the
              picker to today would make its own days unreachable. Moving a day
              INTO the past is still refused by validateOutreachEdit.
            */}
            <View style={styles.daysSection}>
              <DayScheduleField
                days={state.days}
                onChange={(next) => update('days', next)}
                eventStartTime={state.startTime}
                eventEndTime={state.endTime}
                error={errors.date}
                minimumToday={false}
                lockedDays={committedDayDates}
              />
            </View>
            <Text style={styles.timesHint}>
              These are the hours for every day, unless you set different ones on a day above.
            </Text>
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <DateTimeField
                  label="Start Time"
                  mode="time"
                  value={state.startTime}
                  onChange={(next) => update('startTime', next)}
                  error={errors.startTime}
                  accessibilityLabel="Start time"
                />
              </View>
              <View style={styles.timeField}>
                <DateTimeField
                  label="End Time"
                  mode="time"
                  value={state.endTime}
                  onChange={(next) => update('endTime', next)}
                  error={errors.endTime}
                  accessibilityLabel="End time"
                />
              </View>
            </View>
          </View>

          {/* ---------- Who they need ---------- */}
          <Text style={styles.sectionLabel} onLayout={rememberSection('who')}>
            WHO YOU NEED
          </Text>
          <View style={styles.section}>
            <MultiSelectField
              label="Required Skills"
              placeholder="Select the skills volunteers need"
              required
              selected={state.requiredSkills}
              sections={SKILL_SECTIONS}
              error={errors.requiredSkills}
              onChange={(next) => update('requiredSkills', next)}
            />
            {/*
              An outreach created before the skills rule existed will hit this
              on its first save. That is the intended repair path rather than a
              side effect: those events cannot rank their applicants, and the
              editor is where they get fixed.
            */}


            {/*
              ONE LIST, NO MODE. The "Any volunteers / Specific roles" toggle
              that used to sit here was the database's two storage shapes shown
              to the organisation as a choice they had to make. Needing one kind
              of volunteer is the one-role case; `toStoragePayload` decides
              which shape to write, and this screen never has to know.
            */}
            <RoleBuilder
              roles={state.roles}
              onChange={(roles) => update('roles', roles)}
              filledByKey={filledByRoleKey}
            />
            {errors.roles ? <Text style={styles.fieldError}>{errors.roles}</Text> : null}
            {payload.roles.length === 0 && outreach.slots_filled > 0 ? (
              <Text style={styles.derivedNote}>
                {outreach.slots_filled} {outreach.slots_filled === 1 ? 'place is' : 'places are'}{' '}
                already taken by accepted volunteers.
              </Text>
            ) : null}
          </View>

        </ScrollView>

        {/*
          THE FAILURE SITS ON THE BUTTON THAT CAUSED IT.

          This was red text at the bottom of a long scrolling form, which is
          the one place it could be missed — the organisation taps Save, the
          message renders above the fold they are not looking at, and nothing
          about the screen says the save did not happen. In the footer it is
          pinned, it cannot scroll away, and it is impossible to reach for
          Save again without reading it.
        */}
        <View style={styles.footer}>
          {blockingMessage ? (
            <View style={styles.errorBanner}>
              <MaterialCommunityIcons name="alert-circle" size={18} color={colors.danger} />
              <View style={styles.errorTextBlock}>
                <Text style={styles.errorTitle}>Not saved</Text>
                <Text style={styles.errorBody}>{blockingMessage}</Text>
                <Text style={styles.errorHint}>Your changes are still here. Fix this and save again.</Text>
              </View>
            </View>
          ) : null}

          <Button
            title={saving ? 'Saving...' : 'Save changes'}
            onPress={attemptSave}
            disabled={saving}
            accessibilityLabel="Save changes to this outreach"
          />
        </View>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={roleWarning}
        title="Change the roles on a live event?"
        message={`${liveApplicationCount} ${
          liveApplicationCount === 1 ? 'person has' : 'people have'
        } already applied. Rewriting the roles keeps every application, but anyone who applied for a role you removed will no longer be attached to one, and you will need to place them yourself.`}
        icon="account-alert-outline"
        confirmLabel="Save anyway"
        cancelLabel="Go back"
        tone="destructive"
        busy={saving}
        onConfirm={() => void save()}
        onCancel={() => setRoleWarning(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 22,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  // Section headings carry their own top margin so each block sits clear of
  // the one above it rather than reading as one long undifferentiated form.
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.base,
  },
  section: {
    gap: spacing.lg,
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  flyerLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  flyerPicker: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  /** 16:9, matching the aspect the picker crops to. */
  flyerPreview: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  flyerEmpty: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 12,
  },
  flyerEmptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  flyerRemove: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  flyerError: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  // The day list is a block, not another field in the stack: chips, two
  // buttons and a summary need room to read as one control rather than as
  // loose pieces wedged between the venue and the times.
  daysSection: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  timesHint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.base,
  },
  timeField: {
    flex: 1,
  },
  chipLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.white,
  },
  fieldError: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
  },
  derivedNote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.base,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
  errorTextBlock: {
    flex: 1,
    gap: 2,
  },
  errorTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.danger,
  },
  errorBody: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textPrimary,
  },
  errorHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
});
