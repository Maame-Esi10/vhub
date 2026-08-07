import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { EmptyState, ErrorState, FilterChips, ListSkeleton, isUpcomingEvent } from '@/components/ui';
import type { FilterChipOption } from '@/components/ui';
import { ApplicantCard, OutreachPicker } from '@/components/organisation';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  useOrganisationOutreaches,
  useOutreachApplications,
  useUpdateApplicationStatus,
} from '@/hooks';
import type { ApplicationWithVolunteer, OrganisationApplicationDecision } from '@/hooks';
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

  const filteredApplications = useMemo(
    () =>
      statusFilter === 'all' ? applications : applications.filter((a) => a.status === statusFilter),
    [applications, statusFilter]
  );

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

      <View style={styles.pickerWrap}>
        <OutreachPicker
          outreaches={outreaches}
          selectedId={selectedOutreachId}
          onSelect={(id) => setSelectedOutreachId(id)}
        />
      </View>

      {/*
        The way in to the check-in QR. It lives here rather than on the
        dashboard card because this screen is already scoped to ONE outreach,
        which is what the QR is for — and the card's single quick-action slot
        is spoken for by Publish/Close.

        Hidden for drafts: an unpublished outreach has no accepted volunteers,
        so nobody could scan it.
      */}
      {selectedOutreach && selectedOutreach.status !== 'draft' ? (
        <Pressable
          onPress={() => router.push(`/(organisation)/checkin/${selectedOutreach.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Show check-in code for ${selectedOutreach.title}`}
          style={({ pressed }) => [styles.checkinRow, pressed && styles.checkinRowPressed]}
        >
          <MaterialCommunityIcons name="qrcode" size={20} color={colors.primary} />
          <View style={styles.checkinText}>
            <Text style={styles.checkinTitle}>Show check-in code</Text>
            <Text style={styles.checkinMeta}>Display this at the venue for volunteers to scan.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
        </Pressable>
      ) : null}

      {/*
        Only once the event has actually started. Before that there is nothing
        to mark, and offering it early invites an organiser to "confirm" a
        roster for an event nobody has attended yet.
      */}
      {selectedOutreach &&
      selectedOutreach.status !== 'draft' &&
      !isUpcomingEvent(selectedOutreach.date, selectedOutreach.start_time) ? (
        <Pressable
          onPress={() => router.push(`/(organisation)/attendance/${selectedOutreach.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Mark attendance for ${selectedOutreach.title}`}
          style={({ pressed }) => [styles.checkinRow, pressed && styles.checkinRowPressed]}
        >
          <MaterialCommunityIcons name="clipboard-check-outline" size={20} color={colors.primary} />
          <View style={styles.checkinText}>
            <Text style={styles.checkinTitle}>Mark attendance</Text>
            <Text style={styles.checkinMeta}>Everyone counts as present — flag only the no-shows.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
        </Pressable>
      ) : null}

      <View style={styles.filtersWrap}>
        <FilterChips options={FILTERS} value={statusFilter} onChange={setStatusFilter} />
      </View>

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
          renderItem={({ item }) => (
            <ApplicantCard
              application={item}
              requiredSkills={selectedOutreach?.required_skills ?? []}
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
  },
  pickerWrap: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.base,
  },
  checkinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  checkinRowPressed: {
    opacity: 0.85,
  },
  checkinText: {
    flex: 1,
  },
  checkinTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  checkinMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  filtersWrap: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
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
