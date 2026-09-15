import { useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar, ErrorState, ListSkeleton, MetricCard } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useAdminActions } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';
import { humanError } from '@/lib/errorMessage';
import { tabBarClearance } from '@/components/ui/tabBarOptions';

/**
 * The admin home.
 *
 * NO FIGMA DESIGN EXISTS for the admin side, so this reuses the organisation
 * dashboard's language exactly — the same header row, the same metric tiles,
 * the same card treatment — rather than inventing a third look.
 *
 * The two tiles count DECISIONS RECORDED, not items waiting. Per-queue counts
 * live on the Statistics screen, which is one tap away and can explain what
 * each number means; repeating them here would put the same figure in two
 * places with two different framings.
 */
export default function AdminOverview() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);

  const actionsQuery = useAdminActions();
  const actions = useMemo(() => actionsQuery.data ?? [], [actionsQuery.data]);

  const recordedToday = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return actions.filter((action) => new Date(action.created_at) >= startOfToday).length;
  }, [actions]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarClearance(insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={actionsQuery.isRefetching} onRefresh={() => actionsQuery.refetch()} />
        }
      >
        <View style={styles.headerRow}>
          <Avatar name={profile?.full_name ?? 'Admin'} uri={profile?.avatar_url} size={44} />
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Platform Admin</Text>
            <Text style={styles.greeting} numberOfLines={1}>
              {profile?.full_name ?? 'Admin'}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(admin)/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="cog-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {actionsQuery.isLoading ? (
          <ListSkeleton rows={2} rowHeight={88} />
        ) : actionsQuery.isError ? (
          <ErrorState
            message={
              humanError(actionsQuery.error, 'Could not load the admin activity log.')
            }
            onRetry={() => actionsQuery.refetch()}
          />
        ) : (
          <View style={styles.metricsRow}>
            <MetricCard label="Decisions Recorded" value={String(actions.length)} icon="clipboard-text-clock-outline" />
            <MetricCard label="Recorded Today" value={String(recordedToday)} icon="calendar-today" />
          </View>
        )}

        <Pressable
          onPress={() => router.push('/(admin)/activity')}
          accessibilityRole="button"
          accessibilityLabel="Open the full activity log"
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="history" size={20} color={colors.primary} />
            <Text style={styles.cardTitle}>Activity log</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
          </View>
          <Text style={styles.cardBody}>
            Every admin decision is written here as it is made: who did it, when, what it was about and
            the reason they gave. The record cannot be edited or deleted, by anyone; a correction is a new
            entry saying what was corrected.
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(admin)/stats')}
          accessibilityRole="button"
          accessibilityLabel="Open the platform statistics"
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="chart-box-outline" size={20} color={colors.primary} />
            <Text style={styles.cardTitle}>Statistics</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
          </View>
          <Text style={styles.cardBody}>
            Whether the matching is filling places, whether no-shows are rising or falling, and who is
            waiting on a decision from you.
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(admin)/deductions')}
          accessibilityRole="button"
          accessibilityLabel="Open the V-Score deductions list"
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="scale-balance" size={20} color={colors.primary} />
            <Text style={styles.cardTitle}>V-Score deductions</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
          </View>
          <Text style={styles.cardBody}>
            Points taken off a volunteer for a cancelled place or a day dropped late. Reversing one
            rebuilds their score without it and tells them why. The record itself is never deleted.
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(admin)/sources')}
          accessibilityRole="button"
          accessibilityLabel="Open the vetted sources list"
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="link-variant" size={20} color={colors.primary} />
            <Text style={styles.cardTitle}>Vetted sources</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
          </View>
          <Text style={styles.cardBody}>
            Bodies whose public outreach listings V-HUB would be willing to trust, and why each was
            accepted. A record only. Nothing is fetched from any of them.
          </Text>
        </Pressable>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="shield-key-outline" size={20} color={colors.primary} />
            <Text style={styles.cardTitle}>How admin accounts work</Text>
          </View>
          <Text style={styles.cardBody}>
            Nobody can sign up as an admin and nobody can be promoted from inside the app. The account is
            registered like any other, and the role is granted by a single statement run against the
            database. The app has no path to it at all, which is why there is no invite screen here.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1 },
  eyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  greeting: { fontFamily: fontFamily.semiBold, fontSize: 20, color: colors.textPrimary },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
  metricsRow: { flexDirection: 'row', gap: spacing.md },
  card: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  cardBody: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21, color: colors.textSecondary },
});
