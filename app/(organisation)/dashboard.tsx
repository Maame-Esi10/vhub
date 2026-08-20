import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  FilterChips,
  ListSkeleton,
  MetricCard,
} from '@/components/ui';
import type { FilterChipOption } from '@/components/ui';
import { OutreachCard } from '@/components/organisation';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { useOrganisationOutreaches, useOutreachDaysForMany, useUpdateOutreachStatus } from '@/hooks';
import type { OutreachWithCounts } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';
import type { OutreachStatus } from '@/types/database';

type StatusFilter = OutreachStatus | 'all';

const FILTERS: FilterChipOption<StatusFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'completed', label: 'Completed' },
];

export default function Dashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const organisationId = user?.id;

  const outreachesQuery = useOrganisationOutreaches(organisationId);
  const updateStatus = useUpdateOutreachStatus();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

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
  const dashboardDays = useOutreachDaysForMany(
    useMemo(() => outreaches.map((outreach) => outreach.id), [outreaches])
  );

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
      <View style={styles.headerRow}>
        <Avatar name={profile?.full_name ?? 'Organisation'} size={44} />
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Command Center</Text>
          <Text style={styles.greeting} numberOfLines={1}>
            {profile?.full_name ?? 'Your organisation'}
          </Text>
        </View>
      </View>

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
            message={outreachesQuery.error instanceof Error ? outreachesQuery.error.message : 'Please try again.'}
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
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl refreshing={outreachesQuery.isRefetching} onRefresh={() => outreachesQuery.refetch()} />
        }
        renderItem={({ item }) => (
          <OutreachCard
            outreach={item}
            days={dashboardDays.data?.[item.id]?.map((day) => day.day)}
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
