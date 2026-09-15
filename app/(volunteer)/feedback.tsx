import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  ListSkeleton,
  ScreenHeader,
  Badge,
  Toast,
  VScoreBadge,
  formatEventDate,
} from '@/components/ui';
import { getRemarkLabel, getRemarkTone } from '@/constants/review-remarks';
import {
  SCORE_EVENT_LABELS,
  useMyDisputes,
  useMyReviews,
  useMyScoreEvents,
  useOutreachDaysForMany,
  useRaiseDispute,
  type MyEventReview,
  type ScoreEventRow,
} from '@/hooks';
import type { Dispute, DisputeType } from '@/types/database';
import { formatDaySpan } from '@/lib/outreachDays';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { humanError } from '@/lib/errorMessage';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

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
  // The floating tab bar is absolute and reserves no space, so the last
  // element needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  const volunteerId = useAuthStore((state) => state.user)?.id;
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);
  const reviewsQuery = useMyReviews(volunteerId);

  /*
    THE DEDUCTIONS THAT WERE NOT REVIEWS. A cancelled place and a day dropped
    inside 24 hours both move a V-Score and produce no review, so before this
    they were the one thing that could change somebody's number with nothing
    anywhere to explain it. `score_events.reason` is non-blank by check
    constraint precisely so there is always something honest to show here.
  */
  const deductionsQuery = useMyScoreEvents(volunteerId);

  const reviews = useMemo(() => reviewsQuery.data ?? [], [reviewsQuery.data]);

  /*
    DISPUTES, keyed by outreach so a card can show its own state.

    One query for all of them rather than one per card, the same batching the
    day lookups use — a volunteer with thirty reviews must not become thirty
    round trips.
  */
  const disputesQuery = useMyDisputes();
  const raiseDispute = useRaiseDispute();
  const disputesByOutreach = useMemo(() => {
    const map = new Map<string, Dispute>();
    for (const dispute of disputesQuery.data ?? []) {
      // Newest first from the query, so the first one seen for an outreach is
      // the one worth showing.
      if (!map.has(dispute.outreach_id)) map.set(dispute.outreach_id, dispute);
    }
    return map;
  }, [disputesQuery.data]);

  const [disputing, setDisputing] = useState<{
    outreachId: string;
    title: string;
    type: DisputeType;
  } | null>(null);
  const [statement, setStatement] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [disputeToast, setDisputeToast] = useState<string | null>(null);

  function submitDispute() {
    setAttempted(true);
    if (!disputing || statement.trim().length < 10) return;

    raiseDispute.mutate(
      {
        outreachId: disputing.outreachId,
        type: disputing.type,
        statement: statement.trim(),
      },
      {
        onSuccess: () => {
          setDisputing(null);
          setStatement('');
          setAttempted(false);
          setDisputeToast('Sent. VHub will look at it and tell you and the organiser the outcome.');
        },
      }
    );
  }

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
            message={humanError(reviewsQuery.error)}
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
        contentContainerStyle={[styles.listContent, tabBarPadding]}
        ListHeaderComponent={
          <>
            {reviews.length > 0 ? (
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
                  Everything organisations have written about your work. Organisations you apply to
                  in future see only your averages and how often each remark comes up, never a
                  single review, and never these notes.
                </Text>
              </View>
            ) : null}

            {/*
              RENDERS NOTHING WHEN THERE ARE NONE, which is almost everybody. An
              empty "deductions" heading on a good volunteer's screen implies
              there is a record to worry about.

              It sits ABOVE the reviews and outside the intro card, because it
              is a different kind of thing: the reviews are what people said,
              this is what the platform did.
            */}
            {(deductionsQuery.data ?? []).length > 0 ? (
              <View style={styles.deductions}>
                <Text style={styles.deductionsTitle}>Score deductions</Text>
                <Text style={styles.deductionsBody}>
                  Points taken off your V-Score for something other than a review: cancelling a
                  place you had been given, or dropping a day you had committed to inside 24 hours
                  of it. Each one says what it was for. Later events pull your score back up.
                </Text>
                {(deductionsQuery.data ?? []).map((deduction) => (
                  <DeductionCard key={deduction.id} deduction={deduction} />
                ))}
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <ReviewCard
            review={item}
            days={
              item.outreach ? reviewDays.data?.[item.outreach.id]?.map((day) => day.day) : undefined
            }
            dispute={item.outreach ? disputesByOutreach.get(item.outreach.id) : undefined}
            onDispute={(type) => {
              if (!item.outreach) return;
              setDisputing({ outreachId: item.outreach.id, title: item.outreach.title, type });
              setStatement('');
              setAttempted(false);
            }}
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
      {/*
        The statement and the act of disputing are one thing. Splitting them
        would let a volunteer file a dispute and be asked afterwards what it was
        about — and an admin cannot judge a complaint with no account of it.
      */}
      <ConfirmDialog
        visible={!!disputing}
        icon="scale-balance"
        title={
          disputing?.type === 'attendance' ? 'You were there?' : 'Why is this unfair?'
        }
        message={
          disputing?.type === 'attendance'
            ? `Tell VHub what happened at ${disputing.title}. Anything that helps: whether you scanned the code, who you worked with, when you arrived.`
            : `Tell VHub why the review of ${disputing?.title ?? 'this event'} is not fair. Both you and the organiser will be told the outcome and the reason.`
        }
        confirmLabel="Send it"
        cancelLabel="Not now"
        busy={raiseDispute.isPending}
        onConfirm={submitDispute}
        onCancel={() => {
          setDisputing(null);
          setStatement('');
          setAttempted(false);
        }}
      >
        <Input
          label="What happened"
          required
          value={statement}
          onChangeText={setStatement}
          placeholder="In your own words"
          multiline
          error={
            attempted && statement.trim().length < 10
              ? 'Give VHub something to go on, a sentence or two at least.'
              : undefined
          }
        />
        {raiseDispute.error ? (
          <Text style={styles.disputeError}>{humanError(raiseDispute.error)}</Text>
        ) : null}
      </ConfirmDialog>

      <Toast message={disputeToast} onDismiss={() => setDisputeToast(null)} durationMs={5000} />

    </SafeAreaView>
  );
}

/**
 * One deduction, in the volunteer's own words rather than the enum's.
 *
 * A REVERSED ONE IS STILL SHOWN, and shown as reversed. Hiding it would mean
 * somebody who had been told about a penalty could later find no trace of it,
 * which reads as the app having lost the record rather than as the penalty
 * having been withdrawn — and the admin's reason for reversing it is the part
 * they most want to read.
 */
function DeductionCard({ deduction }: { deduction: ScoreEventRow }) {
  const reversed = deduction.voided_at !== null;

  return (
    <View style={[styles.deductionCard, reversed && styles.deductionCardReversed]}>
      <View style={styles.deductionHeader}>
        <Text style={styles.deductionPoints}>{deduction.points}</Text>
        <Text style={styles.deductionKind} numberOfLines={1}>
          {SCORE_EVENT_LABELS[deduction.kind]}
        </Text>
        {reversed ? <Badge label="Reversed" tone="success" /> : null}
      </View>

      <Text style={styles.deductionMeta} numberOfLines={2}>
        {deduction.outreach?.title ?? 'Event no longer listed'} ·{' '}
        {formatEventDate(deduction.created_at)}
      </Text>

      <Text style={styles.deductionReason}>{deduction.reason}</Text>

      {reversed ? (
        <View style={styles.deductionReversedBlock}>
          <Text style={styles.deductionReversedLabel}>
            These points were put back on your score.
          </Text>
          {deduction.voided_reason ? (
            <Text style={styles.deductionReason}>{deduction.voided_reason}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ReviewCard({
  review,
  days,
  dispute,
  onDispute,
}: {
  review: MyEventReview;
  days?: readonly string[];
  /** An existing dispute about this event, if there is one. */
  dispute?: Dispute;
  onDispute: (type: DisputeType) => void;
}) {
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

      {/*
        DISPUTING IS OFFERED HERE because this is the only screen where a
        volunteer sees what was said about them, and a record you can read but
        cannot answer is worse than one you never see.

        Two different challenges, and which is offered depends on what the
        review says: "I was there" only makes sense against a no-show, while
        "this is unfair" only makes sense against ratings. Offering both
        everywhere would ask the volunteer to work out which one applies.
      */}
      {dispute ? (
        <View style={styles.disputeState}>
          <MaterialCommunityIcons
            name={
              dispute.status === 'open'
                ? 'clock-outline'
                : dispute.status === 'upheld'
                  ? 'check-circle-outline'
                  : 'information-outline'
            }
            size={16}
            color={dispute.status === 'upheld' ? colors.success : colors.textSecondary}
          />
          <Text style={styles.disputeStateText}>
            {dispute.status === 'open'
              ? 'You have disputed this. VHub is looking at it.'
              : dispute.status === 'upheld'
                ? `Upheld. ${dispute.resolution ?? ''}`
                : `Not upheld. ${dispute.resolution ?? ''}`}
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={() => onDispute(noShow ? 'attendance' : 'review')}
          accessibilityRole="button"
          accessibilityLabel={noShow ? 'Say you were there' : 'Say this review is unfair'}
          style={({ pressed }) => [styles.disputeRow, pressed && styles.disputePressed]}
        >
          <MaterialCommunityIcons name="scale-balance" size={16} color={colors.textSecondary} />
          <Text style={styles.disputeLabel}>
            {noShow ? 'I was there, dispute this' : 'I think this is unfair'}
          </Text>
        </Pressable>
      )}
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
  /*
    Given real breathing room from the intro card above and the first review
    card below, rather than dropped flush into the stack — a section jammed
    against its neighbours reads as unfinished.
  */
  deductions: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  deductionsTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  deductionsBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  deductionCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  deductionCardReversed: { opacity: 0.72 },
  deductionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  deductionPoints: { fontFamily: fontFamily.semiBold, fontSize: 18, color: colors.danger },
  deductionKind: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
  deductionMeta: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary },
  deductionReason: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  deductionReversedBlock: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  deductionReversedLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.success,
  },
  disputeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.base,
    paddingVertical: spacing.sm,
  },
  disputePressed: { opacity: 0.7 },
  disputeLabel: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.textSecondary },
  disputeState: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  disputeStateText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  disputeError: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.danger },
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

    // alignItems centres children within their line; alignContent places
    // the line itself, and defaults to flex-start. Without it a wrapping row
    // pins its single line to the TOP of the box.
    alignContent: 'center',
    justifyContent: 'space-between',
    // Wraps instead of clipping when the row outgrows its width at a large
    // system font size. rowGap only applies between wrapped lines, so a row
    // that still fits on one is unaffected.
    flexWrap: 'wrap',
    rowGap: 4,
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
