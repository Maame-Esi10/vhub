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
 * THE FIRST ATTEMPT AT FIXING THAT WAS ALSO WRONG, and the correction is the
 * more useful lesson. It put a row per queue on this screen, each with its
 * count and a chevron into the queue -- and every one of those queues is
 * already a tab on the bar directly underneath. Owner: "there are some on the
 * navbar, why are on the home screen??" Quite. Adding a second way to reach
 * something is not the same as making it visible, and a home screen that
 * re-lists the navigation below it is furniture.
 *
 * WHAT THE ROWS ACTUALLY ADDED WAS THE NUMBER, so the number moved to the tab
 * badge, where it is visible from every screen in the group rather than only
 * from here. What is left on this screen is the one thing a badge cannot say:
 * a sentence totalling them, including the case where the total is zero, which
 * no badge can express because an absent badge and an unloaded one look
 * identical.
 *
 * The explanatory paragraphs went too. They belong on the screens they
 * describe, where somebody is actually looking at the thing; on the home they
 * were four paragraphs to scroll past on every visit, read once. And Settings
 * has one door rather than a gear and a row saying the same thing.
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

  /*
    THE COUNTS THEMSELVES LIVE ON THE TAB BAR, not here (owner, 2026-09-21:
    "there are some on the navbar, why are on the home screen??").

    This screen had grown a row per queue, each linking to a tab that was
    already on the bar beneath it. The only thing those rows added was the
    number, so the number moved to the tab badge and the rows went. What is
    kept is the one thing a badge cannot say: a single sentence totalling them,
    including the case where the total is zero, which no badge can express at
    all because an absent badge and an unloaded one look identical.
  */
  const counts = [organisations, credentials, disputes];
  const totalWaiting = counts.reduce((sum, query) => sum + (query.data?.length ?? 0), 0);
  const anyLoading = counts.some((query) => query.isLoading);

  const links: { label: string; detail: string; icon: IconName; route: string }[] = [
    // No "Activity log" entry: the decisions row above already opens it, and
    // two links to one screen on one screen is the duplication being removed.
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
          {/*
            NO COG HERE. Settings has exactly one door, and it is the labelled
            row at the end of the list. A gear in the corner AND a row saying
            the same thing is two controls for one destination, which is the
            duplication being removed, and the gear was the one nobody found.
          */}
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
  queueText: { flex: 1 },
  queueLabel: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
  queueDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
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
