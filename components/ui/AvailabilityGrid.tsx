import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

const DAYS = [
  { token: 'mon', label: 'MON' },
  { token: 'tue', label: 'TUE' },
  { token: 'wed', label: 'WED' },
  { token: 'thu', label: 'THU' },
  { token: 'fri', label: 'FRI' },
  { token: 'sat', label: 'SAT' },
  { token: 'sun', label: 'SUN' },
] as const;

const SLOTS = [
  { token: 'morning', label: 'AM' },
  { token: 'afternoon', label: 'PM' },
  { token: 'evening', label: 'EVE' },
] as const;

export interface AvailabilityGridProps {
  /** Composite `{day}_{slot}` tokens, e.g. "sat_evening". */
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * Weekly availability picker matching design-refs/Edit Profile.png: one
 * horizontally-scrolling column per day, each holding stacked AM/PM/EVE
 * toggles that gain a coral border and a check icon when selected.
 *
 * Emits the composite `"{day}_{slot}"` tokens that volunteer_profiles
 * .availability_slots stores and lib/matching/layer1.ts scores against, so
 * the day and slot vocabularies here must stay in step with that scorer.
 *
 * (The onboarding wizard's step 4 renders the same data as a compact
 * slots-as-rows grid — a different layout for a different context, both
 * writing the identical token format.)
 */
export function AvailabilityGrid({ value, onChange }: AvailabilityGridProps) {
  const selected = new Set(value);

  function toggle(day: string, slot: string) {
    const key = `${day}_${slot}`;
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(Array.from(next));
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroller}
      >
        {DAYS.map((day) => (
          <View key={day.token} style={styles.dayColumn}>
            <Text style={styles.dayLabel}>{day.label}</Text>
            <View style={styles.slotStack}>
              {SLOTS.map((slot) => {
                const active = selected.has(`${day.token}_${slot.token}`);
                return (
                  <Pressable
                    key={slot.token}
                    onPress={() => toggle(day.token, slot.token)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`${day.label} ${slot.label}`}
                    style={[styles.slot, active && styles.slotActive]}
                  >
                    <Text style={[styles.slotLabel, active && styles.slotLabelActive]}>
                      {slot.label}
                    </Text>
                    {active ? (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={14}
                        color={colors.primary}
                      />
                    ) : (
                      <View style={styles.slotDot} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      <Text style={styles.hint}>Toggle time slots to update your routine scheduling.</Text>
    </>
  );
}

const styles = StyleSheet.create({
  scroller: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dayColumn: {
    alignItems: 'center',
    width: 68,
  },
  dayLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  slotStack: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  slot: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: spacing.sm,
  },
  slotActive: {
    backgroundColor: colors.background,
    borderColor: colors.primary,
  },
  slotLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  slotLabelActive: {
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  /** Placeholder keeping unselected slots the same height as selected ones. */
  slotDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
