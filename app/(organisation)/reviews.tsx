import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar, Badge, EmptyState, ErrorState, ListSkeleton, VScoreBadge } from '@/components/ui';
import { EventReviewSheet, OutreachPicker } from '@/components/organisation';
import type { EventReviewDraft } from '@/components/organisation';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  useOrganisationOutreaches,
  useOutreachApplications,
  useOutreachReviews,
  useSubmitEventReview,
} from '@/hooks';
import type { ApplicationWithVolunteer, OutreachWithCounts } from '@/hooks';
// Direct import: useAttendance stays out of the hooks barrel's native-module
// blast radius, and this is the read half (no expo-location).
import { useOutreachAttendance } from '@/hooks/useAttendance';
import { useAuthStore } from '@/stores/authStore';
import type { EventReview } from '@/types/database';

/**
 * Post-event review screen.
 *
 * Only `closed` and `completed` outreaches are reviewable: reviewing an event
 * that is still open would move a volunteer's V-Score before the event has
 * actually happened. Within one of those, only ACCEPTED applicants appear —
 * a rejected or withdrawn applicant never worked the event, so there is
 * nothing to score them on.
 */
export default function Reviews() {
  const router = useRouter();
  const organisationId = useAuthStore((s) => s.user)?.id;

  const outreachesQuery = useOrganisationOutreaches(organisationId);

  const reviewableOutreaches = useMemo(
    () =>
      (outreachesQuery.data ?? []).filter(
        (outreach) => outreach.status === 'closed' || outreach.status === 'completed'
      ),
    [outreachesQuery.data]
  );

  const [selectedOutreachId, setSelectedOutreachId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!selectedOutreachId && reviewableOutreaches.length > 0) {
      setSelectedOutreachId(reviewableOutreaches[0]?.id);
    }
  }, [selectedOutreachId, reviewableOutreaches]);

  const selectedOutreach = reviewableOutreaches.find((o) => o.id === selectedOutreachId);

  const applicationsQuery = useOutreachApplications(selectedOutreachId);
  const reviewsQuery = useOutreachReviews(selectedOutreachId);
  const attendanceQuery = useOutreachAttendance(selectedOutreachId);
  const submitReview = useSubmitEventReview();

  const attendance = attendanceQuery.data;

  const attendees = useMemo(
    () => (applicationsQuery.data ?? []).filter((a) => a.status === 'accepted'),
    [applicationsQuery.data]
  );

  const [reviewing, setReviewing] = useState<ApplicationWithVolunteer | null>(null);

  const reviews = reviewsQuery.data;
  const reviewedCount = attendees.filter((a) => reviews?.[a.volunteer_id] !== undefined).length;

  function handleSubmit(draft: EventReviewDraft) {
    if (!selectedOutreachId || !reviewing?.volunteer) return;
    submitReview.mutate(
      {
        outreachId: selectedOutreachId,
        volunteerId: reviewing.volunteer.id,
        attended: draft.attended,
        reliabilityScore: draft.reliabilityScore,
        clinicalScore: draft.clinicalScore,
        remarkChips: draft.remarkChips,
        notes: draft.notes,
      },
      { onSuccess: () => setReviewing(null) }
    );
  }

  if (outreachesQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>Post-Event Reviews</Text>
        <ListSkeleton rows={3} rowHeight={140} />
      </SafeAreaView>
    );
  }

  if (outreachesQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message={
              outreachesQuery.error instanceof Error ? outreachesQuery.error.message : 'Please try again.'
            }
            onRetry={() => outreachesQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (reviewableOutreaches.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>Post-Event Reviews</Text>
        <EmptyState
          icon="clipboard-check-outline"
          title="Nothing to review yet"
          message="Once you close or complete an outreach, the volunteers who attended will appear here for review."
          actionLabel="Go to dashboard"
          onAction={() => router.push('/(organisation)/dashboard')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Post-Event Reviews</Text>

      <View style={styles.pickerWrap}>
        <OutreachPicker
          outreaches={reviewableOutreaches as OutreachWithCounts[]}
          selectedId={selectedOutreachId}
          onSelect={setSelectedOutreachId}
        />
      </View>

      {attendees.length > 0 ? (
        <View style={styles.progress}>
          <MaterialCommunityIcons name="clipboard-check-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.progressText}>
            {reviewedCount} of {attendees.length} reviewed
          </Text>
        </View>
      ) : null}

      {applicationsQuery.isLoading || reviewsQuery.isLoading ? (
        <ListSkeleton rows={3} rowHeight={120} />
      ) : applicationsQuery.isError ? (
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
      ) : (
        <FlatList
          style={styles.flex}
          data={attendees}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={applicationsQuery.isRefetching || reviewsQuery.isRefetching}
              onRefresh={() => {
                applicationsQuery.refetch();
                reviewsQuery.refetch();
              }}
            />
          }
          renderItem={({ item }) => (
            <AttendeeRow
              application={item}
              review={reviews?.[item.volunteer_id] ?? null}
              onPress={() => setReviewing(item)}
              onViewProfile={
                item.volunteer ? () => router.push(`/profile/volunteer/${item.volunteer!.id}`) : undefined
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="account-off-outline"
              title="No attendees to review"
              message="Nobody was accepted onto this outreach, so there are no volunteers to score."
            />
          }
        />
      )}

      <EventReviewSheet
        visible={reviewing !== null}
        volunteerName={reviewing?.volunteer?.profile?.full_name ?? 'This volunteer'}
        outreachTitle={selectedOutreach?.title ?? ''}
        showClinicalScore={selectedOutreach?.role_type === 'clinical'}
        existingReview={reviewing ? (reviews?.[reviewing.volunteer_id] ?? null) : null}
        // Seeded from the attendance screen so the two cannot disagree about
        // the same event: someone already flagged absent opens as a no-show
        // rather than as "attended" waiting to be corrected.
        markedAbsent={
          reviewing
            ? attendance?.[reviewing.volunteer_id]?.organiser_status === 'absent'
            : undefined
        }
        isPending={submitReview.isPending}
        errorMessage={
          submitReview.isError
            ? submitReview.error instanceof Error
              ? submitReview.error.message
              : 'Could not save this review.'
            : undefined
        }
        onSubmit={handleSubmit}
        onDismiss={() => setReviewing(null)}
      />
    </SafeAreaView>
  );
}

interface AttendeeRowProps {
  application: ApplicationWithVolunteer;
  review: EventReview | null;
  onPress: () => void;
  onViewProfile?: () => void;
}

function AttendeeRow({ application, review, onPress, onViewProfile }: AttendeeRowProps) {
  const volunteer = application.volunteer;
  const name = volunteer?.profile?.full_name ?? 'Volunteer';
  const reviewed = review !== null;

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.cardHeader}
        onPress={onViewProfile}
        disabled={!onViewProfile}
        accessibilityRole={onViewProfile ? 'button' : undefined}
        accessibilityLabel={onViewProfile ? `View ${name}'s profile` : undefined}
      >
        <Avatar name={name} uri={volunteer?.profile?.avatar_url} size={44} />
        <View style={styles.cardHeaderText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {/* The V-Score shown here is the one this review will move. */}
          <Text style={styles.meta} numberOfLines={1}>
            {volunteer?.events_attended ?? 0} events attended
          </Text>
        </View>
        {typeof volunteer?.v_score === 'number' ? (
          <VScoreBadge score={volunteer.v_score} size="sm" />
        ) : null}
      </Pressable>

      {reviewed ? (
        <View style={styles.reviewSummary}>
          <Badge
            label={review.attended ? 'Attended' : 'No-show'}
            tone={review.attended ? 'success' : 'danger'}
          />
          {review.attended && review.reliability_score !== null ? (
            <Text style={styles.scoreText}>Reliability {review.reliability_score}/5</Text>
          ) : null}
          {review.attended && review.clinical_score !== null ? (
            <Text style={styles.scoreText}>Clinical {review.clinical_score}/5</Text>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={reviewed ? `Edit review for ${name}` : `Review ${name}`}
        style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      >
        <MaterialCommunityIcons
          name={reviewed ? 'pencil-outline' : 'star-outline'}
          size={16}
          color={colors.primary}
        />
        <Text style={styles.actionLabel}>{reviewed ? 'Edit review' : 'Review volunteer'}</Text>
      </Pressable>
    </View>
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
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  progressText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.base,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardHeaderText: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  reviewSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  scoreText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  actionPressed: {
    opacity: 0.75,
  },
  actionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
});
