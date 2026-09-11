import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NumberStepper } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { EXPERIENCE_LEVELS, ROLE_TYPES, VOLUNTEER_CATEGORIES } from '@/constants/categories';
import type { RoleDraft } from '@/components/organisation/outreachWizard';
import type { ExperienceLevel, OutreachRoleType, VolunteerCategory } from '@/types/database';

export interface RoleBuilderProps {
  roles: RoleDraft[];
  onChange: (roles: RoleDraft[]) => void;
  /**
   * Places already taken, keyed `category|experience` ('any' for either when
   * unset). A role's places can be raised but never cut below the volunteers
   * already accepted into it. Omitted while creating, where nothing is filled.
   */
  filledByKey?: Map<string, number>;
}

const ANY = 'any' as const;

/** The key used by the uniqueness rule, the database's unique index, and `filledByKey`. */
export function roleKey(role: Pick<RoleDraft, 'category' | 'minExperienceLevel'>): string {
  return `${role.category ?? ANY}|${role.minExperienceLevel ?? ANY}`;
}

/**
 * The outreach's staffing, as one list of roles.
 *
 * THERE IS NO MODE HERE ANY MORE. This used to sit behind an "Any volunteers /
 * Specific roles" toggle, with a separate set of controls on the other side
 * doing almost the same job — two ways to describe one thing, and a concept
 * the organisation had to learn before they could describe either. Needing one
 * kind of volunteer is now simply a list with one role in it, and needing
 * three is the same list with three.
 *
 * Every role is edited in place. The old version could only add a role or
 * change its slot count; changing a category meant deleting the role and
 * building it again from a separate "Add a role" form.
 *
 * The uniqueness rule is enforced here as well as in the database, because the
 * database's answer is a unique-violation error and this one is an inline
 * sentence. The key is (category, experience level), so "1 experienced nurse"
 * and "4 nurses of any level" remain two legitimate roles — that pairing is
 * exactly why the constraint includes experience.
 *
 * The total is shown but never entered: it is the sum of the roles, derived by
 * trigger in the database, so a separate total field would be a second source
 * of truth the database would overwrite.
 */
export function RoleBuilder({ roles, onChange, filledByKey }: RoleBuilderProps) {
  const totalSlots = roles.reduce((sum, role) => sum + role.slotsTotal, 0);
  const multiple = roles.length > 1;

  function updateRole(index: number, patch: Partial<RoleDraft>) {
    onChange(roles.map((role, i) => (i === index ? { ...role, ...patch } : role)));
  }

  function removeRole(index: number) {
    onChange(roles.filter((_, i) => i !== index));
  }

  function addRole() {
    // Seeded from nothing in particular: a support role of any level, which is
    // the least presumptuous starting point. The organisation picks the
    // profession, which is the field they came here to set.
    onChange([
      ...roles,
      { category: null, roleType: 'support', minExperienceLevel: null, slotsTotal: 2 },
    ]);
  }

  /** Is this role a duplicate of an earlier one? Only the later one is flagged. */
  function duplicateOf(index: number): boolean {
    const role = roles[index];
    if (!role) return false;
    return roles.slice(0, index).some((earlier) => roleKey(earlier) === roleKey(role));
  }

  return (
    <View style={styles.wrap}>
      {roles.map((role, index) => {
        const filled = filledByKey?.get(roleKey(role)) ?? 0;
        const duplicate = duplicateOf(index);

        return (
          <View key={index} style={styles.roleCard}>
            <View style={styles.roleHeader}>
              <Text style={styles.roleIndex}>
                {multiple ? `Role ${index + 1}` : 'Who do you need?'}
              </Text>
              {/*
                A role can only be removed while there is another one to fall
                back on. An outreach with no roles at all cannot be saved, and
                removing the last one would leave the form in a state whose
                only exit is an error message.
              */}
              {multiple ? (
                <Pressable
                  onPress={() => removeRole(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove role ${index + 1}`}
                  hitSlop={10}
                >
                  <MaterialCommunityIcons name="close" size={18} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.fieldLabel}>Profession</Text>
            <View style={styles.chipRow}>
              {/*
                "Any profession" is only offered while this is the ONLY role.
                It maps to `required_category = null` on the outreach itself,
                which has no equivalent once there are child rows to write —
                so offering it on a second role would be offering something the
                database cannot store.
              */}
              {!multiple ? (
                <Chip
                  label="Any profession"
                  selected={role.category === null}
                  onPress={() => updateRole(index, { category: null, minExperienceLevel: null })}
                />
              ) : null}
              {VOLUNTEER_CATEGORIES.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={role.category === option.value}
                  onPress={() =>
                    updateRole(index, {
                      category: option.value as VolunteerCategory,
                    })
                  }
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Role type</Text>
            <View style={styles.chipRow}>
              {ROLE_TYPES.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={role.roleType === option.value}
                  onPress={() => updateRole(index, { roleType: option.value as OutreachRoleType })}
                />
              ))}
            </View>

            {/*
              Hidden for a category-less single role: an experience floor has
              to live on an outreach_roles row, and that row needs a category.
              Offering it here would let the form reach a state validateRoles
              then refuses.
            */}
            {role.category ? (
              <>
                <Text style={styles.fieldLabel}>Minimum experience</Text>
                <View style={styles.chipRow}>
                  <Chip
                    label="Any level"
                    selected={role.minExperienceLevel === null}
                    onPress={() => updateRole(index, { minExperienceLevel: null })}
                  />
                  {EXPERIENCE_LEVELS.map((option) => (
                    <Chip
                      key={option.value}
                      label={`${option.label} or above`}
                      selected={role.minExperienceLevel === option.value}
                      onPress={() =>
                        updateRole(index, { minExperienceLevel: option.value as ExperienceLevel })
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}

            <NumberStepper
              label="Volunteers needed"
              value={role.slotsTotal}
              onChange={(value) => updateRole(index, { slotsTotal: value })}
              min={Math.max(1, filled)}
              max={500}
            />

            {filled > 0 ? (
              <Text style={styles.note}>
                {filled} {filled === 1 ? 'place is' : 'places are'} already taken, so this cannot go
                lower.
              </Text>
            ) : null}

            {duplicate ? (
              <Text style={styles.problem}>
                This is the same profession and experience level as a role above. Change one of
                them, or combine the two.
              </Text>
            ) : null}

            {/*
              Stated per role, because the verification gate is per role: a
              clinical role needs a verified volunteer, a support role on the
              same event does not.
            */}
            {role.roleType === 'clinical' ? (
              <View style={styles.gateNote}>
                <MaterialCommunityIcons
                  name="shield-check-outline"
                  size={13}
                  color={colors.textSecondary}
                />
                <Text style={styles.gateNoteText}>
                  Only verified volunteers can apply for this role.
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}

      {multiple ? (
        <Text style={styles.total}>
          {totalSlots} {totalSlots === 1 ? 'volunteer' : 'volunteers'} across {roles.length} roles.
          The event total is added up from these.
        </Text>
      ) : null}

      <Pressable
        onPress={addRole}
        accessibilityRole="button"
        accessibilityLabel="Add another role"
        style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="plus" size={18} color={colors.primary} />
        <Text style={styles.addRowText}>Add another role</Text>
      </Pressable>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  roleIndex: {
    flex: 1,
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
  note: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  problem: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
  },
  total: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
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
