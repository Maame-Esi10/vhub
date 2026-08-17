import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import type { SelectOption } from '@/components/ui';
import {
  GalleryEditor,
  INITIAL_WIZARD_STATE,
  OutreachPreviewCard,
  RoleBuilder,
  hasWizardErrors,
  swapAdjacent,
  toStoragePayload,
  validateWizard,
} from '@/components/organisation';
import type { OutreachWizardState, WizardFieldError } from '@/components/organisation';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { GHANA_REGIONS } from '@/constants/ghana-locations';
import { SKILL_CATEGORIES } from '@/constants/skills';
import {
  MAX_GALLERY_IMAGES,
  useAddOutreachImages,
  useCreateOutreach,
  useReplaceOutreachRoles,
} from '@/hooks';
// Direct import, not the hooks barrel: this reaches the native picker
// modules. See the note in lib/cloudinary.ts.
import { useFlyerUpload, useGalleryImageUpload } from '@/hooks/useMediaUpload';
import { useAuthStore } from '@/stores/authStore';

const TOTAL_STEPS = 4;
const STEP_TITLES = ['Basic Information', 'Where & When', 'Requirements & Capacity', 'Preview'];

const REGION_OPTIONS: SelectOption[] = GHANA_REGIONS.map((r) => ({ value: r.name, label: r.name }));
const SKILL_SECTIONS = SKILL_CATEGORIES.map((c) => ({ title: c.name, data: c.skills }));

export default function CreateOutreach() {
  const router = useRouter();
  const organisationId = useAuthStore((s) => s.user)?.id;
  const createOutreach = useCreateOutreach();
  const replaceRoles = useReplaceOutreachRoles();
  const flyerUpload = useFlyerUpload();
  const galleryUpload = useGalleryImageUpload();
  const addImages = useAddOutreachImages();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<OutreachWizardState>(INITIAL_WIZARD_STATE);
  const [errors, setErrors] = useState<WizardFieldError>({});
  const [roleError, setRoleError] = useState<string | null>(null);

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
    galleryUpload.mutate(undefined, {
      onSuccess: (result) => {
        if (!result) return;
        setState((prev) => ({ ...prev, galleryUrls: [...prev.galleryUrls, result.secureUrl] }));
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

  function handleNext() {
    const nextErrors = validateWizard(state);
    setErrors(nextErrors);
    if (step === 1 && nextErrors.title) return;
    if (step === 2 && (nextErrors.date || nextErrors.startTime || nextErrors.endTime)) return;
    if (step === 3 && nextErrors.roles) return;
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  function jumpToOffendingStep(fieldErrors: WizardFieldError) {
    if (fieldErrors.title) {
      setStep(1);
    } else if (fieldErrors.date || fieldErrors.startTime || fieldErrors.endTime) {
      setStep(2);
    } else if (fieldErrors.roles) {
      setStep(3);
    }
  }

  function handleSubmit(status: 'draft' | 'open') {
    if (!organisationId) return;
    const finalErrors = validateWizard(state);
    setErrors(finalErrors);
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

    createOutreach.mutate(
      {
        organisationId,
        title: state.title.trim(),
        description: state.description.trim() ? state.description.trim() : null,
        date: state.date,
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
          setErrors({});
          setStep(1);
          router.replace('/(organisation)/dashboard');
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.stepTitle}>{STEP_TITLES[step - 1]}</Text>

          {step === 1 ? (
            <View style={styles.fieldGroup}>
              <Input
                label="Campaign Title"
                placeholder="e.g. Community Health Screening 2024"
                value={state.title}
                onChangeText={(text) => update('title', text)}
                error={errors.title}
                accessibilityLabel="Campaign title"
              />
              <Input
                label="Program Description"
                placeholder="Goals and target audience..."
                value={state.description}
                onChangeText={(text) => update('description', text)}
                multiline
                accessibilityLabel="Program description"
              />

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
                  <Text style={styles.flyerError}>{flyerUpload.error.message}</Text>
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
                error={galleryUpload.error ? galleryUpload.error.message : null}
              />
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.fieldGroup}>
              <SelectField
                label="Region"
                placeholder="Select a region"
                value={state.region}
                options={REGION_OPTIONS}
                searchable
                onSelect={(value) => setState((prev) => ({ ...prev, region: value, district: null }))}
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
                Native pickers rather than masked text entry: the organiser no
                longer types punctuation, and an impossible date like 2026-13-45
                is simply unreachable. They read and write the same
                'YYYY-MM-DD' / 'HH:MM' strings the validation and the Layer 1
                availability scorer already expect.
              */}
              <DateTimeField
                label="Event Date"
                mode="date"
                value={state.date}
                onChange={(next) => update('date', next)}
                minimumToday
                error={errors.date}
                accessibilityLabel="Event date"
              />
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
          ) : null}

          {step === 3 ? (
            <View style={styles.fieldGroup}>
              <MultiSelectField
                label="Required Skills"
                placeholder="Select the skills volunteers need"
                selected={state.requiredSkills}
                sections={SKILL_SECTIONS}
                onChange={(next) => update('requiredSkills', next)}
              />

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
                  {createOutreach.error instanceof Error
                    ? createOutreach.error.message
                    : 'Could not save this outreach. Please try again.'}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
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
