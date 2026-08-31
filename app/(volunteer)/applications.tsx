import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { EmptyState, ErrorState, FilterChips, ListSkeleton, Toast } from '@/components/ui';
import type { FilterChipOption } from '@/components/ui';
import { VolunteerApplicationCard, WithdrawSheet } from '@/components/volunteer';
import { colors, fontFamily, spacing } from '@/constants/theme';
import {
  useApplicationDaysForMany,
  useCancelApplication,
  useMyWaitlistPositions,
  useOrganisationLogos,
  useOutreachDaysForMany,
  useVolunteerApplications,
} from '@/hooks';
import type { VolunteerApplication } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';
import type { ApplicationStatus } from '@/types/database';

type StatusGroup = ApplicationStatus | 'all';

/**
 * Group order mirrors what a volunteer wants to see first: what's still
 * undecided, then what they got, then the closed-out ones.
 */
const GROUP_ORDER: ApplicationStatus[] = [
  'pending',
  'accepted',
  'waitlisted',
  'rejected',
  'cancelled',
];

const GROUP_LABEL: Record<ApplicationStatus, string> = {
  pending: 'Under review',
  accepted: 'Accepted',
  waitlisted: 'Waitlisted',
  rejected: 'Not selected',
  not_selected: 'Not selected',
  cancelled: 'Withdrawn',
};

/** One flattened list so a single FlatList can render grouped sections. */
type Row =
  | { kind: 'header'; key: string; label: string; count: number }
  | { kind: 'application'; key: string; application: VolunteerApplication };

export default function Applications() {
  const router = useRouter();
  const volunteerId = useAuthStore((state) => state.user)?.id;

  const [toast, setToast] = useState<string | null>(null);

  const applicationsQuery = useVolunteerApplications(volunteerId);
  const cancelApplication = useCancelApplication();
  // Independent of the list query on purpose: position comes from the server
  // (RLS hides the other applicants) and its failure must never stop an
  // application from rendering.
  const waitlistPositions = useMyWaitlistPositions(volunteerId);
  const applications = useMemo(() => applicationsQuery.data ?? [], [applicationsQuery.data]);

  /*
    THE EVENT'S DAYS AND THIS VOLUNTEER'S OWN COMMITMENT, TWO BATCHED QUERIES.

    Both are `.in()` lookups over the whole list rather than one query per card:
    a volunteer with twenty applications must not cost forty round trips.

    They are separate because they answer different questions and fail
    independently — the span is a fact about the event, the commitment is a
    promise this volunteer made, and a card that cannot load the second should
    still print the first.
  */
  const applicationDays = useOutreachDaysForMany(
    useMemo(
      () =>
        applications
          .map((application) => application.outreach?.id)
          .filter((id): id is string => !!id),
      [applications]
    )
  );
  const committedDays = useApplicationDaysForMany(
    useMemo(() => applications.map((application) => application.id), [applications])
  );

  const [statusFilter, setStatusFilter] = useState<StatusGroup>('all');

  // One lookup for the whole list — see useOrganisationLogos.
  const organisationLogos = useOrganisationLogos(
    applications.map((application) => application.outreach?.organisation?.id)
  );
  const [withdrawing, setWithdrawing] = useState<VolunteerApplication | null>(null);

  const counts = useMemo(() => {
    const tally = new Map<ApplicationStatus, number>();
    for (const application of applications) {
      tally.set(application.status, (tally.get(application.status) ?? 0) + 1);
    }
    return tally;
  }, [applications]);

  const filters: FilterChipOption<StatusGroup>[] = [
    { value: 'all', label: 'All', count: applications.length },
    ...GROUP_ORDER.map((status) => ({
      value: status as StatusGroup,
      label: GROUP_LABEL[status],
      count: counts.get(status) ?? 0,
    })),
  ];

  const rows = useMemo<Row[]>(() => {
    const visibleGroups =
      statusFilter === 'all' ? GROUP_ORDER : GROUP_ORDER.filter((status) => status === statusFilter);

    return visibleGroups.flatMap((status) => {
      const inGroup = applications.filter((application) => application.status === status);
      if (inGroup.length === 0) return [];
      const header: Row = {
        kind: 'header',
        key: `header-${status}`,
        label: GROUP_LABEL[status],
        count: inGroup.length,
      };
      return [
        header,
        ...inGroup.map<Row>((application) => ({
          kind: 'application',
          key: application.id,
          application,
        })),
      ];
    });
  }, [applications, statusFilter]);

  function handleWithdraw(reason: string | null) {
    if (!withdrawing || !volunteerId) return;
    cancelApplication.mutate(
      {
        applicationId: withdrawing.id,
        volunteerId,
        outreachId: withdrawing.outreach_id,
        reason,
      },
      {
        onSuccess: (result) => {
          setWithdrawing(null);
          /*
            SAID OUT LOUD, at the moment it happens. A score that moves silently
            is a score somebody discovers later and cannot connect to anything
            they did — and `penalty` is null unless they actually gave up an
            accepted place, so a volunteer withdrawing a pending application is
            told nothing about a deduction, because there was none.
          */
          setToast(
            result.penalty
              ? `Withdrawn. That cost ${Math.abs(result.penalty.points)} V-Score points — you were holding a place. Your score is now ${Math.round(result.penalty.newScore)}.`
              : 'Withdrawn.'
          );
        },
      }
    );
  }

  if (applicationsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>My Applications</Text>
        <ListSkeleton rows={4} rowHeight={140} />
      </SafeAreaView>
    );
  }

  if (applicationsQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message={
              applicationsQuery.error instanceof Error
                ? applicationsQuery.error.message
                : 'Please try again.'
            }
            onRetry={() => applicationsQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>My Applications</Text>
      <View style={styles.filtersWrap}>
        <FilterChips options={filters} value={statusFilter} onChange={setStatusFilter} />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={applicationsQuery.isRefetching}
            onRefresh={() => applicationsQuery.refetch()}
          />
        }
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <Text style={styles.groupHeader}>
              {item.label} ({item.count})
            </Text>
          ) : (
            <VolunteerApplicationCard
              application={item.application}
              organisationLogoUrl={
                item.application.outreach?.organisation
                  ? organisationLogos.data?.[item.application.outreach.organisation.id]
                  : null
              }
              onPress={() => router.push(`/(volunteer)/outreach/${item.application.outreach_id}?from=/(volunteer)/applications`)}
              onWithdraw={() => setWithdrawing(item.application)}
              waitlistPosition={waitlistPositions.data?.[item.application.id]}
              eventDays={
                item.application.outreach
                  ? applicationDays.data?.[item.application.outreach.id]?.map((day) => day.day)
                  : undefined
              }
              committedDays={committedDays.data?.[item.application.id]}
            />
          )
        }
        ListEmptyComponent={
          applications.length === 0 ? (
            <EmptyState
              icon="clipboard-text-outline"
              title="No applications yet"
              message="When you join or apply to an outreach, you'll be able to track its progress here."
              actionLabel="Browse outreaches"
              onAction={() => router.push('/(volunteer)/feed')}
            />
          ) : (
            <EmptyState
              icon="filter-variant"
              title="Nothing in this group"
              message="You have no applications with this status."
            />
          )
        }
      />

      {withdrawing?.outreach ? (
        <WithdrawSheet
          visible
          outreachTitle={withdrawing.outreach.title}
          eventDate={withdrawing.outreach.date}
          eventStartTime={withdrawing.outreach.start_time}
          isPending={cancelApplication.isPending}
          errorMessage={
            cancelApplication.isError
              ? cancelApplication.error instanceof Error
                ? cancelApplication.error.message
                : 'Could not withdraw your application.'
              : undefined
          }
          onConfirm={handleWithdraw}
          onDismiss={() => setWithdrawing(null)}
        />
      ) : null}

      <Toast message={toast} onDismiss={() => setToast(null)} durationMs={6000} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.textPrimary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
  },
  filtersWrap: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.base,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
    paddingBottom: spacing.xxl,
  },
  groupHeader: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
});
