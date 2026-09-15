import { useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Button,
  Input,
  MultiSelectField,
  SelectField,
  StepProgressBar,
} from '@/components/ui';
// Imported directly, not via the barrel: this pulls in a native module, and
// routing it through '@/components/ui' would crash every screen on a dev
// client that hasn't been rebuilt. See the note in components/ui/index.ts.
import { DateTimeField } from '@/components/ui/DateTimeField';
import { DayScheduleField } from '@/components/organisation/DayScheduleField';
import type { SelectOption } from '@/components/ui';
import {
  GalleryEditor,
  INITIAL_WIZARD_STATE,
  OutreachPreviewCard,
  RoleBuilder,
  WIZARD_FIELD_STEP,
  errorsForStep,
  firstDay,
  firstFieldWithError,
  firstStepWithError,
  hasWizardErrors,
  hasClinicalRole,
  summariseStepErrors,
  swapAdjacent,
  toStoragePayload,
  validateWizard,
} from '@/components/organisation';
import type { OutreachWizardState, WizardFieldError } from '@/components/organisation';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { GHANA_REGIONS } from '@/constants/ghana-locations';
import { SKILL_CATEGORIES } from '@/constants/skills';
import { SkillSuggestBox } from '@/components/skills/SkillSuggestBox';
import {
  MAX_GALLERY_IMAGES,
  useAddOutreachDays,
  useSetOutreachDayHours,
  useAddOutreachImages,
  useCreateOutreach,
  useReplaceOutreachRoles,
} from '@/hooks';
import { hasOwnHours, sortDayDrafts } from '@/lib/outreachDays';
// Direct import, not the hooks barrel: this reaches the native picker
// modules. See the note in lib/cloudinary.ts.
import { useFlyerUpload, useGalleryImageUpload } from '@/hooks/useMediaUpload';
import { useAuthStore } from '@/stores/authStore';
import { humanError } from '@/lib/errorMessage';
import { useTabBarFooterOffset } from '@/components/ui/tabBarOptions';

const TOTAL_STEPS = 4;
const STEP_TITLES = ['Basic Information', 'Where & When', 'Requirements & Capacity', 'Preview'];

const REGION_OPTIONS: SelectOption[] = GHANA_REGIONS.map((r) => ({ value: r.name, label: r.name }));
const SKILL_SECTIONS = SKILL_CATEGORIES.map((c) => ({
  title: c.name,
  icon: c.icon,
  data: c.skills,
}));

/**
 * Prepends a "Recommended" section when Gemini has suggested anything.
 *
 * REORDERING, NOT FILTERING. The nine real categories follow untouched, so a
 * suggestion can only ever add a shortcut to the top of the list -- never take
 * an option away from somebody whose event is not what their description made
 * it sound like.
 */
function withSuggestions(suggested: readonly string[]) {
  if (suggested.length === 0) return SKILL_SECTIONS;
  return [
    { title: 'Recommended for this outreach', icon: 'lightbulb-on-outline', data: [...suggested] },
    ...SKILL_SECTIONS,
  ];
}

export default function CreateOutreach() {
  const [suggestedSkills, setSuggestedSkills] = useState<string[]>([]);
  const suggestedSections = useMemo(() => withSuggestions(suggestedSkills), [suggestedSkills]);
  // The fixed footer below the scroller needs its own offset: the scroll
  // content's padding does nothing for a sibling. See useTabBarFooterOffset.
  const tabBarFooter = useTabBarFooterOffset();
  const router = useRouter();
  const organisationId = useAuthStore((s) => s.user)?.id;
  const createOutreach = useCreateOutreach();
  const addDays = useAddOutreachDays();
  const setDayHours = useSetOutreachDayHours();
  const replaceRoles = useReplaceOutreachRoles();
  const flyerUpload = useFlyerUpload();
  const galleryUpload = useGalleryImageUpload();
  const addImages = useAddOutreachImages();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<OutreachWizardState>(INITIAL_WIZARD_STATE);
  const [roleError, setRoleError] = useState<string | null>(null);

  /*
    ERRORS ARE DERIVED, NOT STORED. This is the fix for a reported bug: a day
    was picked, the chip appeared, and "Pick at least one day" stayed on screen
    underneath it.

    The cause was that `errors` was a useState snapshot written only by
    handleNext and handleSubmit. Nothing recomputed it when a field changed, so
    every message survived until the next tap of Next — stale by construction,
    and stale for EVERY field, not only the day list.

    Now the errors are recomputed from state on every render, and a separate
    `attempted` set decides whether a step's errors are SHOWN. So a message
    appears when you try to leave a step that is not ready, and disappears the
    instant you fix it.
  */
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  // Skills are required for clinical work and optional for support: see validateWizard.
  const clinical = hasClinicalRole(state.roles);
  const liveErrors = useMemo(() => validateWizard(state), [state]);
  const errors = useMemo<WizardFieldError>(
    () =>
      Object.fromEntries(
        Object.entries(liveErrors).filter(
          ([key]) => attempted[WIZARD_FIELD_STEP[key as keyof WizardFieldError]]
        )
      ),
    [liveErrors, attempted]
  );

  /*
    WHERE EACH FIELD SITS ON THE SCROLL, so a failed step can take the
    organisation TO the problem.

    Tapping Next with no skills chosen used to do nothing visible at all: the
    step refused to advance and the message rendered below the fold, so the
    button read as dead. Measuring each field on layout is what lets the screen
    scroll to the first one that is wrong.
  */
  const scrollRef = useRef<ScrollView>(null);
  const fieldTops = useRef<Partial<Record<keyof WizardFieldError, number>>>({});

  /*
    Takes the field AND the event, rather than being a factory that returns a
    handler.

    The factory form read `onLayout={captureFieldTop('title')}` -- a function
    CALLED during render whose body writes a ref. React's own rule is that refs
    may be touched in event handlers and not during render, and from the outside
    those two are indistinguishable here: the call happens in render, even though
    the write happens later on layout. Taking the event directly and letting each
    site pass an inline arrow puts the ref write unambiguously inside the
    handler, which is where it has always actually run.
  */
  function captureFieldTop(field: keyof WizardFieldError, event: LayoutChangeEvent) {
    fieldTops.current[field] = event.nativeEvent.layout.y;
  }

  function revealFirstError(fieldErrors: WizardFieldError, onStep: number) {
    const field = firstFieldWithError(fieldErrors, onStep);
    if (!field) return;
    const top = fieldTops.current[field];
    // A little above the field, so its label is on screen rather than flush
    // against the top edge.
    scrollRef.current?.scrollTo({ y: Math.max(0, (top ?? 0) - 24), animated: true });
  }

  function update<K extends keyof OutreachWizardState>(key: K, value: OutreachWizardState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function handlePickFlyer() {
    flyerUpload.mutate(undefined, {
      onSuccess: (result) => {
        // null means the picker was dismissed — leave any existing flyer alone.
        if (result) update('flyerUrl', result.secureUrl);
      },
    });
  }

  /*
    Gallery images are uploaded as they are picked and their URLs held in form
    state, because the outreach row does not exist yet — the same reason the
    roles are written after the insert. The flyer above is untouched by any of
    this and remains a separate, single image.
  */
  function handleAddGalleryImage() {
    // Only ever offers as many as are still allowed, so the picker cannot
    // return a selection the cap will then reject.
    const remaining = MAX_GALLERY_IMAGES - state.galleryUrls.length;
    if (remaining <= 0) return;

    galleryUpload.mutate(remaining, {
      onSuccess: (results) => {
        if (results.length === 0) return;
        setState((prev) => ({
          ...prev,
          galleryUrls: [...prev.galleryUrls, ...results.map((r) => r.secureUrl)].slice(
            0,
            MAX_GALLERY_IMAGES
          ),
        }));
      },
    });
  }

  function handleRemoveGalleryImage(index: number) {
    setState((prev) => ({
      ...prev,
      galleryUrls: prev.galleryUrls.filter((_, i) => i !== index),
    }));
  }

  function handleMoveGalleryImage(index: number, direction: -1 | 1) {
    setState((prev) => ({
      ...prev,
      galleryUrls: swapAdjacent(prev.galleryUrls, index, direction),
    }));
  }

  const stepSummary = attempted[step] ? summariseStepErrors(liveErrors, step) : null;

  const districtOptions: SelectOption[] =
    GHANA_REGIONS.find((r) => r.name === state.region)?.districts.map((d) => ({ value: d, label: d })) ?? [];

  function goBack() {
    if (step === 1) {
      // replace, not push: these are sibling tabs, and pushing one onto the
      // other stacks a duplicate history entry the back gesture then unwinds.
      router.replace('/(organisation)/dashboard');
      return;
    }
    setStep((s) => s - 1);
  }

  /*
    One rule for every step, rather than a hand-written list of which fields
    hold which step. The list was the reason a field could be added to the form
    and quietly not block anything — six of them had been.
  */
  function handleNext() {
    const nextErrors = validateWizard(state);
    setAttempted((prev) => ({ ...prev, [step]: true }));

    if (Object.keys(errorsForStep(nextErrors, step)).length > 0) {
      revealFirstError(nextErrors, step);
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  function jumpToOffendingStep(fieldErrors: WizardFieldError) {
    const target = firstStepWithError(fieldErrors);
    if (target === null) return;
    // Every step up to the problem counts as attempted: the organisation has
    // just tried to publish, which is an attempt at all of them.
    setAttempted((prev) => ({ ...prev, 1: true, 2: true, 3: true }));
    setStep(target);
    // After the step swaps, so the measurements belong to the step being shown.
    requestAnimationFrame(() => revealFirstError(fieldErrors, target));
  }

  function handleSubmit(status: 'draft' | 'open') {
    if (!organisationId) return;
    const finalErrors = validateWizard(state);
    if (hasWizardErrors(finalErrors)) {
      jumpToOffendingStep(finalErrors);
      return;
    }

    // One place decides which of the two storage shapes this list becomes.
    // role_type is always a real value now, never null: a null one is read as
    // "support" by every verification gate in the app, so a role write that
    // failed after the details had been saved left an outreach that had
    // quietly stopped requiring verification.
    const payload = toStoragePayload(state);
    const usesRoles = payload.roles.length > 0;
    // `outreaches.date` is the FIRST day and nothing else. The remaining days
    // are written below, once the outreach has an id to hang them on, and the
    // database re-derives this column from them by trigger.
    const days = sortDayDrafts(state.days);

    createOutreach.mutate(
      {
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
        requiredCategory: payload.requiredCategory,
        roleType: payload.roleType,
        slotsTotal: payload.slotsTotal,
        status,
        flyerUrl: state.flyerUrl,
      },
      {
        onSuccess: async (outreach) => {
          // Days 2..n are written after the outreach exists, because they need
          // its id. Day ONE already exists — `trg_outreaches_default_day` wrote
          // it in the same transaction as the outreach itself, so an outreach
          // can never exist without a day even if everything below fails.
          //
          // Surfaced rather than swallowed, and before the roles, because an
          // event that lost days 2..n is describing the wrong commitment to
          // every volunteer who reads it. The editor can put them back.
          if (days.length > 1) {
            try {
              await addDays.mutateAsync({ outreachId: outreach.id, days });
            } catch (error) {
              console.warn(
                '[create-outreach] outreach saved but its extra days did not:',
                error instanceof Error ? error.message : error
              );
              setRoleError(
                'The outreach was saved, but only its first day was. Open it from the dashboard and add the other days again.'
              );
              return;
            }
          }

          /*
            Per-day hours, for the days the organisation gave their own.

            Written for EVERY overridden day, including days 2..n whose hours
            already went in with the insert above — re-stating them is a no-op
            update and means there is one place that owns this, rather than a
            rule about which day was created by which path. Day ONE genuinely
            needs it: `trg_outreaches_default_day` writes that row inside the
            outreach's own transaction and always with null hours, so it is the
            one day an override cannot ride along with.

            Nearly always an empty list, and therefore no request at all.

            Best-effort with a message rather than a block: nothing on the
            outreach is derived from a day's hours, so a failure here leaves
            every day inheriting the event's — which is visible on the screen,
            fixable in the editor, and is the state the outreach was in a moment
            before.
          */
          const ownHours = days.filter(hasOwnHours);
          if (ownHours.length > 0) {
            try {
              await setDayHours.mutateAsync({ outreachId: outreach.id, days: ownHours });
            } catch (error) {
              console.warn(
                '[create-outreach] outreach saved but its per-day hours did not:',
                error instanceof Error ? error.message : error
              );
              setRoleError(
                "The outreach was saved, but the hours you set for individual days were not. Open it from the dashboard and set them again. Every day is currently running to the event's hours."
              );
              return;
            }
          }

          // Roles are written after the outreach exists, because they need its
          // id. Best-effort in the sense that the outreach is already saved if
          // this fails — but NOT silent: a multi-role outreach with no roles is
          // a single-role outreach asking for the summed total, which is not
          // what the organisation described, so the failure is surfaced.
          if (usesRoles) {
            try {
              await replaceRoles.mutateAsync({ outreachId: outreach.id, roles: payload.roles });
            } catch (error) {
              console.warn(
                '[create-outreach] outreach saved but its roles did not:',
                error instanceof Error ? error.message : error
              );
              setRoleError(
                'The outreach was saved, but its roles could not be. Open it from the dashboard and set them again.'
              );
              return;
            }
          }

          // Written after the outreach exists, for the same reason the roles
          // are. Failing here is worth saying but not worth blocking on: the
          // event is real and correct, it just has no pictures yet, and the
          // editor can add them.
          if (state.galleryUrls.length > 0) {
            try {
              await addImages.mutateAsync({
                outreachId: outreach.id,
                urls: state.galleryUrls,
                startPosition: 0,
              });
            } catch (error) {
              console.warn(
                '[create-outreach] outreach saved but its gallery did not:',
                error instanceof Error ? error.message : error
              );
              setRoleError(
                'The outreach was published, but its gallery images could not be attached. Open it from the dashboard and add them again.'
              );
              return;
            }
          }

          setState(INITIAL_WIZARD_STATE);
          // No error state to clear any more — errors derive from `state`, and
          // resetting the state resets them. `attempted` goes back too, so a
          // fresh wizard does not open showing the last one's complaints.
          setAttempted({});
          setStep(1);
          // Straight to the new event's own screen rather than the dashboard,
          // carrying the confirmation with it. Publishing used to land on a
          // list with no acknowledgement at all, so the only way to find out
          // whether it had worked was to go looking for it.
          router.replace({
            pathname: '/(organisation)/outreach/[id]',
            params: { id: outreach.id, created: outreach.id },
          });
        },
      }
    );
  }

  if (!organisationId) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.notSignedIn}>You need to be signed in as an organisation to create an outreach.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={KEYBOARD_AVOID_BEHAVIOR}
      >
        <View style={styles.header}>
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={step === 1 ? 'Cancel' : 'Previous step'}
            hitSlop={12}
          >
            <MaterialCommunityIcons
              name={step === 1 ? 'close' : 'arrow-left'}
              size={22}
              color={colors.textPrimary}
            />
          </Pressable>
          <Text style={styles.headerTitle}>Create Outreach</Text>
          {step === TOTAL_STEPS ? (
            <Pressable
              onPress={() => setStep(1)}
              accessibilityRole="button"
              accessibilityLabel="Edit outreach details"
              hitSlop={12}
            >
              <Text style={styles.editLink}>Edit</Text>
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        <View style={styles.progressWrap}>
          <StepProgressBar step={step} total={TOTAL_STEPS} label={`STEP ${step} OF ${TOTAL_STEPS} · ${STEP_TITLES[step - 1]?.toUpperCase()}`} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.stepTitle}>{STEP_TITLES[step - 1]}</Text>

          {step === 1 ? (
            <View style={styles.fieldGroup}>
              <View onLayout={(event) => captureFieldTop('title', event)}>
                <Input
                  label="Campaign Title"
                  required
                  placeholder="e.g. Community Health Screening 2024"
                  value={state.title}
                  onChangeText={(text) => update('title', text)}
                  error={errors.title}
                  accessibilityLabel="Campaign title"
                />
              </View>
              <View onLayout={(event) => captureFieldTop('description', event)}>
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
              </View>

              <View>
                <Text style={styles.flyerLabel}>Flyer (optional)</Text>
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

              {/*
                A separate block below the flyer, not a fifth step: creation is
                already four screens and an optional extra would make the
                commonest path (no images at all) longer for no reason. Nothing
                here blocks Next.
              */}
              <GalleryEditor
                urls={state.galleryUrls}
                onAdd={handleAddGalleryImage}
                onRemove={handleRemoveGalleryImage}
                onMove={handleMoveGalleryImage}
                uploading={galleryUpload.isPending}
                max={MAX_GALLERY_IMAGES}
                error={galleryUpload.error ? humanError(galleryUpload.error) : null}
              />
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.fieldGroup}>
              <View onLayout={(event) => captureFieldTop('region', event)}>
                <SelectField
                  label="Region"
                  required
                  placeholder="Select a region"
                  value={state.region}
                  options={REGION_OPTIONS}
                  searchable
                  error={errors.region}
                  onSelect={(value) =>
                    setState((prev) => ({ ...prev, region: value, district: null }))
                  }
                />
              </View>
              <View onLayout={(event) => captureFieldTop('district', event)}>
                <SelectField
                  label="District"
                  required
                  placeholder="Select a district"
                  value={state.district}
                  options={districtOptions}
                  searchable
                  disabled={!state.region}
                  disabledHint="Select a region first."
                  error={errors.district}
                  onSelect={(value) => update('district', value)}
                />
              </View>
              <View onLayout={(event) => captureFieldTop('locationName', event)}>
                <Input
                  label="Location Name"
                  required
                  placeholder="e.g. Main Campus"
                  value={state.locationName}
                  onChangeText={(text) => update('locationName', text)}
                  error={errors.locationName}
                  accessibilityLabel="Venue name"
                />
              </View>
              {/*
                Native pickers rather than masked text entry: the organiser no
                longer types punctuation, and an impossible date like 2026-13-45
                is simply unreachable. They read and write the same
                'YYYY-MM-DD' / 'HH:MM' strings the validation and the Layer 1
                availability scorer already expect.
              */}
              {/*
                A LIST OF DAYS, not one date. Single-day is the one-entry case,
                so there is no mode to choose and nothing changes for the
                organisation running an ordinary one-day clinic.
              */}
              <View style={styles.daysSection} onLayout={(event) => captureFieldTop('date', event)}>
                <DayScheduleField
                  days={state.days}
                  onChange={(next) => update('days', next)}
                  eventStartTime={state.startTime}
                  eventEndTime={state.endTime}
                  error={errors.date}
                />
              </View>
              <Text style={styles.timesHint}>
                These are the hours for every day, unless you set different ones on a day above.
              </Text>
              <View style={styles.timeRow}>
                <View style={styles.timeField} onLayout={(event) => captureFieldTop('startTime', event)}>
                  <DateTimeField
                    label="Start Time"
                    required
                    mode="time"
                    value={state.startTime}
                    onChange={(next) => update('startTime', next)}
                    error={errors.startTime}
                    accessibilityLabel="Start time"
                  />
                </View>
                <View style={styles.timeField} onLayout={(event) => captureFieldTop('endTime', event)}>
                  <DateTimeField
                    label="End Time"
                    required
                    mode="time"
                    value={state.endTime}
                    onChange={(next) => update('endTime', next)}
                    error={errors.endTime}
                    accessibilityLabel="End time"
                  />
                </View>
              </View>
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.fieldGroup}>
              {/*
                READS THE DESCRIPTION THE ORGANISATION HAS ALREADY WRITTEN, so
                nobody is asked to describe the same event twice. Seventy-five
                skills across nine categories is more than anyone browses
                properly, and search only finds words already in the list --
                "breast cancer screening" finds nothing, while clinical breast
                examination, patient registration and health education all sit
                there unfound.

                The result is PREPENDED to the sections below, never swapped in
                for them. See suggestedSections.
              */}
              <SkillSuggestBox
                label="Not sure which skills to pick?"
                // TITLE AND DESCRIPTION, not description alone (owner, 2026-09-15:
                // "my outreach title was Mental Health Awareness and it returned
                // nothing"). The title is the most concentrated statement of what
                // an event is, and an organisation reasonably expects it to count.
                sourceText={[state.title, state.description].filter(Boolean).join('. ')}
                onSuggestions={setSuggestedSkills}
              />

              <View onLayout={(event) => captureFieldTop('requiredSkills', event)}>
                {/*
                  REQUIRED FOR CLINICAL, OPTIONAL FOR SUPPORT. The asterisk has
                  to follow the rule or it states something untrue, and the
                  placeholder says what happens when it is left empty -- an
                  organisation should not have to discover that by trying.
                */}
                <MultiSelectField
                  label="Required Skills"
                  required={clinical}
                  placeholder={
                    clinical
                      ? 'Select the skills volunteers need'
                      : 'Optional for support work'
                  }
                  selected={state.requiredSkills}
                  sections={suggestedSections}
                  error={errors.requiredSkills}
                  onChange={(next) => update('requiredSkills', next)}
                />
              </View>

              {/*
                ONE LIST, NO MODE. This was a toggle between "Any volunteers"
                and "Specific roles", each with its own controls — the
                database's two storage shapes surfaced as a choice the
                organisation had to make before they could describe anything.
                Needing one kind of volunteer is the one-role case, not a
                different mode. `toStoragePayload` decides which shape to write.
              */}
              <RoleBuilder roles={state.roles} onChange={(roles) => update('roles', roles)} />
              {errors.roles ? <Text style={styles.fieldError}>{errors.roles}</Text> : null}
            </View>
          ) : null}

          {step === TOTAL_STEPS ? (
            <View style={styles.fieldGroup}>
              <OutreachPreviewCard state={state} />
              {roleError ? <Text style={styles.submitError}>{roleError}</Text> : null}
              {createOutreach.isError ? (
                <Text style={styles.submitError}>
                  {humanError(createOutreach.error, 'Could not save this outreach. Please try again.')}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {/*
          THE FOOTER IS A SIBLING OF THE SCROLLER, so the scroll content's
          padding never protected it and the pill sat on top of Next. It only
          appeared when a text field was focused, because the keyboard lifts it.
        */}
        <View style={[styles.footer, tabBarFooter]}>
          {/*
            Named, above the button that refused to work. Scrolling to the field
            answers "where", and this answers "what" without the organisation
            having to find it — the two together are what replaced a button that
            simply did nothing.
          */}
          {stepSummary ? <Text style={styles.stepSummary}>{stepSummary}</Text> : null}
          {step < TOTAL_STEPS ? (
            <Button
              title={`Next: ${STEP_TITLES[step] ?? ''}`}
              onPress={handleNext}
              accessibilityLabel="Continue to next step"
            />
          ) : (
            <View style={styles.previewActions}>
              <Button
                title="Publish Outreach"
                onPress={() => handleSubmit('open')}
                disabled={createOutreach.isPending}
                accessibilityLabel="Publish outreach"
              />
              <Button
                title="Save as Draft"
                variant="text"
                onPress={() => handleSubmit('draft')}
                disabled={createOutreach.isPending}
                accessibilityLabel="Save as draft"
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
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
  notSignedIn: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.xl,
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
    fontSize: 15,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 22,
  },
  editLink: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.primary,
  },
  progressWrap: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  // Its own line above the action, with room on both sides: a warning packed
  // against a button reads as part of the button's label.
  stepSummary: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  stepTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textPrimary,
    marginVertical: spacing.base,
  },
  fieldGroup: {
    gap: spacing.lg,
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
  // The day list is a block of its own, not another field jammed into the
  // stack — it carries chips, two buttons and a summary line, and needs room to
  // read as one thing rather than as loose controls between the venue and the
  // times.
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
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surface,
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
  submitError: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.base,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  previewActions: {
    alignItems: 'center',
    gap: spacing.xs,
  },
});
