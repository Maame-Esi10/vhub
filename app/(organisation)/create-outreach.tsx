import { useState } from 'react';
import {
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
  NumberStepper,
  SelectField,
  StepProgressBar,
  DateTimeField,
} from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import {
  INITIAL_WIZARD_STATE,
  OutreachPreviewCard,
  hasWizardErrors,
  validateWizard,
} from '@/components/organisation';
import type { OutreachWizardState, WizardFieldError } from '@/components/organisation';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { GHANA_REGIONS } from '@/constants/ghana-locations';
import { SKILL_CATEGORIES } from '@/constants/skills';
import { ROLE_TYPES, VOLUNTEER_CATEGORIES } from '@/constants/categories';
import { useCreateOutreach } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';

const TOTAL_STEPS = 4;
const STEP_TITLES = ['Basic Information', 'Where & When', 'Requirements & Capacity', 'Preview'];

const REGION_OPTIONS: SelectOption[] = GHANA_REGIONS.map((r) => ({ value: r.name, label: r.name }));
const SKILL_SECTIONS = SKILL_CATEGORIES.map((c) => ({ title: c.name, data: c.skills }));

export default function CreateOutreach() {
  const router = useRouter();
  const organisationId = useAuthStore((s) => s.user)?.id;
  const createOutreach = useCreateOutreach();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<OutreachWizardState>(INITIAL_WIZARD_STATE);
  const [errors, setErrors] = useState<WizardFieldError>({});

  function update<K extends keyof OutreachWizardState>(key: K, value: OutreachWizardState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
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
    if (step === 3 && nextErrors.slotsTotal) return;
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  function jumpToOffendingStep(fieldErrors: WizardFieldError) {
    if (fieldErrors.title) {
      setStep(1);
    } else if (fieldErrors.date || fieldErrors.startTime || fieldErrors.endTime) {
      setStep(2);
    } else if (fieldErrors.slotsTotal) {
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
        requiredCategory: state.requiredCategory,
        roleType: state.roleType,
        slotsTotal: state.slotsTotal,
        status,
      },
      {
        onSuccess: () => {
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

              <Text style={styles.chipLabel}>Required Category</Text>
              <View style={styles.chipRow}>
                {VOLUNTEER_CATEGORIES.map((option) => {
                  const selected = state.requiredCategory === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => update('requiredCategory', selected ? null : option.value)}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected }}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.chipLabel}>Role Type</Text>
              <View style={styles.chipRow}>
                {ROLE_TYPES.map((option) => {
                  const selected = state.roleType === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => update('roleType', selected ? null : option.value)}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected }}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <NumberStepper
                label="How many volunteers?"
                value={state.slotsTotal}
                onChange={(value) => update('slotsTotal', value)}
                min={1}
                max={500}
                error={errors.slotsTotal}
              />
            </View>
          ) : null}

          {step === TOTAL_STEPS ? (
            <View style={styles.fieldGroup}>
              <OutreachPreviewCard state={state} />
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
