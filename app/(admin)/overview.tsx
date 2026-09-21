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
import { Avatar, ErrorState, ListSkeleton } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  useAdminActions,
  useCredentialQueue,
  useDisputeQueue,
  useVerificationQueue,
} from '@/hooks';
import { useAuthStore } from '@/stores/authStore';
import { humanError } from '@/lib/errorMessage';
import { tabBarClearance } from '@/components/ui/tabBarOptions';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * The admin home.
 *
 * REBUILT (owner, 2026-09-21: "why does the admin only contain info cards on
 * the home screen with 2 cards? Can't there be a better design?").
 *
 * WHAT WAS WRONG, beyond the look. The screen opened with two tiles counting
 * DECISIONS RECORDED and RECORDED TODAY -- both statistics about the admin's
 * own past activity -- followed by four cards each carrying a paragraph
 * explaining what the screen behind it does, and a fifth that was pure prose
 * about how admin accounts are created. So the home screen of the admin
 * section explained the app rather than telling anybody what needed doing, and
 * the numbers it did show were the two least actionable in the product: how
 * much work you have already finished.
 *
 * Meanwhile the three things an admin actually opens the app for -- an
 * organisation waiting on verification, a credential waiting on review, a
 * dispute waiting on a decision -- had no count anywhere on the home at all.
 * They were each a tab you had to open to discover whether it held anything.
 *
 * SO THE HOME LEADS WITH WHAT IS WAITING, and every figure is a link to the
 * queue it counts. This is the same rule the Statistics screen already
 * follows: a number with no question attached is decoration. The question here
 * is "is anybody waiting on me", and it is the only question this screen needs
 * to answer well.
 *
 * The explanatory paragraphs went with it. They belong on the screens they
 * describe, where somebody is actually looking at the thing; on the home they
 * were four paragraphs to scroll past on every visit, read once.
 *
 * NO FIGMA DESIGN EXISTS for the admin side, so this reuses the language the
 * rest of the app now uses -- the metric card, the settings row, the same
 * tokens -- rather than inventing a third look.
 */
export default function AdminOverview() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);

  const actionsQuery = useAdminActions();
  /*
    THE THREE QUEUES ARE FETCHED HERE TOO, and that is not a duplicate cost.
    React Query caches them under the same keys the three tabs use, so opening
    a queue after seeing its count on the home is instant rather than a second
    round trip. Each is admin-gated inside its own hook.
  */
  const organisations = useVerificationQueue();
  const credentials = useCredentialQueue();
  const disputes = useDisputeQueue();

  const actions = useMemo(() => actionsQuery.data ?? [], [actionsQuery.data]);

  const recordedToday = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return actions.filter((action) => new Date(action.created_at) >= startOfToday).length;
  }, [actions]);

  const waiting = [
    {
      key: 'organisations',
      label: 'Organisations',
      detail: 'Documents submitted, awaiting your decision',
      icon: 'domain' as IconName,
      count: organisations.data?.length,
      loading: organisations.isLoading,
      route: '/(admin)/organisations',
    },
    {
      key: 'credentials',
      label: 'Credentials',
      detail: 'Volunteers whose document needs checking',
      icon: 'card-account-details-outline' as IconName,
      count: credentials.data?.length,
      loading: credentials.isLoading,
      route: '/(admin)/credentials',
    },
    {
      key: 'disputes',
      label: 'Disputes',
      detail: 'Volunteers challenging a record about them',
      icon: 'scale-balance' as IconName,
      count: disputes.data?.length,
      loading: disputes.isLoading,
      route: '/(admin)/disputes',
    },
  ];

  const totalWaiting = waiting.reduce((sum, row) => sum + (row.count ?? 0), 0);
  const anyLoading = waiting.some((row) => row.loading);

  const links: { label: string; detail: string; icon: IconName; route: string }[] = [
    {
      label: 'Activity log',
      detail: 'Every decision, who made it and why',
      icon: 'history',
      route: '/(admin)/activity',
    },
    {
      label: 'Statistics',
      detail: 'Fill rate, no-show trend and your backlog',
      icon: 'chart-box-outline',
      route: '/(admin)/stats',
    },
    {
      label: 'V-Score deductions',
      detail: 'Points taken off a volunteer, and how to reverse one',
      icon: 'minus-circle-outline',
      route: '/(admin)/deductions',
    },
    {
      label: 'Vetted sources',
      detail: 'Bodies whose listings VHub would trust',
      icon: 'link-variant',
      route: '/(admin)/sources',
    },
    {
      /*
        SETTINGS IS A ROW, NOT ONLY A COG (owner, 2026-09-21: "how do I
        logout?").

        Sign Out has always been on the admin Settings screen, and Settings was
        reachable only through a 20px unlabelled gear in the top corner. The
        other two roles reach Settings from a Profile TAB; the admin has no
        profile, so that icon was the single entry point to the only way out of
        the account. An icon nobody recognises is not a way out.

        The cog stays -- it is where the eye goes on a screen that has one --
        and this row says the same thing in words, at the end of the list,
        where somebody looking for it will scroll.
      */
      label: 'Settings and sign out',
      detail: 'Your account, diagnostics and the policy',
      icon: 'cog-outline',
      route: '/(admin)/settings',
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarClearance(insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={
              actionsQuery.isRefetching ||
              organisations.isRefetching ||
              credentials.isRefetching ||
              disputes.isRefetching
            }
            onRefresh={() => {
              void actionsQuery.refetch();
              void organisations.refetch();
              void credentials.refetch();
              void disputes.refetch();
            }}
          />
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
            accessibilityLabel="Settings and sign out"
            hitSlop={8}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="cog-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/*
          ONE SENTENCE ANSWERING THE ONLY QUESTION THIS SCREEN IS FOR. A count
          of zero is a real answer and is worth stating outright rather than
          leaving somebody to read three zeroes and infer it.
        */}
        <View style={styles.summaryCard}>
          <MaterialCommunityIcons
            name={totalWaiting > 0 ? 'bell-ring-outline' : 'check-circle-outline'}
            size={22}
            color={totalWaiting > 0 ? colors.warning : colors.success}
          />
          <Text style={styles.summaryText}>
            {anyLoading
              ? 'Checking what is waiting for you...'
              : totalWaiting === 0
                ? 'Nothing is waiting for a decision. The queues are clear.'
                : totalWaiting === 1
                  ? '1 thing is waiting for a decision from you.'
                  : `${totalWaiting} things are waiting for a decision from you.`}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>WAITING ON YOU</Text>
        <View style={styles.queueList}>
          {waiting.map((row) => {
            const count = row.count ?? 0;
            const clear = !row.loading && count === 0;
            return (
              <Pressable
                key={row.key}
                onPress={() => router.push(row.route as Parameters<typeof router.push>[0])}
                accessibilityRole="button"
                accessibilityLabel={`${row.label}, ${count} waiting`}
                style={({ pressed }) => [styles.queueRow, pressed && styles.pressed]}
              >
                <View style={[styles.queueIcon, clear && styles.queueIconClear]}>
                  <MaterialCommunityIcons
                    name={row.icon}
                    size={20}
                    color={clear ? colors.textSecondary : colors.primary}
                  />
                </View>
                <View style={styles.queueText}>
                  <Text style={styles.queueLabel}>{row.label}</Text>
                  <Text style={styles.queueDetail}>{row.detail}</Text>
                </View>
                {/*
                  The number is the point of the row, so it is the largest
                  thing in it. Zero is drawn quietly rather than hidden: an
                  absent number reads as "not loaded", which is the one thing
                  it must not be confused with.
                */}
                <Text style={[styles.queueCount, clear && styles.queueCountClear]}>
                  {row.loading ? '' : count}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>YOUR RECORD</Text>
        {actionsQuery.isLoading ? (
          <ListSkeleton rows={1} rowHeight={72} />
        ) : actionsQuery.isError ? (
          <ErrorState
            message={humanError(actionsQuery.error, 'Could not load the admin activity log.')}
            onRetry={() => actionsQuery.refetch()}
          />
        ) : (
          /*
            KEPT, BUT DEMOTED TO ONE ROW. These two figures are about work
            already finished, which is the least actionable thing on the
            screen, and they had been leading it.
          */
          <Pressable
            onPress={() => router.push('/(admin)/activity')}
            accessibilityRole="button"
            accessibilityLabel="Open the full activity log"
            style={({ pressed }) => [styles.recordCard, pressed && styles.pressed]}
          >
            <View style={styles.recordFigure}>
              <Text style={styles.recordValue}>{actions.length}</Text>
              <Text style={styles.recordLabel}>decisions recorded</Text>
            </View>
            <View style={styles.recordDivider} />
            <View style={styles.recordFigure}>
              <Text style={styles.recordValue}>{recordedToday}</Text>
              <Text style={styles.recordLabel}>today</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
          </Pressable>
        )}

        <Text style={styles.sectionLabel}>ELSEWHERE</Text>
        <View style={styles.queueList}>
          {links.map((link) => (
            <Pressable
              key={link.label}
              onPress={() => router.push(link.route as Parameters<typeof router.push>[0])}
              accessibilityRole="button"
              accessibilityLabel={link.label}
              style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name={link.icon} size={20} color={colors.textSecondary} />
              <View style={styles.queueText}>
                <Text style={styles.queueLabel}>{link.label}</Text>
                <Text style={styles.queueDetail}>{link.detail}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
    paddingBottom: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
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
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderOnSurface,
    padding: spacing.base,
  },
  summaryText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  queueList: { gap: spacing.md },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    minHeight: 72,
  },
  queueIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
  },
  queueIconClear: { backgroundColor: colors.surface },
  queueText: { flex: 1 },
  queueLabel: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
  queueDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
  queueCount: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.primary,
    minWidth: 24,
    textAlign: 'right',
  },
  queueCountClear: { color: colors.textSecondary },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
  },
  recordFigure: { flex: 1 },
  recordValue: { fontFamily: fontFamily.bold, fontSize: 22, color: colors.textPrimary },
  recordLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
  recordDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    minHeight: 64,
  },
});
