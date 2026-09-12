import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { formatEventTimeRange, parseCalendarDate } from '@/components/ui/dateUtils';
import { DateTimeField } from '@/components/ui/DateTimeField';
import {
  MAX_OUTREACH_DAYS,
  dayStringsOf,
  formatDayShort,
  formatDaySpan,
  hasOwnHours,
  inheritedDay,
  nextDayAfter,
  sortDayDrafts,
  todayIso,
  type OutreachDayDraft,
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
  /** Every day the outreach runs on, each with its own hours. May be empty while the form is new. */
  days: OutreachDayDraft[];
  onChange: (next: OutreachDayDraft[]) => void;
  /**
   * The event's own hours, 'HH:MM', shown as what a day inherits when it sets
   * none of its own. Empty while the organisation has not chosen them yet.
   */
  eventStartTime?: string;
  eventEndTime?: string;
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
 * PER-DAY HOURS ARE OPT-IN AND HIDDEN UNTIL ASKED FOR. `outreach_days`
 * .start_time/.end_time have always meant "override the event's hours", with
 * NULL meaning inherit; until now nothing could set them. The obvious build —
 * a start and an end picker on every chip — was rejected: on a twenty-day
 * campaign it is forty controls for a case that almost never arises, and it
 * pushes every organisation to fill in hours they had no intention of varying.
 *
 * So a day is a chip until it is tapped, and tapping one opens a single panel
 * for that day alone. The panel names the hours it will inherit, so the
 * ordinary answer is visible without being editable by accident, and clearing
 * an override is one button rather than blanking two fields.
 */
export function DayScheduleField({
  days,
  onChange,
  eventStartTime = '',
  eventEndTime = '',
  error,
  minimumToday = true,
  lockedDays = [],
}: DayScheduleFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  /** Which day's hours panel is open, by date. Null when none is. */
  const [openDay, setOpenDay] = useState<string | null>(null);

  const sorted = sortDayDrafts(days);
  const dayStrings = dayStringsOf(days);
  const atCap = sorted.length >= MAX_OUTREACH_DAYS;
  const nextDay = nextDayAfter(dayStrings);
  const editing = sorted.find((draft) => draft.day === openDay) ?? null;

  function addDay(day: string) {
    if (dayStrings.includes(day)) {
      // Named rather than silently ignored: pressing "add" and seeing nothing
      // happen reads as a broken button.
      setDuplicate(day);
      return;
    }
    setDuplicate(null);
    onChange(sortDayDrafts([...sorted, inheritedDay(day)]));
  }

  function removeDay(day: string) {
    setDuplicate(null);
    // The panel closes with the day it belongs to, or it would go on editing
    // hours for a day that is no longer on the list.
    if (openDay === day) setOpenDay(null);
    onChange(sorted.filter((existing) => existing.day !== day));
  }

  /** Replaces one day's hours in place, leaving every other day untouched. */
  function setHours(day: string, startTime: string | null, endTime: string | null) {
    onChange(
      sorted.map((draft) => (draft.day === day ? { day, startTime, endTime } : draft))
    );
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
          {sorted.map((draft, index) => {
            const day = draft.day;
            const locked = lockedDays.includes(day);
            const own = hasOwnHours(draft);
            const isOpen = openDay === day;
            return (
              <View
                key={day}
                style={[
                  styles.chip,
                  locked && styles.chipLocked,
                  isOpen && styles.chipOpen,
                ]}
              >
                <Text style={styles.chipIndex}>{index + 1}</Text>
                {/*
                  The label itself is the control that opens the hours panel.
                  Deliberately NOT the whole chip: the remove cross sits inside
                  it, and a parent Pressable wrapping a child Pressable makes a
                  mis-tap on the cross open the panel instead of removing the
                  day.
                */}
                <Pressable
                  onPress={() => setOpenDay(isOpen ? null : day)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isOpen
                      ? `Close hours for ${formatDayShort(day)}`
                      : `Set hours for ${formatDayShort(day)}`
                  }
                  style={styles.chipLabelPress}
                >
                  <Text style={styles.chipLabel}>{formatDayShort(day)}</Text>
                  {own ? (
                    <MaterialCommunityIcons
                      name="clock-outline"
                      size={13}
                      color={colors.primary}
                    />
                  ) : null}
                </Pressable>
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

      {sorted.length > 0 && !editing ? (
        <Text style={styles.hoursHint}>
          Every day runs to the event&apos;s hours. Tap a day if one of them runs to different
          ones.
        </Text>
      ) : null}

      {editing ? (
        <View style={styles.hoursPanel}>
          <View style={styles.hoursHeader}>
            <Text style={styles.hoursTitle}>{formatDayShort(editing.day)}</Text>
            <Pressable
              onPress={() => setOpenDay(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <MaterialCommunityIcons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.hoursInherited}>
            {hasOwnHours(editing)
              ? 'This day runs to its own hours.'
              : `This day runs to the event's hours${
                  inheritedLabel(eventStartTime, eventEndTime)
                    ? ` — ${inheritedLabel(eventStartTime, eventEndTime)}`
                    : ''
                }. Set a start or an end below only if it differs.`}
          </Text>

          <View style={styles.hoursFields}>
            <View style={styles.hoursField}>
              <DateTimeField
                label="Starts"
                mode="time"
                value={editing.startTime ?? ''}
                onChange={(next) => setHours(editing.day, next || null, editing.endTime)}
                placeholder={eventStartTime ? formatEventTimeRange(eventStartTime, null) ?? 'Event hours' : 'Event hours'}
                accessibilityLabel={`Start time for ${formatDayShort(editing.day)}`}
              />
            </View>
            <View style={styles.hoursField}>
              <DateTimeField
                label="Ends"
                mode="time"
                value={editing.endTime ?? ''}
                onChange={(next) => setHours(editing.day, editing.startTime, next || null)}
                placeholder={eventEndTime ? formatEventTimeRange(eventEndTime, null) ?? 'Event hours' : 'Event hours'}
                accessibilityLabel={`End time for ${formatDayShort(editing.day)}`}
              />
            </View>
          </View>

          {hasOwnHours(editing) ? (
            <Pressable
              onPress={() => setHours(editing.day, null, null)}
              accessibilityRole="button"
              accessibilityLabel={`Use the event's hours for ${formatDayShort(editing.day)}`}
              style={styles.hoursClear}
            >
              <MaterialCommunityIcons name="undo-variant" size={15} color={colors.textPrimary} />
              <Text style={styles.hoursClearLabel}>Use the event&apos;s hours</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

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

      {sorted.length > 1 ? <Text style={styles.summary}>{formatDaySpan(dayStrings)}</Text> : null}

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

/**
 * The event's own hours as one readable range, or empty when it has none yet.
 *
 * Empty is an ordinary state on the create form, where the days are picked
 * before the times. The panel then simply does not name what would be
 * inherited, rather than saying "inherits —".
 */
function inheritedLabel(start: string, end: string): string {
  if (!start && !end) return '';
  return formatEventTimeRange(start || null, end || null) ?? '';
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
  chipOpen: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  chipLabelPress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
  hoursHint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  hoursPanel: {
    marginTop: spacing.base,
    marginBottom: spacing.xs,
    padding: spacing.base,
    gap: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  hoursHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Wraps instead of clipping when the row outgrows its width at a large
    // system font size. rowGap only applies between wrapped lines, so a row
    // that still fits on one is unaffected.
    flexWrap: 'wrap',
    rowGap: 4,
  },
  hoursTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  hoursInherited: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  hoursFields: {
    flexDirection: 'row',
    gap: spacing.base,
  },
  hoursField: {
    flex: 1,
  },
  hoursClear: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  hoursClearLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
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
