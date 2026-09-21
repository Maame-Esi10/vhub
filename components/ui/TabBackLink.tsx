import { Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, spacing } from '@/constants/theme';

export interface TabBackLinkProps {
  /** What to call the place being returned to, e.g. "Notifications". */
  label?: string;
}

/**
 * A way back OUT of a tab screen that was reached from somewhere else.
 *
 * WHY THIS IS NEEDED AT ALL (owner, 2026-09-21: "Back from an opened
 * notification takes me to Home, not back to Notifications").
 *
 * `ScreenHeader` already solves this for PUSHED screens: it takes a `from`
 * param and replaces to it, because `router.back()` inside a tab group unwinds
 * the TAB history and lands on the group's first tab. But the applications
 * tracker and the applicant queue are tabs themselves and have no ScreenHeader
 * -- they carry their own large title -- so a notification that routes to one
 * of them had nothing to go back with, and the hardware back button did the
 * very thing ScreenHeader exists to prevent.
 *
 * RENDERS NOTHING WITHOUT A `from` PARAM. Reaching Applications by tapping the
 * Applications tab is not "coming from" anywhere, and a back link on a tab you
 * selected deliberately is noise. It appears only on the journey that needs
 * it.
 *
 * `replace`, not `back()`, for exactly the reason in ScreenHeader's docstring.
 */
export function TabBackLink({ label = 'Back' }: TabBackLinkProps) {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();

  if (!from) return null;

  return (
    <Pressable
      onPress={() => router.replace(from as Parameters<typeof router.replace>[0])}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      hitSlop={12}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name="chevron-left" size={18} color={colors.textSecondary} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    minHeight: 32,
    marginBottom: spacing.xs,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
