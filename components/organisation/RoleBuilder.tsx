import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NumberStepper } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { EXPERIENCE_LEVELS, ROLE_TYPES, VOLUNTEER_CATEGORIES } from '@/constants/categories';
import type { RoleDraft } from '@/components/organisation/outreachWizard';
import type { ExperienceLevel, OutreachRoleType, VolunteerCategory } from '@/types/database';

export interface RoleBuilderProps {
  roles: RoleDraft[];
  onChange: (roles: RoleDraft[]) => void;
}

const ANY_LEVEL = 'any' as const;

/**
 * Builds the per-category role slots of a multi-role outreach — "2 doctors,
 * 3 nurses, 5 students".
 *
 * The uniqueness rule is enforced HERE as well as in the database, because the
 * database's answer is a unique-violation error and this one is a disabled
 * button with a reason. The key is (category, experience level), so "1
 * experienced nurse" and "4 nurses of any level" are two legitimate rows — that
 * pairing is exactly why the constraint includes experience.
 *
 * Total slots are shown but never entered: the outreach's total is the sum of
 * its roles and is derived by trigger, so a separate total field would be a
 * second source of truth that the database would silently overwrite.
 */
export function RoleBuilder({ roles, onChange }: RoleBuilderProps) {
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<VolunteerCategory | null>(null);
  const [roleType, setRoleType] = useState<OutreachRoleType>('support');
  const [minLevel, setMinLevel] = useState<ExperienceLevel | typeof ANY_LEVEL>(ANY_LEVEL);
  const [slots, setSlots] = useState(2);

  const totalSlots = roles.reduce((sum, role) => sum + role.slotsTotal, 0);

  const duplicate =
    category !== null &&
    roles.some(
      (role) =>
        role.category === category &&
        (role.minExperienceLevel ?? ANY_LEVEL) === minLevel
    );

  function resetForm() {
    setAdding(false);
    setCategory(null);
    setRoleType('support');
    setMinLevel(ANY_LEVEL);
    setSlots(2);
  }

  function addRole() {
    if (!category || duplicate) return;
    onChange([
      ...roles,
      {
        category,
        roleType,
        minExperienceLevel: minLevel === ANY_LEVEL ? null : minLevel,
        slotsTotal: slots,
      },
    ]);
    resetForm();
  }

  function updateSlots(index: number, value: number) {
    onChange(roles.map((role, i) => (i === index ? { ...role, slotsTotal: value } : role)));
  }

  function removeRole(index: number) {
    onChange(roles.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.wrap}>
      {roles.map((role, index) => {
        const categoryLabel =
          VOLUNTEER_CATEGORIES.find((c) => c.value === role.category)?.label ?? role.category;
        const levelLabel = role.minExperienceLevel
          ? `${EXPERIENCE_LEVELS.find((e) => e.value === role.minExperienceLevel)?.label ?? role.minExperienceLevel} or above`
          : 'Any level';

        return (
          <View key={`${role.category}-${role.minExperienceLevel ?? ANY_LEVEL}`} style={styles.roleCard}>
            <View style={styles.roleHeader}>
              <View style={styles.roleTitleBlock}>
                <Text style={styles.roleTitle}>{categoryLabel}</Text>
                <Text style={styles.roleMeta}>
                  {role.roleType === 'clinical' ? 'Clinical' : 'Support'} · {levelLabel}
                </Text>
              </View>
              <Pressable
                onPress={() => removeRole(index)}
                accessibilityRole="button"
                accessibilityLabel={`Remove the ${categoryLabel} role`}
                hitSlop={10}
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            <NumberStepper
              label="Volunteers needed"
              value={role.slotsTotal}
              onChange={(value) => updateSlots(index, value)}
              min={1}
              max={500}
            />

            {/*
              Stated per role, because the verification gate is now per role:
              a clinical role needs a verified volunteer, a support role on the
              same event does not.
            */}
            {role.roleType === 'clinical' ? (
              <View style={styles.gateNote}>
                <MaterialCommunityIcons name="shield-check-outline" size={13} color={colors.textSecondary} />
                <Text style={styles.gateNoteText}>Only verified volunteers can apply for this role.</Text>
              </View>
            ) : null}
          </View>
        );
      })}

      {roles.length > 0 ? (
        <Text style={styles.total}>
          {totalSlots} {totalSlots === 1 ? 'volunteer' : 'volunteers'} across {roles.length}{' '}
          {roles.length === 1 ? 'role' : 'roles'}
        </Text>
      ) : null}

      {adding ? (
        <View style={styles.addCard}>
          <Text style={styles.addTitle}>Add a role</Text>

          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.chipRow}>
            {VOLUNTEER_CATEGORIES.map((option) => {
              const selected = category === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setCategory(selected ? null : option.value)}
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

          <Text style={styles.fieldLabel}>Role type</Text>
          <View style={styles.chipRow}>
            {ROLE_TYPES.map((option) => {
              const selected = roleType === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setRoleType(option.value)}
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

          <Text style={styles.fieldLabel}>Minimum experience</Text>
          <View style={styles.chipRow}>
            {([{ value: ANY_LEVEL, label: 'Any level' }, ...EXPERIENCE_LEVELS] as const).map((option) => {
              const selected = minLevel === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setMinLevel(option.value as ExperienceLevel | typeof ANY_LEVEL)}
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

          <NumberStepper label="Volunteers needed" value={slots} onChange={setSlots} min={1} max={500} />

          {duplicate ? (
            <Text style={styles.duplicate}>
              You already have this category at this experience level. Change the level, or edit the
              existing role instead.
            </Text>
          ) : null}

          <View style={styles.addActions}>
            <Pressable
              onPress={resetForm}
              accessibilityRole="button"
              accessibilityLabel="Cancel adding a role"
              style={[styles.actionButton, styles.cancelButton]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={addRole}
              disabled={!category || duplicate}
              accessibilityRole="button"
              accessibilityLabel="Add this role"
              style={[
                styles.actionButton,
                styles.confirmButton,
                (!category || duplicate) && styles.actionDisabled,
              ]}
            >
              <Text style={styles.confirmText}>Add role</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          accessibilityLabel="Add a role"
          style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="plus" size={18} color={colors.primary} />
          <Text style={styles.addRowText}>{roles.length === 0 ? 'Add a role' : 'Add another role'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.base,
  },
  roleCard: {
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  roleTitleBlock: {
    flex: 1,
  },
  roleTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  roleMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  gateNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  gateNoteText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  total: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  addCard: {
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  addTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  fieldLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipSelected: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.white,
  },
  duplicate: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
  },
  addActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  confirmButton: {
    backgroundColor: colors.navy,
  },
  confirmText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.white,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  addRowText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  pressed: {
    opacity: 0.85,
  },
});
