import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getRemarkLabel, getRemarkTone } from '@/constants/review-remarks';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { VolunteerReviewSummary } from '@/types/database';

/**
 * What an ORGANISATION sees about a volunteer's reviews (screen 6, owner
 * decision 2026-08-05): an aggregate, never an individual review.
 *
 * This is a fairness decision, not a convenience one. The averages and chip
 * frequencies give a genuinely informative picture at a glance, while ensuring
 * a volunteer is judged on their PATTERN of contribution rather than on one bad
 * day or one grumpy reviewer — and it rewards consistency, which is what the
 * system is actually trying to measure. The volunteer sees the same reviews in
 * full, notes included, on their own feedback screen.
 *
 * Nothing here identifies a reviewer, an event, or a note. If you ever find
 * yourself adding one, that is the decision being reversed, not a detail.
 */

/** Below this, an average is a coincidence rather than a pattern, and is labelled as such. */
const THIN_EVIDENCE_THRESHOLD = 3;

/** Chips shown before the list is cut off — enough to see a pattern, not a wall. */
const MAX_CHIPS = 6;

export interface ReviewSummaryCardProps {
  summary: VolunteerReviewSummary;
}

export function ReviewSummaryCard({ summary }: ReviewSummaryCardProps) {
  const { reviews_count: reviewsCount, avg_reliability: reliability, avg_clinical: clinical } =
    summary;

  if (reviewsCount === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Review summary</Text>
        <Text style={styles.empty}>
          No reviews yet. New volunteers start without a record — that is not a bad one.
        </Text>
      </View>
    );
  }

  const chips = summary.remark_counts.slice(0, MAX_CHIPS);

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Review summary</Text>
        <Text style={styles.count}>
          {reviewsCount} {reviewsCount === 1 ? 'review' : 'reviews'}
        </Text>
      </View>

      <View style={styles.averages}>
        <AverageBlock label="Reliability" value={reliability} />
        <AverageBlock label="Clinical" value={clinical} />
      </View>

      {reviewsCount < THIN_EVIDENCE_THRESHOLD ? (
        // Said out loud, because an average over one review renders exactly
        // like an average over fifty and would otherwise be read as settled.
        <View style={styles.thinNote}>
          <MaterialCommunityIcons name="information-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.thinNoteText}>
            Based on very few reviews so far, so treat it as a first impression rather than a track
            record.
          </Text>
        </View>
      ) : null}

      {chips.length > 0 ? (
        <View style={styles.chips}>
          {chips.map((entry) => {
            const label = getRemarkLabel(entry.chip);
            if (!label) return null;
            const tint = getRemarkTone(entry.chip) === 'constructive' ? colors.warning : colors.success;
            return (
              <View key={entry.chip} style={[styles.chip, { borderColor: tint }]}>
                <Text style={[styles.chipLabel, { color: tint }]}>{label}</Text>
                <Text style={styles.chipCount}>×{entry.count}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={styles.footnote}>
        Individual reviews and organisers&apos; notes stay private to the volunteer and whoever
        wrote them.
      </Text>
    </View>
  );
}

function AverageBlock({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={styles.average}>
      <Text style={styles.averageLabel}>{label}</Text>
      {value === null ? (
        <Text style={styles.averageEmpty}>Not scored</Text>
      ) : (
        <View style={styles.averageValueRow}>
          <MaterialCommunityIcons name="star" size={16} color={colors.warning} />
          <Text style={styles.averageValue}>{value.toFixed(1)}</Text>
          <Text style={styles.averageOutOf}>/ 5</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginTop: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  count: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  averages: {
    flexDirection: 'row',
    gap: spacing.xxl,
    marginTop: spacing.md,
  },
  average: {
    gap: 2,
  },
  averageLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  averageValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  averageValue: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  averageOutOf: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  averageEmpty: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  thinNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  thinNoteText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
  chipCount: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.textSecondary,
  },
  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
});
