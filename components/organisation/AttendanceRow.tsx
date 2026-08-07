import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { VOLUNTEER_CATEGORIES } from '@/constants/categories';
import { isPresent, needsAction } from '@/lib/attendance';
import type { Attendance, VolunteerCategory } from '@/types/database';

/**
 * One volunteer on the post-event roster.
 *
 * Layout follows design-refs/Mark Attendance.png — avatar, name, role caption,
 * pill action at the trailing edge — but the ACTION IS INVERTED from that
 * design, per the owner decision of 2026-08-05. The Figma screen is opt-in
 * ("Mark Present" on every row, twelve taps for twelve volunteers); this is
 * exception-based, so everyone reads as present and the organiser only touches
 * the people who did not turn up. Effort scales with the number of ABSENCES,
 * not the number of volunteers, and a well-attended event needs no work at all.
 */

const CATEGORY_LABEL = new Map<VolunteerCategory, string>(
  VOLUNTEER_CATEGORIES.map((entry) => [entry.value, entry.label])
);

interface StatusPresentation {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tint: string;
}

/**
 * What is KNOWN about this volunteer, which is not the same question as
 * whether they count as present.
 *
 * A row with no attendance record is the ordinary case, not a gap: it means
 * nobody scanned and nobody has said otherwise. It still reads as present, and
 * the wording says "no scan" rather than anything that sounds like an
 * accusation.
 */
function statusFor(attendance: Attendance | undefined): StatusPresentation {
  if (attendance?.organiser_status === 'absent') {
    return { label: 'Marked absent', icon: 'account-cancel-outline', tint: colors.danger };
  }
  if (attendance?.organiser_status === 'present') {
    return { label: 'Marked present', icon: 'account-check-outline', tint: colors.success };
  }
  if (attendance?.checked_in_at) {
    // 'mismatch' is shown HERE and only here. The volunteer is never told —
    // it is a prompt for the organiser, who was at the venue and can simply
    // look up and check, not an accusation to put in front of someone whose
    // GPS may be confused.
    if (attendance.location_check === 'mismatch') {
      return { label: 'Scanned, location differs', icon: 'map-marker-question-outline', tint: colors.warning };
    }
    if (attendance.location_check === 'confirmed') {
      return { label: 'Checked in at venue', icon: 'qrcode-scan', tint: colors.success };
    }
    return { label: 'Checked in', icon: 'qrcode-scan', tint: colors.textSecondary };
  }
  return { label: 'No scan', icon: 'minus-circle-outline', tint: colors.textSecondary };
}

export interface AttendanceRowProps {
  name: string;
  avatarUrl: string | null;
  category: VolunteerCategory | null;
  /** Undefined when the volunteer has no attendance row at all — the common case. */
  attendance: Attendance | undefined;
  onToggle: () => void;
  isPending: boolean;
}

export function AttendanceRow({
  name,
  avatarUrl,
  category,
  attendance,
  onToggle,
  isPending,
}: AttendanceRowProps) {
  const present = isPresent(attendance);
  const status = statusFor(attendance);
  const unresolved = needsAction(attendance);

  return (
    <View style={[styles.row, !present && styles.rowAbsent, unresolved && styles.rowNeedsAction]}>
      <Avatar name={name} uri={avatarUrl} size={40} />

      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.category} numberOfLines={1}>
          {category ? (CATEGORY_LABEL.get(category) ?? 'Volunteer') : 'Volunteer'}
        </Text>
        <View style={styles.statusRow}>
          <MaterialCommunityIcons name={status.icon} size={12} color={status.tint} />
          <Text style={[styles.status, { color: status.tint }]} numberOfLines={1}>
            {status.label}
          </Text>
        </View>
      </View>

      {/*
        One button, and it always states the CHANGE it will make rather than
        the current state — "Mark absent" on someone counted present. A toggle
        that shows its current value invites the organiser to tap the row that
        already says what they want.
      */}
      <Pressable
        onPress={onToggle}
        disabled={isPending}
        accessibilityRole="button"
        accessibilityLabel={present ? `Mark ${name} absent` : `Mark ${name} present`}
        hitSlop={6}
        style={({ pressed }) => [
          styles.action,
          present ? styles.actionAbsent : styles.actionPresent,
          pressed && styles.pressed,
          isPending && styles.pressed,
        ]}
      >
        {isPending ? (
          <ActivityIndicator size="small" color={present ? colors.danger : colors.white} />
        ) : (
          <Text style={[styles.actionLabel, present ? styles.actionLabelAbsent : styles.actionLabelPresent]}>
            {present ? 'Mark absent' : 'Mark present'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    marginBottom: spacing.sm,
  },
  /** Absent is the exception, so it is the only state that changes the row's fill. */
  rowAbsent: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  rowNeedsAction: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  category: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  status: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
  action: {
    minHeight: 36,
    minWidth: 104,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  actionAbsent: {
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  actionPresent: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  actionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
  },
  actionLabelAbsent: {
    color: colors.textPrimary,
  },
  actionLabelPresent: {
    color: colors.white,
  },
  pressed: {
    opacity: 0.75,
  },
});
