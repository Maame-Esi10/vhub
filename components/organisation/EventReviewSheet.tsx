import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { CONSTRUCTIVE_REMARKS, POSITIVE_REMARKS } from '@/constants/review-remarks';
import type { ReviewRemark } from '@/constants/review-remarks';
import type { EventReview } from '@/types/database';

const NOTES_LIMIT = 2000;

export interface EventReviewDraft {
  attended: boolean;
  reliabilityScore: number | null;
  clinicalScore: number | null;
  /** Slugs from constants/review-remarks.ts. Empty array = no chips. */
  remarkChips: string[];
  notes: string | null;
}

export interface EventReviewSheetProps {
  visible: boolean;
  volunteerName: string;
  outreachTitle: string;
  /** True when the outreach was clinical — the clinical rating is hidden for support-only events. */
  showClinicalScore: boolean;
  /** Existing review being edited, or null when filing a new one. */
  existingReview: EventReview | null;
  /**
   * True when the post-event attendance screen recorded this volunteer as
   * absent. Seeds the attendance answer so the two screens cannot contradict
   * each other. Undefined means nobody has decided, which reads as attended.
   */
  markedAbsent?: boolean;
  isPending: boolean;
  errorMessage?: string;
  onSubmit: (draft: EventReviewDraft) => void;
  onDismiss: () => void;
}

/**
 * The organisation's post-event review of one volunteer.
 *
 * Attendance is the gate: a volunteer who didn't show up cannot be given
 * reliability or clinical stars, because `computeEventOutcome` scores a
 * no-show as 0 regardless and offering the sliders would imply otherwise.
 * The V-Score consequence is stated on the form rather than after submission,
 * so the organisation knows a review is not a private note — it moves a real
 * number on someone's profile.
 */
export function EventReviewSheet({
  visible,
  volunteerName,
  outreachTitle,
  showClinicalScore,
  existingReview,
  markedAbsent,
  isPending,
  errorMessage,
  onSubmit,
  onDismiss,
}: EventReviewSheetProps) {
  const [attended, setAttended] = useState(true);
  const [reliability, setReliability] = useState<number | null>(null);
  const [clinical, setClinical] = useState<number | null>(null);
  const [remarkChips, setRemarkChips] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  // Re-seed whenever the sheet opens for a different volunteer, so editing an
  // existing review starts from what was actually filed rather than blank.
  //
  // `attended` falls back to what the ATTENDANCE screen recorded before
  // defaulting to true, so an organiser who already flagged a no-show is not
  // asked the same question again and cannot accidentally answer it
  // differently — the two screens would then disagree about the same event.
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the sheet each time it opens, which is the point: a stale answer from the last volunteer would be filed against this one
    setAttended(existingReview?.attended ?? markedAbsent !== true);
    setReliability(existingReview?.reliability_score ?? null);
    setClinical(existingReview?.clinical_score ?? null);
    setRemarkChips(existingReview?.remark_chips ?? []);
    setNotes(existingReview?.notes ?? '');
  }, [visible, existingReview, markedAbsent]);

  function toggleChip(slug: string) {
    setRemarkChips((current) =>
      current.includes(slug) ? current.filter((entry) => entry !== slug) : [...current, slug]
    );
  }

  /**
   * A review of someone who attended MUST carry its ratings.
   *
   * This used to be optional, and the cost was invisible: an unrated review
   * blended a substituted 3/5 (= 60) into the V-Score, so filing one on a
   * volunteer who had done nothing wrong moved them 70 -> 67. The math no
   * longer fabricates a rating (lib/vscore.ts), which means an unrated review
   * now moves nothing at all — and a review that changes nothing is not worth
   * an organiser's time to file. Requiring the stars is what makes the review
   * mean something in both directions.
   *
   * Clinical is required only when it is SHOWN. It is hidden entirely for
   * support-role events, where a volunteer is never clinically scored, and
   * demanding it there would be asking for a judgement nobody is in a position
   * to make.
   */
  const missingRatings = attended && (reliability === null || (showClinicalScore && clinical === null));

  function handleSubmit() {
    if (missingRatings) return;
    onSubmit({
      attended,
      reliabilityScore: attended ? reliability : null,
      clinicalScore: attended && showClinicalScore ? clinical : null,
      // A no-show gets no chips: every remark in the vocabulary describes how
      // someone worked, and none of them can be true of a person who was not
      // there.
      remarkChips: attended ? remarkChips : [],
      notes: notes.trim() ? notes.trim() : null,
    });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {existingReview ? 'Edit review' : 'Review volunteer'}
            </Text>
            <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
              <MaterialCommunityIcons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.volunteerName} numberOfLines={1}>
              {volunteerName}
            </Text>
            <Text style={styles.eventTitle} numberOfLines={2}>
              {outreachTitle}
            </Text>

            <Text style={styles.fieldLabel}>Did they attend?</Text>
            <View style={styles.attendanceRow}>
              <AttendanceOption
                label="Attended"
                icon="check-circle-outline"
                selected={attended}
                tone={colors.success}
                onPress={() => setAttended(true)}
              />
              <AttendanceOption
                label="No-show"
                icon="close-circle-outline"
                selected={!attended}
                tone={colors.danger}
                onPress={() => setAttended(false)}
              />
            </View>

            {attended ? (
              <>
                <StarRow
                  label="Reliability"
                  hint="Punctuality, communication, and following through on what they committed to."
                  value={reliability}
                  onChange={setReliability}
                />
                {showClinicalScore ? (
                  <StarRow
                    label="Clinical performance"
                    hint="Quality and safety of the clinical work they did on the day."
                    value={clinical}
                    onChange={setClinical}
                  />
                ) : null}

                {/*
                  Tappable remarks rather than a text box, for the same reason
                  attendance is exception-based: a review step that feels like
                  homework does not get done, and a review that does not get
                  done means the accountability system quietly does nothing.
                  Two taps produce feedback specific enough for the volunteer
                  to act on.

                  Constructive remarks sit in their own group rather than mixed
                  into one list. Mixed, an organiser scanning quickly taps the
                  positives and never reads far enough to reach the honest ones
                  — and a review system that only records praise measures
                  nothing.
                */}
                <Text style={styles.fieldLabel}>What stood out? (optional)</Text>
                <Text style={styles.fieldHint}>
                  The volunteer sees these. Other organisations see only how often each one has been
                  given, never who gave it.
                </Text>
                <ChipGroup
                  remarks={POSITIVE_REMARKS}
                  selected={remarkChips}
                  onToggle={toggleChip}
                  tone={colors.success}
                />

                <Text style={styles.chipGroupLabel}>Room to improve</Text>
                <ChipGroup
                  remarks={CONSTRUCTIVE_REMARKS}
                  selected={remarkChips}
                  onToggle={toggleChip}
                  tone={colors.warning}
                />
              </>
            ) : (
              <View style={styles.noShowNote}>
                <MaterialCommunityIcons name="alert-outline" size={16} color={colors.danger} />
                <Text style={styles.noShowNoteText}>
                  A no-show scores zero for this event and will pull their V-Score down noticeably.
                  Only record one if they genuinely never arrived.
                </Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything the volunteer or a future organiser should know."
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={NOTES_LIMIT}
              accessibilityLabel="Review notes"
            />
            <Text style={styles.counter}>
              {notes.length} / {NOTES_LIMIT}
            </Text>

            <View style={styles.impactNote}>
              <MaterialCommunityIcons name="information-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.impactNoteText}>
                Submitting blends this event into the volunteer&apos;s V-Score. The new score keeps 70%
                of their history and 30% of how today went.
              </Text>
            </View>

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            {missingRatings ? (
              <Text style={styles.requiredHint}>
                {reliability === null && showClinicalScore && clinical === null
                  ? 'Give both ratings to submit. They are what move the volunteer’s V-Score.'
                  : reliability === null
                    ? 'Give a reliability rating to submit.'
                    : 'Give a clinical rating to submit.'}
              </Text>
            ) : null}
            <Button
              title={isPending ? 'Submitting...' : existingReview ? 'Update review' : 'Submit review'}
              onPress={handleSubmit}
              disabled={isPending || missingRatings}
              accessibilityLabel="Submit review"
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

interface AttendanceOptionProps {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  selected: boolean;
  tone: string;
  onPress: () => void;
}

function AttendanceOption({ label, icon, selected, tone, onPress }: AttendanceOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.attendance, selected && { borderColor: tone, backgroundColor: `${tone}14` }]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={selected ? tone : colors.textSecondary} />
      <Text style={[styles.attendanceLabel, selected && { color: tone }]}>{label}</Text>
    </Pressable>
  );
}

interface ChipGroupProps {
  remarks: readonly ReviewRemark[];
  selected: string[];
  onToggle: (slug: string) => void;
  tone: string;
}

/** A wrapping row of toggleable remark chips. */
function ChipGroup({ remarks, selected, onToggle, tone }: ChipGroupProps) {
  return (
    <View style={styles.chipGroup}>
      {remarks.map((remark) => {
        const isSelected = selected.includes(remark.slug);
        return (
          <Pressable
            key={remark.slug}
            onPress={() => onToggle(remark.slug)}
            accessibilityRole="checkbox"
            accessibilityLabel={remark.label}
            accessibilityState={{ checked: isSelected }}
            hitSlop={4}
            style={[
              styles.chip,
              isSelected && { borderColor: tone, backgroundColor: `${tone}1A` },
            ]}
          >
            {isSelected ? (
              <MaterialCommunityIcons name="check" size={14} color={tone} />
            ) : null}
            <Text style={[styles.chipLabel, isSelected && { color: tone }]}>{remark.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface StarRowProps {
  label: string;
  hint: string;
  value: number | null;
  onChange: (value: number | null) => void;
}

function StarRow({ label, hint, value, onChange }: StarRowProps) {
  return (
    <View style={styles.starBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldHint}>{hint}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = value !== null && star <= value;
          return (
            <Pressable
              key={star}
              // Tapping the current rating clears it — the score is optional,
              // and there is otherwise no way back to "not rated".
              onPress={() => onChange(value === star ? null : star)}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${star} of 5`}
              accessibilityState={{ selected: filled }}
              hitSlop={6}
            >
              <MaterialCommunityIcons
                name={filled ? 'star' : 'star-outline'}
                size={30}
                color={filled ? colors.warning : colors.border}
              />
            </Pressable>
          );
        })}
        {value !== null ? <Text style={styles.starValue}>{value} / 5</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '92%',
  },
  header: {
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
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
  },
  headerTitle: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.base,
  },
  volunteerName: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  eventTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  fieldLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  fieldHint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
  attendanceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  attendance: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attendanceLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textSecondary,
  },
  starBlock: {
    marginTop: spacing.xs,
  },
  stars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  starValue: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  chipGroupLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.base,
  },
  noShowNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: radius.md,
    padding: spacing.base,
    marginTop: spacing.base,
  },
  noShowNoteText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.danger,
  },
  notesInput: {
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginTop: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  counter: {
    alignSelf: 'flex-end',
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  impactNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.base,
    marginTop: spacing.base,
  },
  impactNoteText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  requiredHint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
