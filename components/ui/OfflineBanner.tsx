import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsOnline } from '@/lib/offline';
import { colors, fontFamily, spacing } from '@/constants/theme';

/**
 * A slim bar pinned to the bottom of every screen while the device is offline.
 *
 * Bottom rather than top: the top edge already carries each screen's own header
 * and the OS status bar, and a banner there pushes content down and reflows the
 * layout every time signal drops. The bottom edge is free on scrolling screens,
 * and this sits above the tab bar's safe-area inset so it never covers a tab.
 *
 * Rendered once in the root layout. Per-screen banners were the alternative and
 * would have meant remembering it on every data screen -- and missing it on the
 * ones added later.
 */
export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (online) return null;

  return (
    <Pressable
      onPress={() => router.push('/offline')}
      accessibilityRole="button"
      accessibilityLabel="You are offline. Tap to see what is available offline."
      // Announced by screen readers the moment it appears, rather than only
      // when focus happens to reach it.
      accessibilityLiveRegion="polite"
      style={({ pressed }) => [
        styles.banner,
        { paddingBottom: spacing.sm + insets.bottom },
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons name="cloud-off-outline" size={16} color={colors.white} />
      <Text style={styles.label}>You&apos;re offline — showing saved data</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.navy,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.white,
  },
});
