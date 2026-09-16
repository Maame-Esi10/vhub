import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { humanError } from '@/lib/errorMessage';
import { Text } from '@/components/ui/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar,
  Button,
  EmptyState,
  ErrorState,
  FilterChips,
  ListSkeleton,
  MetricCard,
  ModerationBanner, HintRail } from '@/components/ui';
import type { FilterChipOption } from '@/components/ui';
import { OutreachCard } from '@/components/organisation';
import { colors, fontFamily, spacing } from '@/constants/theme';
import {
  useDayCoverageForMany,
  useOrganisationOutreaches,
  useOutreachDaysForMany,
  useUpdateOutreachStatus,
} from '@/hooks';
import { buildDayCoverage, type DayCoverage } from '@/lib/dayCoverage';
import type { OutreachWithCounts } from '@/hooks';
import { unreadCount, useNotifications } from '@/hooks/useNotifications';
import { useAuthStore } from '@/stores/authStore';
import type { OutreachStatus } from '@/types/database';
import { tabBarClearance } from '@/components/ui/tabBarOptions';

type StatusFilter = OutreachStatus | 'all';

const FILTERS: FilterChipOption<StatusFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'completed', label: 'Completed' },
];

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const organisationId = user?.id;

  const outreachesQuery = useOrganisationOutreaches(organisationId);
  const updateStatus = useUpdateOutreachStatus();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const unread = unreadCount(useNotifications().data ?? []);

  // Memoised, not `query.data ?? []` inline: that expression is a NEW empty
  // array on every render while the query is loading, which re-ran every
  // useMemo below it — including the day lookup, whose dependency is this list.
  const outreaches = useMemo(() => outreachesQuery.data ?? [], [outreachesQuery.data]);

  /*
    THE DAYS OF EVERY EVENT IN THE QUEUE, IN ONE QUERY.

    One `.in()` rather than one query per card, the same batching the volunteer
    feed uses — a dashboard with thirty events must not become thirty round
    trips. The card falls back to `outreaches.date` for anything missing from
    the map, which is both the correct answer for a one-day event and what
    shows for the moment before this lands.
  */
  const outreachIds = useMemo(() => outreaches.map((outreach) => outreach.id), [outreaches]);
  const dashboardDays = useOutreachDaysForMany(outreachIds);
  // Live commitments per day, so a card can say that a DAY is short even when
  // the event's own count reads full. Nothing here is stored — see
  // lib/dayCoverage.ts for why a per-day slot column was rejected.
  const dayCoverage = useDayCoverageForMany(outreachIds);

  function coverageFor(outreach: OutreachWithCounts): DayCoverage[] | undefined {
    const days = dashboardDays.data?.[outreach.id];
    if (!days || days.length <= 1) return undefined;
    return buildDayCoverage(days, dayCoverage.data?.[outreach.id] ?? {}, outreach.slots_total);
  }

  const metrics = useMemo(() => {
    const activePostings = outreaches.filter((o) => o.status === 'open').length;
    const drafts = outreaches.filter((o) => o.status === 'draft').length;
    const totalApplicants = outreaches.reduce((sum, o) => sum + o.applicantCounts.total, 0);
    const pendingReview = outreaches.reduce((sum, o) => sum + o.applicantCounts.pending, 0);
    return { activePostings, drafts, totalApplicants, pendingReview };
  }, [outreaches]);

  /*
    OPEN EVENTS FIRST, because they are the ones that still need something from
    the organisation: volunteers to accept, slots to fill, a date approaching.
    Everything else is a record of work already done or not yet started, and
    sorting by date alone buried the live events underneath finished ones.

    Within a group the soonest event still leads, which is the order the query
    already returns.
  */
  const STATUS_PRIORITY: Record<OutreachStatus, number> = {
    open: 0,
    draft: 1,
    closed: 2,
    completed: 3,
    cancelled: 4,
  };

  const filteredOutreaches = useMemo(() => {
    const visible =
      statusFilter === 'all' ? outreaches : outreaches.filter((o) => o.status === statusFilter);

    return [...visible].sort(
      (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
    );
    // STATUS_PRIORITY is a module-level constant in spirit; it is declared here
    // only to sit beside the comment that explains it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outreaches, statusFilter]);

  // The card now opens the event's own management screen rather than jumping
  // straight to its applicants. Applicants are one thing an organiser does with
  // an event, alongside the check-in code and attendance; sending the card
  // directly there was what left those two actions with nowhere to live.
  function goToOutreach(outreachId: string) {
    router.push(`/(organisation)/outreach/${outreachId}`);
  }

  function handleQuickAction(outreach: OutreachWithCounts) {
    if (!organisationId) return;
    const nextStatus: OutreachStatus = outreach.status === 'draft' ? 'open' : 'closed';
    updateStatus.mutate({ outreachId: outreach.id, organisationId, status: nextStatus });
  }

  function quickActionFor(outreach: OutreachWithCounts) {
    if (outreach.status === 'draft') return { label: 'Publish', onPress: () => handleQuickAction(outreach) };
    if (outreach.status === 'open') return { label: 'Close', onPress: () => handleQuickAction(outreach) };
    return undefined;
  }

  const header = (
    <View>
      {/*
        A suspension the account cannot see is indistinguishable from the app
        being broken: the database refuses the write, the screen shows a
        constraint error, and the person tries again. Renders nothing at all
        for an active account, which is nearly everybody.
      */}
      <ModerationBanner />
      <View style={styles.headerRow}>
        {/*
          `uri` was simply never passed here — the only <Avatar> in the app
          missing it, so this header alone fell back to initials while every
          other surface showed the logo. The URL was always in reach:
          `profile` is the organisation's own `profiles` row from the auth
          store, and `avatar_url` is the column the logo upload writes.
        */}
        <Avatar
          name={profile?.full_name ?? 'Organisation'}
          uri={profile?.avatar_url}
          size={44}
        />
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Command Center</Text>
          <Text style={styles.greeting} numberOfLines={1}>
            {profile?.full_name ?? 'Your organisation'}
          </Text>
        </View>
        {/*
          The organisation's way into its own inbox, mirroring the volunteer
          feed's bell. Until now the organisation side had no way to READ a
          notification at all: pushes arrived, rows were written, and nothing
          in the app could open them — miss the push and it was gone.
        */}
        <Pressable
          onPress={() => router.push('/(organisation)/notifications')}
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          hitSlop={8}
          style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color={colors.textPrimary} />
          {/* Dot rather than a count, the same choice as the volunteer feed:
              the exact number does not change what happens next. */}
          {unread > 0 && <View style={styles.bellDot} />}
        </Pressable>
      </View>

      {/*
        A SIGNPOST, IN ONE SHORT ROW. Nobody opens the Info Hub unprompted, so
        the screen explaining clinical versus support was read by the
        organisations that least needed it -- and the costly mistake here is
        ticking "support" to stop the verification gate blocking applicants,
        which takes the credential check off work that needed it.

        A rail rather than a box: this is secondary and should not take a full
        row of the dashboard to say so.
      */}
      <HintRail
        edgePadding={0}
        items={[
          {
            icon: 'help-circle-outline',
            label: 'Clinical or support?',
            accessibilityLabel: 'Open the Info Hub',
            // `from` so backing out returns here rather than to Profile.
            onPress: () =>
              router.push({
                pathname: '/(organisation)/info-hub',
                params: { from: '/(organisation)/dashboard' },
              }),
          },
          {
            icon: 'chart-line',
            label: 'How ranking works',
            accessibilityLabel: 'Open the Info Hub to read how volunteers are ranked',
            onPress: () =>
              router.push({
                pathname: '/(organisation)/info-hub',
                params: { from: '/(organisation)/dashboard' },
              }),
          },
        ]}
      />

      {outreachesQuery.data ? (
        <View style={styles.metricsGrid}>
          <View style={styles.metricsRow}>
            <MetricCard label="Active Postings" value={String(metrics.activePostings)} icon="bullhorn-outline" />
            <MetricCard label="Total Applicants" value={String(metrics.totalApplicants)} icon="account-group" />
          </View>
          <View style={styles.metricsRow}>
            <MetricCard
              label="Pending Review"
              value={String(metrics.pendingReview)}
              icon="clock-alert-outline"
              tone={metrics.pendingReview > 0 ? 'danger' : 'neutral'}
            />
            <MetricCard label="Drafts" value={String(metrics.drafts)} icon="file-document-outline" />
          </View>
        </View>
      ) : null}

      <View style={styles.newOutreachRow}>
        <Button
          title="New Outreach"
          onPress={() => router.push('/(organisation)/create-outreach')}
          accessibilityLabel="Create a new outreach"
          style={styles.newOutreachButton}
        />
      </View>

      <Text style={styles.sectionTitle}>Your Events</Text>
      <FilterChips options={FILTERS} value={statusFilter} onChange={setStatusFilter} />
    </View>
  );

  if (outreachesQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <ListSkeleton rows={3} rowHeight={120} />
      </SafeAreaView>
    );
  }

  if (outreachesQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorWrap}>
          <ErrorState
            message={humanError(outreachesQuery.error, 'Please try again.')}
            onRetry={() => outreachesQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        style={styles.flex}
        data={filteredOutreaches}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: tabBarClearance(insets.bottom) },
        ]}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl refreshing={outreachesQuery.isRefetching} onRefresh={() => outreachesQuery.refetch()} />
        }
        renderItem={({ item }) => (
          <OutreachCard
            outreach={item}
            days={dashboardDays.data?.[item.id]?.map((day) => day.day)}
            dayCoverage={coverageFor(item)}
            onPress={() => goToOutreach(item.id)}
            quickAction={quickActionFor(item)}
            quickActionPending={updateStatus.isPending && updateStatus.variables?.outreachId === item.id}
          />
        )}
        ListEmptyComponent={
          outreaches.length === 0 ? (
            <EmptyState
              icon="hand-heart-outline"
              title="No outreaches yet"
              message="Create your first outreach to start recruiting volunteers for your next medical mission."
              actionLabel="Create Outreach"
              onAction={() => router.push('/(organisation)/create-outreach')}
            />
          ) : (
            <EmptyState
              icon="filter-variant"
              title="Nothing in this filter"
              message="Try a different status filter, or create a new outreach."
            />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  errorWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
    // Matches the button fill so the dot reads as sitting on top of the bell
    // rather than merging with the icon's outline.
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  pressed: {
    opacity: 0.7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  greeting: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  metricsGrid: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  newOutreachRow: {
    marginTop: spacing.lg,
  },
  newOutreachButton: {
    alignSelf: 'stretch',
  },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
});
