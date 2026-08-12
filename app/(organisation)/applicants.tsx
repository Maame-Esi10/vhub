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
  useOutreachRoles,
  useUpdateApplicationStatus,
} from '@/hooks';
import type { ApplicationWithVolunteer, OrganisationApplicationDecision } from '@/hooks';
import {
  groupApplicantsByRole,
  planBatchAccept,
  rankApplicants,
  skillCoverage,
  waitlistPositions,
} from '@/lib/roster';
import { VOLUNTEER_CATEGORIES } from '@/constants/categories';
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
  // Empty means single-role mode — the same rule the database uses.
  const rolesQuery = useOutreachRoles(selectedOutreachId);
  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);
  // Which section's batch is being confirmed, keyed by roleId ('' for the
  // single-role / role-less section). Null means no dialog is open.
  const [confirmingRoleId, setConfirmingRoleId] = useState<string | null>(null);
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
        outreachRoleId: application.outreach_role_id,
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


  /*
    ONE ROSTER SECTION PER ROLE, and per the owner's decision that is a stack
    rather than a selector: the point of multi-role is seeing at a glance that
    you have your nurses but not your students, and a selector hides
    three-quarters of that behind a tap. Skill coverage is per role too.

    In single-role mode this produces exactly one section with roleId null, so
    the screen is unchanged for every outreach that has no roles — the n=1 case
    again, not a branch.
  */
  const sections = useMemo(() => {
    const groups = groupApplicantsByRole(
      rankable,
      roles.map((role) => role.id)
    );

    return groups.map((group) => {
      const role = roles.find((r) => r.id === group.roleId) ?? null;

      // Per-role slot counts when there is a role; the outreach's own when
      // there is not.
      const slotsTotal = role?.slots_total ?? selectedOutreach?.slots_total ?? 0;
      const slotsFilled = role?.slots_filled ?? selectedOutreach?.slots_filled ?? 0;

      const accepted = group.applicants.filter((a) => a.status === 'accepted');

      return {
        roleId: group.roleId,
        title: role
          ? (VOLUNTEER_CATEGORIES.find((c) => c.value === role.category)?.label ?? role.category)
          : null,
        applicants: group.applicants,
        slotsTotal,
        slotsFilled,
        pendingCount: group.applicants.filter((a) => a.status === 'pending').length,
        waitlistedCount: group.applicants.filter((a) => a.status === 'waitlisted').length,
        // A role's own skills where it states them, else the outreach's — the
        // same inheritance the scorer uses.
        coverage: skillCoverage(
          role?.required_skills ?? selectedOutreach?.required_skills,
          accepted.map((a) => a.application.volunteer?.skill_tags)
        ),
        plan: planBatchAccept({ applicants: group.applicants, slotsTotal, slotsFilled }),
      };
    });
  }, [rankable, roles, selectedOutreach]);

  /*
    Rows for one FlatList: a heading per role, then that role's applicants.
    Grouped rather than one flat list, because on a multi-role event an
    applicant card that names no role tells an organiser nothing about which
    requirement it answers.
  */
  type Row =
    | { kind: 'heading'; key: string; title: string; count: number }
    | { kind: 'applicant'; key: string; application: ApplicationWithVolunteer };

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const multiRole = roles.length > 0;

    for (const section of sections) {
      const visible = section.applicants
        .map((entry) => entry.application)
        .filter((a) => statusFilter === 'all' || a.status === statusFilter);

      // The heading is only meaningful when there is more than one group.
      if (multiRole) {
        out.push({
          kind: 'heading',
          key: `heading-${section.roleId ?? 'other'}`,
          title: section.title ?? 'No role chosen',
          count: visible.length,
        });
      }

      for (const application of visible) {
        out.push({ kind: 'applicant', key: application.id, application });
      }
    }

    return out;
  }, [sections, roles.length, statusFilter]);

  const visibleApplicantCount = rows.filter((row) => row.kind === 'applicant').length;

  const confirming =
    confirmingRoleId === null
      ? null
      : (sections.find((section) => (section.roleId ?? '') === confirmingRoleId) ?? null);

  function runBatch() {
    if (!confirming || !selectedOutreachId) return;
    const decisions = [
      ...confirming.plan.accept.map((applicationId) => ({ applicationId, status: 'accepted' as const })),
      ...confirming.plan.waitlist.map((applicationId) => ({ applicationId, status: 'waitlisted' as const })),
    ];
    if (decisions.length === 0) return;

    batchDecide.mutate(
      { outreachId: selectedOutreachId, decisions },
      {
        onSuccess: (result) => {
          setConfirmingRoleId(null);
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
        onError: () => setConfirmingRoleId(null),
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
        visible={confirming !== null}
        icon="account-check-outline"
        title={
          confirming && confirming.plan.accept.length > 0
            ? `Accept top ${confirming.plan.accept.length}${confirming.title ? ` for ${confirming.title}` : ''}?`
            : 'Update the waitlist?'
        }
        message={
          confirming
            ? [
                confirming.plan.accept.length > 0
                  ? `The ${confirming.plan.accept.length} best-ranked ${confirming.plan.accept.length === 1 ? 'applicant' : 'applicants'}${confirming.title ? ` for ${confirming.title}` : ''} will be accepted and emailed.`
                  : null,
                confirming.plan.waitlist.length > 0
                  ? `The next ${confirming.plan.waitlist.length} will be waitlisted and told their place in the queue.`
                  : null,
                confirming.plan.leftPending.length > 0
                  ? `${confirming.plan.leftPending.length} will stay pending — the waitlist is full.`
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
        onCancel={() => setConfirmingRoleId(null)}
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
          data={rows}
          keyExtractor={(item) => item.key}
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
              {selectedOutreach && selectedOutreach.status !== 'draft'
                ? sections.map((section) => (
                    <RosterSummaryCard
                      key={section.roleId ?? 'all'}
                      roleTitle={section.title}
                      slotsFilled={section.slotsFilled}
                      slotsTotal={section.slotsTotal}
                      pendingCount={section.pendingCount}
                      waitlistedCount={section.waitlistedCount}
                      coverage={section.coverage}
                      acceptCount={section.plan.accept.length}
                      waitlistCount={section.plan.waitlist.length}
                      leftPendingCount={section.plan.leftPending.length}
                      onAcceptTop={() => setConfirmingRoleId(section.roleId ?? '')}
                      isPending={batchDecide.isPending}
                    />
                  ))
                : null}

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
          renderItem={({ item }) => {
            if (item.kind === 'heading') {
              return (
                <View style={styles.roleHeading}>
                  <Text style={styles.roleHeadingText}>{item.title}</Text>
                  <Text style={styles.roleHeadingCount}>{item.count}</Text>
                </View>
              );
            }

            const application = item.application;
            return (
              <ApplicantCard
                application={application}
                requiredSkills={
                  roles.find((role) => role.id === application.outreach_role_id)?.required_skills ??
                  selectedOutreach?.required_skills ??
                  []
                }
                waitlistPosition={positions.get(application.id)}
                onDecide={(status) => handleDecide(application, status)}
                onViewProfile={
                  application.volunteer && selectedOutreachId
                    ? () =>
                        router.push(
                          // applicationId + outreachId turn the profile screen
                          // into a decision screen, so the org can act on what
                          // it just read without navigating back here.
                          `/profile/volunteer/${application.volunteer!.id}?applicationId=${application.id}&outreachId=${selectedOutreachId}`
                        )
                    : undefined
                }
                isPending={updateStatus.isPending && activeApplicationId === application.id}
                errorMessage={
                  updateStatus.isError && activeApplicationId === application.id
                    ? updateStatus.error instanceof Error
                      ? updateStatus.error.message
                      : 'Could not update this application.'
                    : undefined
                }
              />
            );
          }}
          ListEmptyComponent={
            visibleApplicantCount === 0 && applications.length === 0 ? (
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
  roleHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  roleHeadingText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  roleHeadingCount: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
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
