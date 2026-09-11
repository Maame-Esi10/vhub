import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface ScreenHeaderProps {
  title: string;
  /** Overrides the default `router.back()`. */
  onBack?: () => void;
  /**
   * Where back goes. REQUIRED for any screen inside a tab group: reaching one
   * is a tab switch rather than a push, so `back()` unwinds the tab history
   * and lands on the group's FIRST tab (Home) instead of the screen the user
   * came from. Point this at that screen.
   *
   * A screen with several entry points should instead be navigated to with a
   * `from` query param (`router.push('/x?from=/(volunteer)/search')`), which
   * takes precedence over this.
   */
  fallback: Parameters<ReturnType<typeof useRouter>['replace']>[0];
  /** Optional control rendered at the trailing edge, e.g. a settings gear. */
  trailing?: ReactNode;
}

/**
 * Circular back button + title, used by every pushed (non-tab) screen.
 *
 * Pushed screens have no tab bar to navigate away with, so one of these is
 * the only way out — the Info Hub shipped without it and stranded users on
 * the screen.
 *
 * Navigates with `replace`, never `back()`. Every screen using this header
 * lives inside a tab group, where reaching a hidden (`href: null`) screen is a
 * tab switch rather than a push. `back()` therefore unwinds the TAB history
 * and lands on the group's first tab — Home — regardless of where the user
 * actually came from. That produced the reported "back goes Home" on Identity
 * Verification, the Info Hub and Edit Profile alike.
 *
 * Destination is `from` (a query param, for screens with several entry points)
 * falling back to the `fallback` prop.
 */
export function ScreenHeader({ title, onBack, fallback, trailing }: ScreenHeaderProps) {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }
    // `router.back()` is deliberately NOT used, despite there being history to
    // pop. Every screen using this header lives inside a tab group, where
    // reaching it is a tab switch rather than a push -- so back() unwinds the
    // TAB history and lands on the group's first tab (Home), not on the screen
    // the user actually came from. That was reported on Identity
    // Verification, the Info Hub and Edit Profile alike, and the shared cause
    // is this one line.
    //
    // `from` wins when supplied, for screens with more than one entry point;
    // `fallback` is the single sensible origin otherwise.
    router.replace((from as ScreenHeaderProps['fallback']) ?? fallback);
  }

  return (
    <View style={styles.header}>
      <Pressable
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="arrow-left" size={20} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {trailing ?? <View style={styles.trailingSpacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  /** Keeps the title optically centred when there is no trailing control. */
  trailingSpacer: {
    width: 40,
  },
});
