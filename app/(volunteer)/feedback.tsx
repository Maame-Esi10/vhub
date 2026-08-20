import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  ScreenHeader,
  VScoreBadge,
  formatEventDate,
} from '@/components/ui';
import { getRemarkLabel, getRemarkTone } from '@/constants/review-remarks';
import { useMyReviews, useOutreachDaysForMany } from '@/hooks';
import { formatDaySpan } from '@/lib/outreachDays';
import type { MyEventReview } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

/**
 * The volunteer's own feedback (screen 5, owner decision 2026-08-05).
 *
 * They see EVERYTHING written about them: every star, every remark chip, and
 * the organiser's free-text note in full. That asymmetry with the
 * organisation's aggregated view is the point — feedback you cannot read is
 * feedback you cannot act on, and a reputation score that moves for reasons
 * you are not allowed to know is not accountability, it is a rating you are
 * subject to.
 *
 * No Figma design exists for this screen, so it reuses the app's language:
 * ScreenHeader, the neutral card treatment, the chip styling from the review
 * sheet.
 *
 * The reviewing ORGANISATION is not named — only the event. The event already
 * implies who ran it, and naming a reviewer turns "here is how that day went"
 * into "this person said this about you".
 */
export default function VolunteerFeedback() {
  const volunteerId = useAuthStore((state) => state.user)?.id;
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);
  const reviewsQuery = useMyReviews(volunteerId);

  const reviews = useMemo(() => reviewsQuery.data ?? [], [reviewsQuery.data]);

  /*
    The days each reviewed event ran on, batched. A review of a four-day
    campaign printed the campaign's FIRST day, so a volunteer reading their own
    history could not tell which piece of work a review was about when an
    organisation ran several events in the same week.
  */
  const reviewDays = useOutreachDaysForMany(
    useMemo(
      () => reviews.map((review) => review.outreach?.id).filter((id): id is string => !!id),
      [reviews]
    )
  );

  if (reviewsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="My feedback" fallback="/(volunteer)/profile" />
        <ListSkeleton rows={3} rowHeight={140} />
      </SafeAreaView>
    );
  }

  if (reviewsQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="My feedback" fallback="/(volunteer)/profile" />
        <View style={styles.centerFill}>
          <ErrorState
            message={reviewsQuery.error.message}
            onRetry={() => void reviewsQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="My feedback" fallback="/(volunteer)/profile" />

      <FlatList
        data={reviews}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          reviews.length > 0 ? (
            <View style={styles.intro}>
              <View style={styles.introRow}>
                <Text style={styles.introTitle}>
                  {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
                </Text>
                {typeof volunteerProfile?.v_score === 'number' ? (
                  <VScoreBadge score={volunteerProfile.v_score} />
                ) : null}
              </View>
              <Text style={styles.introBody}>
                Everything organisations have written about your work. Organisations you apply to in
                future see only your averages and how often each remark comes up, never a single
                review, and never these notes.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ReviewCard
            review={item}
            days={
              item.outreach ? reviewDays.data?.[item.outreach.id]?.map((day) => day.day) : undefined
            }
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="message-star-outline"
            title="No feedback yet"
            message="Once an organisation reviews you after an outreach, everything they said appears here in full."
          />
        }
      />
    </SafeAreaView>
  );
}

function ReviewCard({ review, days }: { review: MyEventReview; days?: readonly string[] }) {
  // A no-show is shown plainly rather than hidden. It moved their V-Score, so
  // concealing it would leave the volunteer with a number they cannot explain.
  const noShow = review.attended === false;

  return (
    <View style={[styles.card, noShow && styles.cardNoShow]}>
      <Text style={styles.eventTitle} numberOfLines={2}>
        {review.outreach?.title ?? 'Outreach'}
      </Text>
      {review.outreach ? (
        <Text style={styles.eventDate}>
          {days && days.length > 0 ? formatDaySpan(days) : formatEventDate(review.outreach.date)}
        </Text>
      ) : null}

      {noShow ? (
        <View style={styles.noShowRow}>
          <MaterialCommunityIcons name="account-cancel-outline" size={16} color={colors.danger} />
          <Text style={styles.noShowText}>Recorded as a no-show for this event.</Text>
        </View>
      ) : (
        <>
          <View style={styles.scoreRow}>
            <ScorePill label="Reliability" value={review.reliability_score} />
            <ScorePill label="Clinical" value={review.clinical_score} />
          </View>

          {review.remark_chips.length > 0 ? (
            <View style={styles.chips}>
              {review.remark_chips.map((slug) => {
                const label = getRemarkLabel(slug);
                // A retired slug is skipped rather than rendered raw — a
                // volunteer should never be shown `needed_extra_supervision`.
                if (!label) return null;
                const tint =
                  getRemarkTone(slug) === 'constructive' ? colors.warning : colors.success;
                return (
                  <View key={slug} style={[styles.chip, { borderColor: tint }]}>
                    <Text style={[styles.chipLabel, { color: tint }]}>{label}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      )}

      {review.notes ? (
        <View style={styles.noteBlock}>
          <Text style={styles.noteLabel}>Note from the organiser</Text>
          <Text style={styles.noteText}>{review.notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ScorePill({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={styles.scorePill}>
      <Text style={styles.scoreLabel}>{label}</Text>
      {value === null ? (
        <Text style={styles.scoreEmpty}>Not rated</Text>
      ) : (
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <MaterialCommunityIcons
              key={star}
              name={star <= value ? 'star' : 'star-outline'}
              size={14}
              color={star <= value ? colors.warning : colors.border}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  intro: {
    marginBottom: spacing.base,
  },
  introRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  introTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  introBody: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  cardNoShow: {
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  eventTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  eventDate: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  scoreRow: {
    flexDirection: 'row',
    gap: spacing.base,
    marginTop: spacing.md,
  },
  scorePill: {
    gap: 2,
  },
  scoreLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  scoreEmpty: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  starRow: {
    flexDirection: 'row',
    gap: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
  noShowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  noShowText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
  },
  noteBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  noteLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.textSecondary,
  },
  noteText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
});
