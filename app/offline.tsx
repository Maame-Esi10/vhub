import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ui';
import { useIsOnline } from '@/lib/offline';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

/**
 * The offline screen from design-refs/Offline State.png.
 *
 * The design's own resource list ("Saved Prescriptions", "Emergency Contacts",
 * "Lab Reports") is generic health-app filler -- V-HUB has no such features.
 * The layout, iconography and copy structure are kept exactly; the rows are
 * remapped to the three things this app genuinely holds on device, which is
 * the allowlist in lib/offline.ts: cached outreaches, the user's own
 * notification history, and the fully static Info Hub.
 *
 * Deliberately NOT listed: My Applications. Its query is not persisted (it
 * carries applicant contact details on the organisation side), so offering it
 * here would promise something that shows an empty screen on a cold start.
 */

interface OfflineResource {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  fg: string;
  bg: string;
  title: string;
  subtitle: string;
  href: string;
}

const VOLUNTEER_RESOURCES: OfflineResource[] = [
  {
    icon: 'compass-outline',
    fg: colors.warning,
    bg: '#FDF0DC',
    title: 'Browse saved outreaches',
    subtitle: 'The feed as it looked when you were last online',
    href: '/(volunteer)/feed',
  },
  {
    icon: 'bell-outline',
    fg: colors.primary,
    bg: '#FFECEC',
    title: 'Read your notifications',
    subtitle: 'Matches and decisions already delivered',
    href: '/(volunteer)/notifications',
  },
  {
    icon: 'book-open-outline',
    fg: '#3B82F6',
    bg: '#E4EDFD',
    title: 'Open the Info Hub',
    subtitle: 'How matching and your V-Score work',
    href: '/(volunteer)/info-hub',
  },
];

const ORGANISATION_RESOURCES: OfflineResource[] = [
  {
    icon: 'clipboard-text-outline',
    fg: colors.warning,
    bg: '#FDF0DC',
    title: 'Review your outreaches',
    subtitle: 'Your listings as they were last loaded',
    href: '/(organisation)/dashboard',
  },
  {
    icon: 'book-open-outline',
    fg: '#3B82F6',
    bg: '#E4EDFD',
    title: 'Open the Info Hub',
    subtitle: 'How matching and V-Scores work',
    href: '/(organisation)/info-hub',
  },
];

export default function Offline() {
  const router = useRouter();
  const online = useIsOnline();
  const role = useAuthStore((state) => state.role);
  const [rechecking, setRechecking] = useState(false);

  const resources = role === 'organisation' ? ORGANISATION_RESOURCES : VOLUNTEER_RESOURCES;
  const homeHref = role === 'organisation' ? '/(organisation)/dashboard' : '/(volunteer)/feed';

  /**
   * NetInfo caches its last known state, so a plain read can answer from
   * before the user walked back into signal. `refresh()` forces a fresh probe,
   * which is what makes this button do something a user could not achieve by
   * waiting.
   */
  async function handleRetry() {
    setRechecking(true);
    try {
      await NetInfo.refresh();
    } finally {
      setRechecking(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Offline Resources" fallback={homeHref} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons
              name={online ? 'cloud-check-outline' : 'cloud-off-outline'}
              size={44}
              color={colors.primary}
            />
          </View>
          {!online && (
            <View style={styles.iconBadge}>
              <MaterialCommunityIcons name="alert" size={12} color={colors.white} />
            </View>
          )}
        </View>

        <Text style={styles.title}>{online ? "You're back online" : "You're Offline"}</Text>
        <Text style={styles.message}>
          {online
            ? 'Your connection is back. Everything will refresh as you browse.'
            : 'No connection detected, but what you already loaded stays available. Your outreach work does not stop.'}
        </Text>

        {online ? (
          <Pressable
            onPress={() => router.replace(homeHref)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.retryRow, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="arrow-right" size={18} color={colors.primary} />
            <Text style={styles.retryLabel}>Continue</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleRetry}
            disabled={rechecking}
            accessibilityRole="button"
            accessibilityState={{ disabled: rechecking }}
            style={({ pressed }) => [styles.retryRow, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="refresh" size={18} color={colors.primary} />
            <Text style={styles.retryLabel}>
              {rechecking ? 'Checking...' : 'Try to reconnect'}
            </Text>
          </Pressable>
        )}

        <Text style={styles.sectionLabel}>AVAILABLE OFFLINE</Text>

        {resources.map((resource) => (
          <Pressable
            key={resource.href}
            onPress={() => router.replace(resource.href as never)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={[styles.cardIcon, { backgroundColor: resource.bg }]}>
              <MaterialCommunityIcons name={resource.icon} size={20} color={resource.fg} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{resource.title}</Text>
              <Text style={styles.cardSubtitle}>{resource.subtitle}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.border} />
          </Pressable>
        ))}

        <Text style={styles.footnote}>
          Saved data is kept for 24 hours. Anything you have not opened before going offline
          will not be here.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: spacing.xl,
    paddingTop: spacing.lg,
    alignItems: 'center',
  },
  iconWrap: {
    marginTop: spacing.lg,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textPrimary,
    marginTop: spacing.xl,
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  retryLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  sectionLabel: {
    alignSelf: 'flex-start',
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  card: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
