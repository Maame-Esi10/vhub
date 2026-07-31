import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface ScreenHeaderProps {
  title: string;
  /** Overrides the default `router.back()`. */
  onBack?: () => void;
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
 * Falls back to a hard `replace` when there is nothing to pop: a screen
 * reached by deep link or by a `replace` has an empty history, and calling
 * `back()` there does nothing at all, which is the same dead end.
 */
export function ScreenHeader({ title, onBack, trailing }: ScreenHeaderProps) {
  const router = useRouter();

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
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
