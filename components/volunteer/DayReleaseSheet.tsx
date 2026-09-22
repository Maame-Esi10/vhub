import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SheetError, formatEventTimeRange } from '@/components/ui';
import {
  canReleaseDay,
  dayEndTime,
  dayStartTime,
  formatDayShort,
  isLateReleaseWindow,
  lateReleaseWarning,
} from '@/lib/outreachDays';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { OutreachDay } from '@/types/database';

export interface DayReleaseSheetProps {
  visible: boolean;
  days: readonly OutreachDay[];
  /** The outreach's own hours, which a day inherits unless it overrides them. */
  outreach: { start_time: string | null; end_time: string | null };
  /** Ids of the days this volunteer is still committed to. */
  committedDayIds: readonly string[];
  /** How many late cancellations they have already made in the window. */
  recentLateReleases: number;
  busyDayId?: string | null;
  errorMessage?: string | null;
  onRelease: (outreachDayId: string) => void;
  onRecommit: (outreachDayId: string) => void;
  onClose: () => void;
}

/**
 * Dropping days of a multi-day outreach you can no longer make, and taking
 * them back on.
 *
 * WHY THIS EXISTS. Withdrawal was all-or-nothing and closed the moment the
 * event began, so a volunteer on four scattered Saturdays who could not make
 * the third had exactly two options: abandon the whole campaign, or simply not
 * turn up and take a no-show. The app punished them for a thing it gave them
 * no way to avoid. This is the way to avoid it.
 *
 * WHAT A RELEASE IS. It reduces what they promised, rather than recording a
 * failure against what they promised — days attended over days committed stays
 * honest, because the released day leaves the denominator. Days already
 * attended are untouched.
 *
 * WHAT IT IS NOT. A day that has already started cannot be released: that is a
 * no-show, and it belongs to attendance. Nor can the last day still ahead of
 * them, because dropping everything that remains is withdrawing from the
 * outreach and has to go through the withdrawal path, so the organisation is
 * told and the waitlist is offered the place. Both refusals are enforced by the
 * database; this screen states them before the tap rather than after it.
 *
 * THE LATE WARNING IS SHOWN BEFORE THE ACT, NEVER AFTER. Releasing within 24
 * hours of a day counts as a late cancellation, and repeated ones affect a
 * V-Score. A volunteer who only learns that afterwards has learned nothing
 * they could have acted on.
 */
export function DayReleaseSheet({
  visible,
  days,
  outreach,
  committedDayIds,
  recentLateReleases,
  busyDayId,
  errorMessage,
  onRelease,
  onRecommit,
  onClose,
}: DayReleaseSheetProps) {
  // Which day is one tap from being released. The late warning is a step, not a
  // dialog on top of a dialog: it appears inside the row it is about.
  const [confirmingDayId, setConfirmingDayId] = useState<string | null>(null);

  const committed = new Set(committedDayIds);
  const liveFutureCount = days.filter(
    (day) => committed.has(day.id) && canReleaseDay(day.day, dayStartTime(day, outreach))
  ).length;

  function handleReleasePress(day: OutreachDay) {
    if (isLateReleaseWindow(day.day, dayStartTime(day, outreach))) {
      setConfirmingDayId(day.id);
      return;
    }
    onRelease(day.id);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Change my days</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={12}
            >
              <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.intro}>
            Drop a day you can no longer make. The days you keep are the only ones you are measured
            against, so releasing one is not a mark against you.
          </Text>

          {/* At the TOP of the sheet, outside the scroller: see SheetError. */}
          <SheetError error={errorMessage} fallback="Could not change that day." />

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {days.map((day, index) => {
              const start = dayStartTime(day, outreach);
              const timeRange = formatEventTimeRange(start, dayEndTime(day, outreach));
              const isCommitted = committed.has(day.id);
              const releasable = canReleaseDay(day.day, start);
              const late = isLateReleaseWindow(day.day, start);
              const busy = busyDayId === day.id;
              const confirming = confirmingDayId === day.id;
              const isLastLive = isCommitted && releasable && liveFutureCount === 1;

              return (
                <View key={day.id} style={[styles.row, !isCommitted && styles.rowReleased]}>
                  <View style={styles.rowText}>
                    <Text style={styles.dayLabel}>
                      Day {index + 1} · {formatDayShort(day.day)}
                    </Text>
                    <Text style={styles.dayMeta}>
                      {timeRange ?? 'All day'}
                      {!isCommitted ? ' · released' : ''}
                    </Text>
                  </View>

                  {busy ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : !isCommitted ? (
                    releasable ? (
                      <Pressable
                        onPress={() => onRecommit(day.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Take Day ${index + 1} back on`}
                        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                      >
                        <Text style={styles.actionText}>Take it back on</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.lockedNote}>Passed</Text>
                    )
                  ) : !releasable ? (
                    // Stated rather than hidden: a volunteer looking for the
                    // control needs to know why it is not there.
                    <Text style={styles.lockedNote}>Already started</Text>
                  ) : isLastLive ? (
                    <Text style={styles.lockedNote}>Last day</Text>
                  ) : (
                    <Pressable
                      onPress={() => handleReleasePress(day)}
                      accessibilityRole="button"
                      accessibilityLabel={`Release Day ${index + 1}`}
                      style={({ pressed }) => [
                        styles.action,
                        late && styles.actionLate,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.actionText, late && styles.actionTextLate]}>
                        Release
                      </Text>
                    </Pressable>
                  )}

                  {confirming ? (
                    <View style={styles.confirmBlock}>
                      <Text style={styles.warningText}>{lateReleaseWarning(recentLateReleases)}</Text>
                      <View style={styles.confirmActions}>
                        <Pressable
                          onPress={() => setConfirmingDayId(null)}
                          accessibilityRole="button"
                          style={({ pressed }) => [styles.confirmCancel, pressed && styles.pressed]}
                        >
                          <Text style={styles.confirmCancelText}>Keep the day</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setConfirmingDayId(null);
                            onRelease(day.id);
                          }}
                          accessibilityRole="button"
                          style={({ pressed }) => [styles.confirmGo, pressed && styles.pressed]}
                        >
                          <Text style={styles.confirmGoText}>Release anyway</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}

                  {isLastLive ? (
                    <Text style={styles.footnote}>
                      This is the only day you have left. Dropping it is withdrawing from the
                      outreach, which you can do from the button on the event.
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [styles.done, pressed && styles.pressed]}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(18, 23, 43, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '85%',
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
    gap: spacing.md,
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  intro: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  // Real separation between rows: each is a decision about a different day, not
  // a list of options for one.
  list: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',

    // alignItems centres children within their line; alignContent places
    // the line itself, and defaults to flex-start. Without it a wrapping row
    // pins its single line to the TOP of the box.
    alignContent: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  rowReleased: {
    backgroundColor: colors.surface,
    borderStyle: 'dashed',
  },
  rowText: {
    flex: 1,
    minWidth: 140,
  },
  dayLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  dayMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  action: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  actionLate: {
    borderColor: colors.warning,
  },
  actionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  actionTextLate: {
    color: colors.warning,
  },
  lockedNote: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  confirmBlock: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  warningText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.warning,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  confirmCancel: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmCancelText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  confirmGo: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.warning,
  },
  confirmGoText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.white,
  },
  footnote: {
    width: '100%',
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  done: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    marginTop: spacing.lg,
  },
  doneText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.white,
  },
  pressed: {
    opacity: 0.8,
  },
});
