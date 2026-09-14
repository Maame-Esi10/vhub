import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, isLateCancellationWindow } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

/** Reason options from design-refs/Withdraw Application Screen.png. */
const REASONS = [
  'Personal Emergency',
  'Health Issue',
  'Transport Issues',
  'Work Conflict',
  'Other',
] as const;

export interface WithdrawSheetProps {
  visible: boolean;
  outreachTitle: string;
  /** Event date/start time — drives the late-withdrawal warning. */
  eventDate: string;
  eventStartTime: string | null;
  isPending: boolean;
  errorMessage?: string;
  onConfirm: (reason: string | null) => void;
  onDismiss: () => void;
}

/**
 * The "Withdrawal Process" flow from Figma: V-Score impact warning, reason
 * selection, then confirm/keep.
 *
 * The Figma banner says 48 hours; the V-Score spec in CLAUDE.md defines a
 * late cancellation as within 24 hours of the event, which is what the DB
 * trigger actually enforces. The threshold shown here follows the spec so the
 * warning matches the penalty the volunteer will really take.
 */
export function WithdrawSheet({
  visible,
  outreachTitle,
  eventDate,
  eventStartTime,
  isPending,
  errorMessage,
  onConfirm,
  onDismiss,
}: WithdrawSheetProps) {
  const [reason, setReason] = useState<string | null>(null);
  const isLate = isLateCancellationWindow(eventDate, eventStartTime);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.header}>
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={12}
            >
              <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Withdrawal Process</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={[styles.banner, isLate ? styles.bannerLate : styles.bannerOnTime]}>
            <MaterialCommunityIcons
              name={isLate ? 'alert-circle' : 'information-outline'}
              size={20}
              color={isLate ? colors.danger : colors.textSecondary}
            />
            <View style={styles.bannerText}>
              <Text style={[styles.bannerTitle, isLate && styles.bannerTitleLate]}>
                {isLate ? 'V-Score Impact Warning' : 'This affects your V-Score'}
              </Text>
              <Text style={[styles.bannerBody, isLate && styles.bannerBodyLate]}>
                {isLate
                  ? 'This event starts within 24 hours, so withdrawing now counts as a late cancellation and carries the larger reliability penalty.'
                  : 'Withdrawing more than 24 hours ahead carries the smaller on-time penalty. Withdrawing inside 24 hours costs significantly more.'}
              </Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.eventTitle} numberOfLines={2}>
              {outreachTitle}
            </Text>
            <Text style={styles.stepTitle}>Select a reason</Text>
            <Text style={styles.stepSubtitle}>
              Optional, but it helps the organisation plan cover.
            </Text>

            {REASONS.map((option) => {
              const selected = reason === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setReason(selected ? null : option)}
                  accessibilityRole="button"
                  accessibilityLabel={option}
                  accessibilityState={{ selected }}
                  style={[styles.reason, selected && styles.reasonSelected]}
                >
                  <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>
                    {option}
                  </Text>
                  {selected ? (
                    <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
                  ) : null}
                </Pressable>
              );
            })}

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <Button
              title={isPending ? 'Withdrawing...' : 'Confirm Withdrawal'}
              onPress={() => onConfirm(reason)}
              disabled={isPending}
              style={styles.confirmButton}
              textStyle={styles.confirmLabel}
              accessibilityLabel="Confirm withdrawal"
            />
            <Button
              title="Keep My Application"
              variant="text"
              onPress={onDismiss}
              disabled={isPending}
              accessibilityLabel="Keep my application"
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
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
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 22,
  },
  banner: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    padding: spacing.base,
    borderRadius: radius.md,
  },
  bannerLate: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  bannerOnTime: {
    backgroundColor: colors.surface,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  bannerTitleLate: {
    color: colors.danger,
  },
  bannerBody: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bannerBodyLate: {
    color: colors.danger,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.base,
  },
  eventTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  stepTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  stepSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.base,
  },
  reason: {
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
    minHeight: 52,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  reasonSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255, 107, 107, 0.06)',
  },
  reasonText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textPrimary,
  },
  reasonTextSelected: {
    color: colors.primary,
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
    gap: spacing.xs,
  },
  confirmButton: {
    backgroundColor: colors.primary,
  },
  confirmLabel: {
    color: colors.white,
  },
});
