import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { formatEventTimeRange } from '@/components/ui';
import { dayEndTime, dayStartTime, formatDayShort } from '@/lib/outreachDays';
import type { OutreachDay } from '@/types/database';

export interface DayCommitmentPickerProps {
  days: readonly OutreachDay[];
  /** The outreach's own hours, which a day inherits unless it overrides them. */
  outreach: { start_time: string | null; end_time: string | null };
  /** Ids of the days currently selected. */
  selected: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/**
 * Which days of a multi-day outreach a volunteer is committing to.
 *
 * WHY THIS IS A COMMITMENT AND NOT A PREFERENCE. What is ticked here becomes
 * `application_days`, and that is the denominator every later judgement is
 * measured against: attendance is scored on days committed versus days
 * attended, never against the event's span. A student who ticks four Saturdays
 * of a month-long campaign and attends all four has a complete record — they
 * did exactly what they promised. The 22 days they did not tick are not
 * absences; they are not counted at all.
 *
 * That is also why the copy says "the days you can make" rather than anything
 * about availability or preference. Ticking a day is a promise, and a volunteer
 * should know that before they tick it.
 *
 * EVERYTHING STARTS TICKED. Most volunteers applying to a three-day clinic mean
 * all three, and an unticked default would turn the commonest case into work.
 * Un-ticking is the deliberate act, which is the right way round: choosing to
 * do less than the whole event is the thing worth stating.
 *
 * Not rendered at all for a one-day outreach. There is nothing to choose, and a
 * list of one is a control that does nothing — the application simply commits
 * to the only day, which is what a one-day event has always meant.
 */
export function DayCommitmentPicker({
  days,
  outreach,
  selected,
  onChange,
  disabled = false,
}: DayCommitmentPickerProps) {
  if (days.length <= 1) return null;

  const selectedSet = new Set(selected);
  const allSelected = days.every((day) => selectedSet.has(day.id));

  function toggle(dayId: string) {
    if (disabled) return;
    const next = new Set(selectedSet);
    if (next.has(dayId)) next.delete(dayId);
    else next.add(dayId);
    // Kept in the event's own order rather than tap order, so the commitment
    // reads chronologically wherever it is shown afterwards.
    onChange(days.filter((day) => next.has(day.id)).map((day) => day.id));
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Which days can you make?</Text>
        <Pressable
          onPress={() => onChange(allSelected ? [] : days.map((day) => day.id))}
          disabled={disabled}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={allSelected ? 'Clear all days' : 'Select every day'}
        >
          <Text style={styles.toggleAll}>{allSelected ? 'Clear all' : 'Select all'}</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>
        This runs over {days.length} days. Tick only the ones you can attend — you are counted
        against the days you pick and nothing else.
      </Text>

      <View style={styles.list}>
        {days.map((day, index) => {
          const isSelected = selectedSet.has(day.id);
          const hours = formatEventTimeRange(
            dayStartTime(day, outreach),
            dayEndTime(day, outreach)
          );
          return (
            <Pressable
              key={day.id}
              onPress={() => toggle(day.id)}
              disabled={disabled}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected, disabled }}
              accessibilityLabel={`Day ${index + 1}, ${formatDayShort(day.day)}`}
              style={[styles.row, isSelected && styles.rowSelected, disabled && styles.rowDisabled]}
            >
              <MaterialCommunityIcons
                name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={20}
                color={isSelected ? colors.primary : colors.textSecondary}
              />
              <View style={styles.rowText}>
                <Text style={styles.rowDay}>
                  Day {index + 1} · {formatDayShort(day.day)}
                </Text>
                {hours ? <Text style={styles.rowHours}>{hours}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {selected.length === 0 ? (
        <Text style={styles.warning}>
          Pick at least one day. An application with no days is not something the organisation can
          act on.
        </Text>
      ) : (
        <Text style={styles.summary}>
          You are committing to {selected.length} of {days.length} days.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // A card of its own with real space around it. This is a promise the
  // volunteer is making, not a field to squeeze between two others.
  container: {
    marginTop: spacing.lg,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',

    // alignItems centres children within their line; alignContent places

    // the line itself, and defaults to flex-start. Without it a wrapping row

    // pins its single line to the TOP of the box.

    alignContent: 'center',
    justifyContent: 'space-between',
    // Wraps instead of clipping when the row outgrows its width at a large
    // system font size. rowGap only applies between wrapped lines, so a row
    // that still fits on one is unaffected.
    flexWrap: 'wrap',
    rowGap: 4,
    gap: spacing.md,
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  toggleAll: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  list: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  rowSelected: {
    borderColor: colors.primary,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowDay: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowHours: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  summary: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  warning: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
