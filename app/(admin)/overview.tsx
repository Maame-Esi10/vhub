import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar, ErrorState, ListSkeleton, MetricCard } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useAdminActions } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';

/**
 * The admin home.
 *
 * NO FIGMA DESIGN EXISTS for the admin side, so this reuses the organisation
 * dashboard's language exactly — the same header row, the same metric tiles,
 * the same card treatment — rather than inventing a third look.
 *
 * What it deliberately does NOT do is show queue counts. The verification,
 * credential, moderation and dispute queues are later packages and do not
 * exist yet; a tile reading "0 pending" would be a lie of omission, since
 * there is no queue for anything to be pending in. The "Coming next" block
 * says so in words instead.
 */
export default function AdminOverview() {
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
        contentContainerStyle={styles.content}
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
              actionsQuery.error instanceof Error
                ? actionsQuery.error.message
                : 'Could not load the admin activity log.'
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
            Every admin decision is written here as it is made — who did it, when, what it was about and
            the reason they gave. The record cannot be edited or deleted, by anyone; a correction is a new
            entry saying what was corrected.
          </Text>
        </Pressable>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="progress-wrench" size={20} color={colors.primary} />
            <Text style={styles.cardTitle}>Coming next</Text>
          </View>
          <Text style={styles.cardBody}>
            This is the admin shell and its record-keeping. The review queues are built one at a time, and
            each will appear here as its own tab:
          </Text>
          <View style={styles.list}>
            <UpcomingRow icon="card-account-details-outline" label="Volunteer credential review" />
            <UpcomingRow icon="account-cancel-outline" label="Suspensions and bans" />
            <UpcomingRow icon="scale-balance" label="Attendance and review disputes" />
          </View>
        </View>

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

function UpcomingRow({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
}) {
  return (
    <View style={styles.listRow}>
      <MaterialCommunityIcons name={icon} size={16} color={colors.textSecondary} />
      <Text style={styles.listLabel}>{label}</Text>
    </View>
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
  list: { gap: spacing.md, paddingTop: spacing.xs },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  listLabel: { flex: 1, fontFamily: fontFamily.medium, fontSize: 14, color: colors.textPrimary },
});
