import { useEffect, useMemo, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Input,
  ListSkeleton,
  MultiSelectField,
  NumberStepper,
  SelectField,
} from '@/components/ui';
// Imported directly, not via the barrel: this pulls in a native module, and
// routing it through '@/components/ui' would crash every screen on a dev
// client that hasn't been rebuilt. See the note in components/ui/index.ts.
import { DateTimeField } from '@/components/ui/DateTimeField';
import type { SelectOption } from '@/components/ui';
import {
  RoleBuilder,
  hasWizardErrors,
  rolesChanged,
  validateOutreachEdit,
  wizardStateFromOutreach,
} from '@/components/organisation';
import type { OutreachWizardState, WizardFieldError } from '@/components/organisation';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { GHANA_REGIONS } from '@/constants/ghana-locations';
import { SKILL_CATEGORIES } from '@/constants/skills';
import { ROLE_TYPES, VOLUNTEER_CATEGORIES } from '@/constants/categories';
import {
  useOutreach,
  useOutreachApplications,
  useOutreachRoles,
  useReplaceOutreachRoles,
  useUpdateOutreach,
} from '@/hooks';
// Direct import, not the hooks barrel: this reaches the native picker
// modules. See the note in lib/cloudinary.ts.
import { useFlyerUpload } from '@/hooks/useMediaUpload';
import { useAuthStore } from '@/stores/authStore';

const REGION_OPTIONS: SelectOption[] = GHANA_REGIONS.map((r) => ({ value: r.name, label: r.name }));
const SKILL_SECTIONS = SKILL_CATEGORIES.map((c) => ({ title: c.name, data: c.skills }));

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
  const { id } = useLocalSearchParams<{ id: string }>();
  const outreachId = typeof id === 'string' ? id : undefined;
  const organisationId = useAuthStore((s) => s.user)?.id;

  const outreachQuery = useOutreach(outreachId);
  const rolesQuery = useOutreachRoles(outreachId);
  const applicationsQuery = useOutreachApplications(outreachId);
  const updateOutreach = useUpdateOutreach();
  const replaceRoles = useReplaceOutreachRoles();
  const flyerUpload = useFlyerUpload();

  const [state, setState] = useState<OutreachWizardState | null>(null);
  const [errors, setErrors] = useState<WizardFieldError>({});
  const [slotsFloorError, setSlotsFloorError] = useState<string | null>(null);
  const [roleWarning, setRoleWarning] = useState(false);

  const outreach = outreachQuery.data;
  const storedRoles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);

  // Hydrate once both queries have answered. Roles resolving to an empty array
  // is a real answer (single-role mode), so the form must wait for the query
  // to SETTLE rather than for the array to be non-empty — hydrating early
  // would open a multi-role outreach on the "Any volunteers" side and quietly
  // delete its roles on save.
  const ready = !!outreach && !rolesQuery.isPending;
  useEffect(() => {
    if (!ready || state !== null || !outreach) return;
    setState(wizardStateFromOutreach(outreach, storedRoles));
  }, [ready, state, outreach, storedRoles]);

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
      map.set(`${role.category}|${role.min_experience_level ?? 'any'}`, role.slots_filled);
    }
    return map;
  }, [storedRoles]);

  const liveApplicationCount = (applicationsQuery.data ?? []).filter(
    (application) => application.status !== 'cancelled'
  ).length;

  function update<K extends keyof OutreachWizardState>(key: K, value: OutreachWizardState[K]) {
    setState((prev) => (prev ? { ...prev, [key]: value } : prev));
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

  if (outreachQuery.isPending || !state) {
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

  const usingRoles = state.roles.length > 0;
  const districtOptions: SelectOption[] =
    GHANA_REGIONS.find((r) => r.name === state.region)?.districts.map((d) => ({
      value: d,
      label: d,
    })) ?? [];

  const roleListChanged = rolesChanged(storedRoleDrafts, state.roles);
  const totalFromRoles = state.roles.reduce((sum, role) => sum + role.slotsTotal, 0);

  /**
   * Places can never fall below the volunteers already accepted — the database
   * enforces `slots_filled <= slots_total` as a check constraint, and in
   * multi-role mode the same rule applies per role. Caught here so the
   * organisation gets a sentence naming the role rather than a constraint
   * violation on save.
   */
  function findSlotsFloorProblem(form: OutreachWizardState): string | null {
    if (form.roles.length === 0) {
      if (form.slotsTotal < outreach!.slots_filled) {
        return `You have already accepted ${outreach!.slots_filled} volunteer${
          outreach!.slots_filled === 1 ? '' : 's'
        }, so you cannot drop below ${outreach!.slots_filled} place${
          outreach!.slots_filled === 1 ? '' : 's'
        }.`;
      }
      return null;
    }

    for (const role of form.roles) {
      const filled = filledByRoleKey.get(`${role.category}|${role.minExperienceLevel ?? 'any'}`) ?? 0;
      if (role.slotsTotal < filled) {
        const label =
          VOLUNTEER_CATEGORIES.find((c) => c.value === role.category)?.label ?? role.category;
        return `The ${label} role already has ${filled} accepted, so it cannot drop below ${filled} place${
          filled === 1 ? '' : 's'
        }.`;
      }
    }

    // A role that has been REMOVED entirely, but had people in it. The
    // delete-then-insert rewrite would orphan their role link, so it is worth
    // naming rather than letting the confirmation dialog cover it vaguely.
    for (const role of storedRoles) {
      if (role.slots_filled === 0) continue;
      const stillThere = form.roles.some(
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

    const nextErrors = validateOutreachEdit(state, outreach.date);
    setErrors(nextErrors);
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

    save();
  }

  function save() {
    if (!state || !outreach || !organisationId) return;
    setRoleWarning(false);

    const usesRoles = state.roles.length > 0;

    updateOutreach.mutate(
      {
        outreachId: outreach.id,
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
        // Derived in multi-role mode, exactly as on create: role_type
        // summarises to 'clinical' if any role is, the total is the sum of the
        // roles, and both are maintained by trigger. required_category has no
        // single answer once there are several.
        requiredCategory: usesRoles ? null : state.requiredCategory,
        roleType: usesRoles ? null : state.roleType,
        ...(usesRoles ? {} : { slotsTotal: state.slotsTotal }),
        flyerUrl: state.flyerUrl,
      },
      {
        onSuccess: async () => {
          // Only when they actually differ. An unchanged list would otherwise
          // be deleted and reinserted on every save, which would drop the role
          // link off every application for no reason at all.
          if (roleListChanged) {
            try {
              await replaceRoles.mutateAsync({ outreachId: outreach.id, roles: state.roles });
            } catch {
              // Surfaced, not swallowed: the outreach body saved but the
              // staffing did not, and those two disagreeing is exactly the
              // state the organisation needs to know about.
              return;
            }
          }
          router.replace(`/(organisation)/outreach/${outreach.id}`);
        },
      }
    );
  }

  const saving = updateOutreach.isPending || replaceRoles.isPending;
  const saveError = updateOutreach.isError
    ? updateOutreach.error instanceof Error
      ? updateOutreach.error.message
      : 'Could not save your changes. Please try again.'
    : replaceRoles.isError
      ? replaceRoles.error instanceof Error
        ? `The details saved, but the roles did not: ${replaceRoles.error.message}`
        : 'The details saved, but the roles did not. Try saving again.'
      : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* ---------- Details ---------- */}
          <Text style={styles.sectionLabel}>DETAILS</Text>
          <View style={styles.section}>
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
                <Text style={styles.flyerError}>{flyerUpload.error.message}</Text>
              ) : null}
            </View>
          </View>

          {/* ---------- Where and when ---------- */}
          <Text style={styles.sectionLabel}>WHERE &amp; WHEN</Text>
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
              picker to today would make its own date unreachable. Moving the
              date INTO the past is still refused by validateOutreachEdit.
            */}
            <DateTimeField
              label="Event Date"
              mode="date"
              value={state.date}
              onChange={(next) => update('date', next)}
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

          {/* ---------- Who they need ---------- */}
          <Text style={styles.sectionLabel}>WHO YOU NEED</Text>
          <View style={styles.section}>
            <MultiSelectField
              label="Required Skills"
              placeholder="Select the skills volunteers need"
              selected={state.requiredSkills}
              sections={SKILL_SECTIONS}
              onChange={(next) => update('requiredSkills', next)}
            />

            <Text style={styles.chipLabel}>Who do you need?</Text>
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => update('roles', [])}
                accessibilityRole="button"
                accessibilityLabel="Any volunteers"
                accessibilityState={{ selected: !usingRoles }}
                style={[styles.chip, !usingRoles && styles.chipSelected]}
              >
                <Text style={[styles.chipText, !usingRoles && styles.chipTextSelected]}>
                  Any volunteers
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  update(
                    'roles',
                    // Restores what was there if they toggled away by accident,
                    // rather than seeding a stranger's default over their real
                    // staffing plan.
                    storedRoleDrafts.length > 0
                      ? storedRoleDrafts
                      : [
                          {
                            category: 'nurse',
                            roleType: 'clinical',
                            minExperienceLevel: null,
                            slotsTotal: 2,
                          },
                        ]
                  )
                }
                accessibilityRole="button"
                accessibilityLabel="Specific roles"
                accessibilityState={{ selected: usingRoles }}
                style={[styles.chip, usingRoles && styles.chipSelected]}
              >
                <Text style={[styles.chipText, usingRoles && styles.chipTextSelected]}>
                  Specific roles
                </Text>
              </Pressable>
            </View>

            {usingRoles ? (
              <>
                <RoleBuilder roles={state.roles} onChange={(roles) => update('roles', roles)} />
                <Text style={styles.derivedNote}>
                  This event will hold {totalFromRoles} {totalFromRoles === 1 ? 'place' : 'places'} in
                  total, added up from the roles above.
                </Text>
              </>
            ) : (
              <>
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
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {option.label}
                        </Text>
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
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <NumberStepper
                  label="How many volunteers?"
                  value={state.slotsTotal}
                  onChange={(value) => update('slotsTotal', value)}
                  min={Math.max(1, outreach.slots_filled)}
                  max={500}
                  error={errors.slotsTotal}
                />
                {outreach.slots_filled > 0 ? (
                  <Text style={styles.derivedNote}>
                    {outreach.slots_filled} {outreach.slots_filled === 1 ? 'place is' : 'places are'}{' '}
                    already taken by accepted volunteers.
                  </Text>
                ) : null}
              </>
            )}
          </View>

          {slotsFloorError ? <Text style={styles.saveError}>{slotsFloorError}</Text> : null}
          {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
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
        onConfirm={save}
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
  derivedNote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  saveError: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
