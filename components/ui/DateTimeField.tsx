import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { formatEventDate, formatEventTime, parseCalendarDate, parseClockTime } from './dateUtils';

export type DateTimeFieldMode = 'date' | 'time';

export interface DateTimeFieldProps {
  label: string;
  mode: DateTimeFieldMode;
  /** 'YYYY-MM-DD' in date mode, 'HH:MM' (24h) in time mode. '' when unset. */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  error?: string;
  /** Renders a red asterisk beside the label. */
  required?: boolean;
  /** Date mode only: blocks days before today, since outreaches are future events. */
  minimumToday?: boolean;
  accessibilityLabel?: string;
}

/**
 * Native calendar / clock picker that reads and writes the SAME string
 * formats the app already stores and parses — 'YYYY-MM-DD' for dates and
 * 'HH:MM' 24-hour for times.
 *
 * That contract matters: `outreaches.date` is a Postgres `date` and
 * `start_time`/`end_time` are `time`, and lib/matching/layer1.ts derives an
 * event's weekday and morning/afternoon/evening slots from exactly these
 * strings. Handing the picker's Date object straight through would introduce
 * timezone drift into the availability component of the match score, so the
 * conversion is pinned to local calendar fields here and never goes via
 * toISOString().
 *
 * Replaces a masked text input where the organiser typed the punctuation by
 * hand and could enter 2026-13-45.
 */
export function DateTimeField({
  label,
  required,
  mode,
  value,
  onChange,
  placeholder,
  error,
  minimumToday = false,
  accessibilityLabel,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);

  const display = value
    ? mode === 'date'
      ? (formatEventDate(value) ?? value)
      : (formatEventTime(value) ?? value)
    : (placeholder ?? (mode === 'date' ? 'Select a date' : 'Select a time'));

  function handleChange(event: DateTimePickerEvent, picked?: Date) {
    // Android fires 'dismissed' on cancel; iOS keeps the spinner open until
    // the field is tapped away, so it closes on any event there.
    if (Platform.OS === 'android') {
      setOpen(false);
    }
    if (event.type === 'dismissed' || !picked) {
      return;
    }
    onChange(mode === 'date' ? toDateString(picked) : toTimeString(picked));
    if (Platform.OS === 'ios') {
      setOpen(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${label}: ${value || 'not set'}`}
        style={[styles.field, !!error && styles.fieldError]}
      >
        <MaterialCommunityIcons
          name={mode === 'date' ? 'calendar-blank-outline' : 'clock-outline'}
          size={18}
          color={colors.textSecondary}
        />
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {display}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {open ? (
        <DateTimePicker
          mode={mode}
          value={toInitialDate(value, mode)}
          onChange={handleChange}
          minimumDate={mode === 'date' && minimumToday ? startOfToday() : undefined}
          is24Hour
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

function toTimeString(date: Date): string {
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes}`;
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/** Seeds the picker from the current value, falling back to now when unset or unparseable. */
function toInitialDate(value: string, mode: DateTimeFieldMode): Date {
  const base = new Date();
  if (!value) {
    return base;
  }
  if (mode === 'date') {
    const parsed = parseCalendarDate(value);
    return parsed ? new Date(parsed.year, parsed.month - 1, parsed.day) : base;
  }
  const parsed = parseClockTime(value);
  if (parsed) {
    base.setHours(parsed.hours, parsed.minutes, 0, 0);
  }
  return base;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  // The asterisk carries the "you must fill this in" signal, so the message
  // below the field can be one short line about what is wrong.
  requiredMark: {
    color: colors.danger,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.base,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  fieldError: {
    borderColor: colors.danger,
  },
  value: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  placeholder: {
    color: colors.textSecondary,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
