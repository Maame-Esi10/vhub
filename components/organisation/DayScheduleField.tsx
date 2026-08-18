import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { parseCalendarDate } from '@/components/ui/dateUtils';
import {
  MAX_OUTREACH_DAYS,
  formatDayShort,
  formatDaySpan,
  nextDayAfter,
  sortDayStrings,
  todayIso,
} from '@/lib/outreachDays';

/**
 * NATIVE MODULE INSIDE, so this file is deliberately NOT exported from
 * components/organisation/index.ts. It imports
 * @react-native-community/datetimepicker, and that barrel is imported by the
 * dashboard, the applicant list, the attendance screen and the review screen —
 * none of which need a calendar. Re-exporting it would evaluate the native
 * module on every one of those screens, so on a dev client built before the
 * picker was added they would all lose their default export rather than just
 * the two that use it. Same rule as DateTimeField: import it directly.
 *   import { DayScheduleField } from '@/components/organisation/DayScheduleField';
 */

export interface DayScheduleFieldProps {
  /** Every day the outreach runs on, `YYYY-MM-DD`. May be empty while the form is new. */
  days: string[];
  onChange: (next: string[]) => void;
  error?: string;
  /**
   * False when EDITING, where a day already in the past is an ordinary thing to
   * see — the same relaxation `validateOutreachEdit` makes.
   */
  minimumToday?: boolean;
  /**
   * Days that already have volunteers committed to them. Shown without a remove
   * control, because the database refuses to delete them: a commitment is the
   * evidence a V-Score is derived from, and cascading it away silently is
   * exactly what must not happen.
   */
  lockedDays?: readonly string[];
}

/**
 * The days an outreach runs on, as one list the organisation adds to and takes
 * from.
 *
 * NO "MULTI-DAY" SWITCH, deliberately, and this is the same argument as the
 * role builder's. An outreach that runs on one day is not a different kind of
 * event from one that runs on four; it is the one-day case of the same list.
 * A toggle would make the organisation choose a storage mode before describing
 * their event.
 *
 * TWO WAYS TO ADD A DAY, because the two real shapes need different gestures:
 * a clinic running Thursday to Saturday is three taps of "Add the next day",
 * while four Saturdays across a month need the calendar each time. Generating a
 * range from a start and an end was considered and rejected — it produces every
 * day in between, which is wrong for the scattered case and is the more common
 * of the two here.
 *
 * There is no per-day time control. `outreach_days.start_time`/`end_time` exist
 * and mean "override the event's hours", but nothing yet needs them and a
 * per-day time picker on a 20-row list would be a screen of its own. Left NULL,
 * every day inherits the outreach's hours, which is what an organisation
 * running the same clinic each morning means.
 */
export function DayScheduleField({
  days,
  onChange,
  error,
  minimumToday = true,
  lockedDays = [],
}: DayScheduleFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [duplicate, setDuplicate] = useState<string | null>(null);

  const sorted = sortDayStrings(days);
  const atCap = sorted.length >= MAX_OUTREACH_DAYS;
  const nextDay = nextDayAfter(sorted);

  function addDay(day: string) {
    if (sorted.includes(day)) {
      // Named rather than silently ignored: pressing "add" and seeing nothing
      // happen reads as a broken button.
      setDuplicate(day);
      return;
    }
    setDuplicate(null);
    onChange(sortDayStrings([...sorted, day]));
  }

  function removeDay(day: string) {
    setDuplicate(null);
    onChange(sorted.filter((existing) => existing !== day));
  }

  function handlePicked(event: DateTimePickerEvent, picked?: Date) {
    if (Platform.OS === 'android') {
      setPickerOpen(false);
    }
    if (event.type === 'dismissed' || !picked) return;
    addDay(toDateString(picked));
    if (Platform.OS === 'ios') {
      setPickerOpen(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Days</Text>
      <Text style={styles.hint}>
        Most outreaches run on one day. Add more if yours runs over several — volunteers then
        choose which of them they can make.
      </Text>

      {sorted.length > 0 ? (
        <View style={styles.chips}>
          {sorted.map((day, index) => {
            const locked = lockedDays.includes(day);
            return (
              <View key={day} style={[styles.chip, locked && styles.chipLocked]}>
                <Text style={styles.chipIndex}>{index + 1}</Text>
                <Text style={styles.chipLabel}>{formatDayShort(day)}</Text>
                {locked ? (
                  <MaterialCommunityIcons name="lock-outline" size={14} color={colors.textSecondary} />
                ) : (
                  <Pressable
                    onPress={() => removeDay(day)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${formatDayShort(day)}`}
                  >
                    <MaterialCommunityIcons name="close" size={14} color={colors.textSecondary} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.empty}>No days picked yet.</Text>
      )}

      <View style={styles.actions}>
        <Pressable
          onPress={() => setPickerOpen(true)}
          disabled={atCap}
          accessibilityRole="button"
          accessibilityLabel="Pick a day from the calendar"
          style={[styles.action, atCap && styles.actionDisabled]}
        >
          <MaterialCommunityIcons
            name="calendar-plus"
            size={16}
            color={atCap ? colors.textSecondary : colors.textPrimary}
          />
          <Text style={[styles.actionLabel, atCap && styles.actionLabelDisabled]}>
            {sorted.length === 0 ? 'Pick a day' : 'Add another day'}
          </Text>
        </Pressable>

        {nextDay && !atCap ? (
          <Pressable
            onPress={() => addDay(nextDay)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${formatDayShort(nextDay)}`}
            style={styles.action}
          >
            <MaterialCommunityIcons name="plus" size={16} color={colors.textPrimary} />
            <Text style={styles.actionLabel}>Add {formatDayShort(nextDay)}</Text>
          </Pressable>
        ) : null}
      </View>

      {sorted.length > 1 ? <Text style={styles.summary}>{formatDaySpan(sorted)}</Text> : null}

      {lockedDays.length > 0 ? (
        <Text style={styles.lockedNote}>
          Days marked with a padlock already have volunteers committed to them and cannot be
          removed. A day nobody attends simply does not count, so leaving it in place costs
          nothing.
        </Text>
      ) : null}

      {duplicate ? (
        <Text style={styles.error}>{formatDayShort(duplicate)} is already on the list.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {pickerOpen ? (
        <DateTimePicker
          mode="date"
          value={seedDate(nextDay)}
          onChange={handlePicked}
          minimumDate={minimumToday ? startOfToday() : undefined}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        />
      ) : null}
    </View>
  );
}

/** Local calendar fields, never toISOString() — that would shift the day in +/- UTC zones. */
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/** Opens the calendar on the day after the last one chosen, which is nearly always the one wanted. */
function seedDate(suggestion: string | null): Date {
  const parsed = parseCalendarDate(suggestion ?? todayIso());
  return parsed ? new Date(parsed.year, parsed.month - 1, parsed.day) : new Date();
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: spacing.sm,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipLocked: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipIndex: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: colors.textSecondary,
  },
  chipLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  actionLabelDisabled: {
    color: colors.textSecondary,
  },
  summary: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  lockedNote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
