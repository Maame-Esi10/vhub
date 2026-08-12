import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { EXPERIENCE_LEVELS, VOLUNTEER_CATEGORIES } from '@/constants/categories';
import { meetsMinimumExperience } from '@/lib/matching/multiRole';
import type { ExperienceLevel, OutreachRole } from '@/types/database';

export interface RolePickerProps {
  roles: OutreachRole[];
  selectedRoleId: string | null;
  onSelect: (roleId: string) => void;
  /** The volunteer's own experience, for the "below the minimum" note. */
  volunteerExperience: ExperienceLevel | null;
  /** Whether the volunteer's identity is verified — gates clinical roles. */
  isVerified: boolean;
  /** Roles are not selectable once the volunteer has applied. */
  disabled?: boolean;
}

/**
 * The roles of a multi-role outreach, and which one the volunteer is applying
 * for.
 *
 * THE POINT OF THE WHOLE FEATURE IS VISIBLE HERE: the verification gate is per
 * ROLE, not per outreach. An event badged clinical because it needs nurses
 * still shows its support roles as open to an unverified volunteer, instead of
 * locking them out of an event they could genuinely help with.
 *
 * A full role is shown and disabled rather than hidden — a volunteer should be
 * able to see that a role exists and is taken, not be left wondering why the
 * event mentions nurses and offers none.
 *
 * Being below a role's minimum experience does NOT disable it. The floor is
 * the organisation's stated preference, and they decide; the volunteer is told
 * plainly so they are not applying blind.
 */
export function RolePicker({
  roles,
  selectedRoleId,
  onSelect,
  volunteerExperience,
  isVerified,
  disabled = false,
}: RolePickerProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>WHICH ROLE?</Text>

      {roles.map((role) => {
        const categoryLabel =
          VOLUNTEER_CATEGORIES.find((c) => c.value === role.category)?.label ?? role.category;
        const placesLeft = Math.max(0, role.slots_total - role.slots_filled);
        const isFull = placesLeft === 0;
        const needsVerification = role.role_type === 'clinical' && !isVerified;
        const belowMinimum = !meetsMinimumExperience(volunteerExperience, role.min_experience_level);
        const blocked = isFull || needsVerification || disabled;
        const selected = selectedRoleId === role.id;

        return (
          <Pressable
            key={role.id}
            onPress={() => !blocked && onSelect(role.id)}
            disabled={blocked}
            accessibilityRole="radio"
            accessibilityLabel={`${categoryLabel}, ${placesLeft} of ${role.slots_total} places left`}
            accessibilityState={{ selected, disabled: blocked }}
            style={[styles.role, selected && styles.roleSelected, blocked && styles.roleBlocked]}
          >
            <View style={styles.roleTop}>
              <View style={styles.radio}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={styles.roleTitle}>{categoryLabel}</Text>
              <Text style={[styles.places, isFull && styles.placesFull]}>
                {isFull ? 'Full' : `${placesLeft} left`}
              </Text>
            </View>

            <Text style={styles.roleMeta}>
              {role.role_type === 'clinical' ? 'Clinical' : 'Support'}
              {role.min_experience_level
                ? ` · ${EXPERIENCE_LEVELS.find((e) => e.value === role.min_experience_level)?.label} or above`
                : ' · Any experience level'}
            </Text>

            {needsVerification ? (
              <View style={styles.note}>
                <MaterialCommunityIcons name="shield-alert-outline" size={13} color={colors.warning} />
                <Text style={styles.noteText}>
                  This is a clinical role — verify your identity to apply for it.
                </Text>
              </View>
            ) : null}

            {!needsVerification && belowMinimum ? (
              <View style={styles.note}>
                <MaterialCommunityIcons name="information-outline" size={13} color={colors.textSecondary} />
                <Text style={styles.noteText}>
                  The organisation is asking for more experience than your profile shows. You can
                  still apply — they decide.
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  heading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.textSecondary,
  },
  role: {
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    gap: spacing.xs,
  },
  roleSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  roleBlocked: {
    opacity: 0.6,
  },
  roleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  roleTitle: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  places: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.success,
  },
  placesFull: {
    color: colors.textSecondary,
  },
  roleMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 26,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginLeft: 26,
    marginTop: 2,
  },
  noteText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
});
