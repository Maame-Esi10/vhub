import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { EventReview } from '@/types/database';

const NOTES_LIMIT = 2000;

export interface EventReviewDraft {
  attended: boolean;
  reliabilityScore: number | null;
  clinicalScore: number | null;
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
  isPending,
  errorMessage,
  onSubmit,
  onDismiss,
}: EventReviewSheetProps) {
  const [attended, setAttended] = useState(true);
  const [reliability, setReliability] = useState<number | null>(null);
  const [clinical, setClinical] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  // Re-seed whenever the sheet opens for a different volunteer, so editing an
  // existing review starts from what was actually filed rather than blank.
  useEffect(() => {
    if (!visible) return;
    setAttended(existingReview?.attended ?? true);
    setReliability(existingReview?.reliability_score ?? null);
    setClinical(existingReview?.clinical_score ?? null);
    setNotes(existingReview?.notes ?? '');
  }, [visible, existingReview]);

  function handleSubmit() {
    onSubmit({
      attended,
      reliabilityScore: attended ? reliability : null,
      clinicalScore: attended && showClinicalScore ? clinical : null,
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
                Submitting blends this event into the volunteer&apos;s V-Score — the new score keeps 70%
                of their history and 30% of how today went.
              </Text>
            </View>

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <Button
              title={isPending ? 'Submitting...' : existingReview ? 'Update review' : 'Submit review'}
              onPress={handleSubmit}
              disabled={isPending}
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
    justifyContent: 'space-between',
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
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
