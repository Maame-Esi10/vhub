import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterChips,
  ListSkeleton,
} from '@/components/ui';
import type { FilterChipOption } from '@/components/ui';
import { ApplicantCard, OutreachPicker, RosterSummaryCard } from '@/components/organisation';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  useBatchDecideApplications,
  useOrganisationOutreaches,
  useOutreachApplications,
  useUpdateApplicationStatus,
} from '@/hooks';
import type { ApplicationWithVolunteer, OrganisationApplicationDecision } from '@/hooks';
import { planBatchAccept, rankApplicants, skillCoverage, waitlistPositions } from '@/lib/roster';
import { useAuthStore } from '@/stores/authStore';
import type { ApplicationStatus } from '@/types/database';

type StatusFilter = ApplicationStatus | 'all';

const FILTERS: FilterChipOption<StatusFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'rejected', label: 'Rejected' },
];

export default function Applicants() {
  const router = useRouter();
  const params = useLocalSearchParams<{ outreachId?: string }>();
  const organisationId = useAuthStore((s) => s.user)?.id;

  const outreachesQuery = useOrganisationOutreaches(organisationId);
  const outreaches = outreachesQuery.data ?? [];

  const routeOutreachId = params.outreachId ? params.outreachId : undefined;

  const [selectedOutreachId, setSelectedOutreachId] = useState<string | undefined>(routeOutreachId);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // This is a tab, so it stays mounted after the first visit and the useState
  // initialiser above only ever sees the first outreachId param. Adopt the
  // param whenever the dashboard sends one, then clear it: without the clear,
  // re-tapping the same card after the org had manually picked a different
  // outreach here would leave the param unchanged, the effect wouldn't fire,
  // and the tab would open on the wrong outreach.
  useEffect(() => {
    if (routeOutreachId) {
      setSelectedOutreachId(routeOutreachId);
      router.setParams({ outreachId: '' });
    }
  }, [routeOutreachId, router]);

  useEffect(() => {
    if (!selectedOutreachId && outreaches.length > 0) {
      setSelectedOutreachId(outreaches[0]?.id);
    }
  }, [selectedOutreachId, outreaches]);

  const selectedOutreach = outreaches.find((o) => o.id === selectedOutreachId);

  const applicationsQuery = useOutreachApplications(selectedOutreachId);
  const applications = applicationsQuery.data ?? [];

  const updateStatus = useUpdateApplicationStatus();
  const activeApplicationId = updateStatus.variables?.applicationId;

  const batchDecide = useBatchDecideApplications();
  const [confirmingBatch, setConfirmingBatch] = useState(false);
  const [batchOutcome, setBatchOutcome] = useState<string | null>(null);

  /*
    One projection of the applicant list into the shape lib/roster.ts ranks, so
    the ordering shown on screen, the waitlist positions, and the plan the
    batch button executes are all computed from the SAME derivation. If the
    button could accept people in an order the organisation never saw, the
    action would not be one they could meaningfully consent to.
  */
  const rankable = useMemo(
    () =>
      applications.map((application) => ({
        id: application.id,
        status: application.status,
        matchScore: application.match_score,
        vScore: application.volunteer?.v_score ?? null,
        createdAt: application.created_at,
        application,
      })),
    [applications]
  );

  // Re-sorted here rather than in the query: the query orders by raw
  // match_score, but ranking applies the reliability multiplier on top of it,
  // and that needs the volunteer's V-Score from the embed.
  const rankedApplications = useMemo(
    () => rankApplicants(rankable).map((entry) => entry.application),
    [rankable]
  );

  const positions = useMemo(() => waitlistPositions(rankable), [rankable]);

  const coverage = useMemo(
    () =>
      skillCoverage(
        selectedOutreach?.required_skills,
        applications.filter((a) => a.status === 'accepted').map((a) => a.volunteer?.skill_tags)
      ),
    [selectedOutreach?.required_skills, applications]
  );

  const plan = useMemo(
    () =>
      selectedOutreach
        ? planBatchAccept({
            applicants: rankable,
            slotsTotal: selectedOutreach.slots_total,
            slotsFilled: selectedOutreach.slots_filled,
          })
        : null,
    [rankable, selectedOutreach]
  );

  const pendingCount = applications.filter((a) => a.status === 'pending').length;
  const waitlistedCount = applications.filter((a) => a.status === 'waitlisted').length;

  const filteredApplications = useMemo(
    () =>
      statusFilter === 'all'
        ? rankedApplications
        : rankedApplications.filter((a) => a.status === statusFilter),
    [rankedApplications, statusFilter]
  );

  function runBatch() {
    if (!plan || !selectedOutreachId) return;
    const decisions = [
      ...plan.accept.map((applicationId) => ({ applicationId, status: 'accepted' as const })),
      ...plan.waitlist.map((applicationId) => ({ applicationId, status: 'waitlisted' as const })),
    ];
    if (decisions.length === 0) return;

    batchDecide.mutate(
      { outreachId: selectedOutreachId, decisions },
      {
        onSuccess: (result) => {
          setConfirmingBatch(false);
          // A partial success is reported as what it is. The alternative —
          // showing "done" when four of ten accepts hit a full roster — would
          // leave the organiser believing people are confirmed who are not.
          const parts = [
            result.accepted.length > 0 ? `${result.accepted.length} accepted` : null,
            result.waitlisted.length > 0 ? `${result.waitlisted.length} waitlisted` : null,
            result.failed.length > 0 ? `${result.failed.length} could not be moved` : null,
          ].filter(Boolean);
          setBatchOutcome(parts.length > 0 ? `${parts.join(', ')}.` : 'Nothing changed.');
        },
        onError: () => setConfirmingBatch(false),
      }
    );
  }

  function handleDecide(application: ApplicationWithVolunteer, status: OrganisationApplicationDecision) {
    if (!selectedOutreachId) return;
    updateStatus.mutate({ applicationId: application.id, outreachId: selectedOutreachId, status });
  }

  if (outreachesQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>Applicant Vetting</Text>
        <ListSkeleton rows={3} rowHeight={160} />
      </SafeAreaView>
    );
  }

  if (outreachesQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message={outreachesQuery.error instanceof Error ? outreachesQuery.error.message : 'Please try again.'}
            onRetry={() => outreachesQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (outreaches.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>Applicant Vetting</Text>
        <EmptyState
          icon="clipboard-list-outline"
          title="No outreaches yet"
          message="Create an outreach to start receiving volunteer applications."
          actionLabel="Create Outreach"
          onAction={() => router.push('/(organisation)/create-outreach')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Applicant Vetting</Text>

      {/*
        Fixed header: the title and the outreach selector. The selector is
        navigation — it decides what the whole screen is about — so it stays
        reachable while the applicant list scrolls beneath it. Everything else
        moved into the list's own header (see listHeader below) because a
        screen that pins six stacked sections leaves a phone with barely a
        applicant visible.
      */}
      <OutreachPicker
        outreaches={outreaches}
        selectedId={selectedOutreachId}
        onSelect={(id) => setSelectedOutreachId(id)}
      />

      <ConfirmDialog
        visible={confirmingBatch}
        icon="account-check-outline"
        title={plan && plan.accept.length > 0 ? `Accept top ${plan.accept.length}?` : 'Update the waitlist?'}
        message={
          plan
            ? [
                plan.accept.length > 0
                  ? `The ${plan.accept.length} best-ranked ${plan.accept.length === 1 ? 'applicant' : 'applicants'} will be accepted and emailed.`
                  : null,
                plan.waitlist.length > 0
                  ? `The next ${plan.waitlist.length} will be waitlisted and told their place in the queue.`
                  : null,
                plan.leftPending.length > 0
                  ? `${plan.leftPending.length} will stay pending — the waitlist is full.`
                  : null,
                'Nobody is rejected. You can still decide each applicant individually.',
              ]
                .filter(Boolean)
                .join('\n\n')
            : undefined
        }
        confirmLabel="Confirm"
        busy={batchDecide.isPending}
        onConfirm={runBatch}
        onCancel={() => setConfirmingBatch(false)}
      />

      {applicationsQuery.isLoading ? (
        <ListSkeleton rows={3} rowHeight={180} />
      ) : applicationsQuery.isError ? (
        <View style={styles.centerFill}>
          <ErrorState
            message={
              applicationsQuery.error instanceof Error ? applicationsQuery.error.message : 'Please try again.'
            }
            onRetry={() => applicationsQuery.refetch()}
          />
        </View>
      ) : (
        <FlatList
          style={styles.flex}
          data={filteredApplications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={applicationsQuery.isRefetching}
              onRefresh={() => applicationsQuery.refetch()}
            />
          }
          /*
            Everything between the selector and the applicants scrolls WITH the
            applicants. Pinned, these five sections filled a phone screen and
            left the list — the thing the tab exists for — showing perhaps one
            card.

            Each section is separated by a real margin (see styles.section*)
            rather than being stacked flush. Sections that touch are what made
            this screen read as unfinished.
          */
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {/* Back to the event itself — its details, check-in code and attendance. */}
              {selectedOutreach ? (
                <Pressable
                  onPress={() => router.push(`/(organisation)/outreach/${selectedOutreach.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Manage ${selectedOutreach.title}`}
                  style={({ pressed }) => [styles.manageRow, pressed && styles.manageRowPressed]}
                >
                  <MaterialCommunityIcons name="calendar-check-outline" size={18} color={colors.primary} />
                  <Text style={styles.manageText}>Manage this event</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textSecondary} />
                </Pressable>
              ) : null}

              {/*
                Draft outreaches are excluded: an unpublished event has no
                applicants, so a roster bar would only ever read "0 of N".
              */}
              {selectedOutreach && selectedOutreach.status !== 'draft' && plan ? (
                <RosterSummaryCard
                  slotsFilled={selectedOutreach.slots_filled}
                  slotsTotal={selectedOutreach.slots_total}
                  pendingCount={pendingCount}
                  waitlistedCount={waitlistedCount}
                  coverage={coverage}
                  acceptCount={plan.accept.length}
                  waitlistCount={plan.waitlist.length}
                  leftPendingCount={plan.leftPending.length}
                  onAcceptTop={() => setConfirmingBatch(true)}
                  isPending={batchDecide.isPending}
                />
              ) : null}

              {batchOutcome ? <Text style={styles.batchOutcome}>{batchOutcome}</Text> : null}
              {batchDecide.isError ? (
                <Text style={styles.batchError}>
                  {batchDecide.error instanceof Error
                    ? batchDecide.error.message
                    : 'Could not process these applicants. Please try again.'}
                </Text>
              ) : null}

              {/*
                Check-in and Mark attendance USED to sit here. They are
                event-DAY actions and this screen is for deciding who gets a
                place — a different job at a different moment — so they now live
                on the outreach's own management screen,
                app/(organisation)/outreach/[id].tsx, which the dashboard card
                opens. That is their permanent home; do not move them back here
                for want of somewhere to put them.

                A link back to that screen sits above, so an organiser who came
                straight to the applicant list is one tap from the event.
              */}

              {/* No wrapper: the listHeader gap owns the space on both sides. */}
              <FilterChips options={FILTERS} value={statusFilter} onChange={setStatusFilter} />
            </View>
          }
          renderItem={({ item }) => (
            <ApplicantCard
              application={item}
              requiredSkills={selectedOutreach?.required_skills ?? []}
              waitlistPosition={positions.get(item.id)}
              onDecide={(status) => handleDecide(item, status)}
              onViewProfile={
                item.volunteer && selectedOutreachId
                  ? () =>
                      router.push(
                        // applicationId + outreachId turn the profile screen
                        // into a decision screen, so the org can act on what
                        // it just read without navigating back here.
                        `/profile/volunteer/${item.volunteer!.id}?applicationId=${item.id}&outreachId=${selectedOutreachId}`
                      )
                  : undefined
              }
              isPending={updateStatus.isPending && activeApplicationId === item.id}
              errorMessage={
                updateStatus.isError && activeApplicationId === item.id
                  ? updateStatus.error instanceof Error
                    ? updateStatus.error.message
                    : 'Could not update this application.'
                  : undefined
              }
            />
          )}
          ListEmptyComponent={
            applications.length === 0 ? (
              <EmptyState
                icon="account-question-outline"
                title="No applicants yet"
                message="Once volunteers apply to this outreach, they'll show up here for review."
              />
            ) : (
              <EmptyState
                icon="filter-variant"
                title="Nothing in this filter"
                message="Try a different status filter."
              />
            )
          }
        />
      )}
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
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
    paddingBottom: spacing.md,
  },
  /*
    One rule owns the gap between every section in the scrolling header, so the
    spacing cannot drift as sections are added or removed. `gap` rather than
    per-child margins: a section that is conditionally hidden then leaves no
    orphaned space behind it.
  */
  listHeader: {
    gap: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  manageText: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  manageRowPressed: {
    opacity: 0.85,
  },
  batchOutcome: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  batchError: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.sm,
  },
});
