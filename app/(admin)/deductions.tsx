import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  ListSkeleton,
  ScreenHeader,
  Toast,
  formatEventDate,
} from '@/components/ui';
import { SCORE_EVENT_LABELS, useAllScoreEvents, useVoidScoreEvent } from '@/hooks';
import type { AdminScoreEventRow } from '@/hooks';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

/**
 * Every V-Score deduction the platform has applied, and the one way to undo
 * one.
 *
 * WHY THE SCREEN EXISTS. `score_events` was written by /api/vscore and read by
 * the replay, and displayed nowhere. A deduction could be caused and then
 * neither inspected nor corrected — the one irreversible thing left in a score
 * model whose entire point is that it is derived, and therefore correctable. An
 * upheld dispute could already reach back and void a review; nothing could
 * reach a penalty.
 *
 * A LIST, NOT A SEARCH — the opposite of the People screen, deliberately. That
 * one browses PEOPLE, and a roll of every account invites looking through them
 * for their own sake. This browses DECISIONS the platform has already made
 * about somebody's number: the same kind of thing as the activity log, and an
 * admin has to be able to find a wrong one without already knowing whose it
 * was.
 *
 * NO DESIGN EXISTS for the admin side, so nothing here invents a look: same
 * ScreenHeader, same card, same badge and confirm dialog as the other queues.
 */
export default function AdminDeductions() {
  const query = useAllScoreEvents();
  const voidEvent = useVoidScoreEvent();

  const [pending, setPending] = useState<AdminScoreEventRow | null>(null);
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const active = useMemo(() => rows.filter((row) => row.voided_at === null), [rows]);
  const reversed = useMemo(() => rows.filter((row) => row.voided_at !== null), [rows]);

  function confirm() {
    setAttempted(true);
    if (!pending || reason.trim().length < 3) return;

    voidEvent.mutate(
      { scoreEventId: pending.id, reason: reason.trim() },
      {
        onSuccess: (result) => {
          // The two numbers are reported rather than assumed. Reversing a
          // deduction replays the whole history, and how far the score actually
          // moves depends on what was filed after it — an admin who is told
          // only "done" cannot tell a working reversal from a no-op.
          setToast(
            `Reversed. ${result.pointsReturned} points back — V-Score ${Math.round(result.oldScore)} → ${Math.round(result.newScore)}.`
          );
          setPending(null);
          setReason('');
          setAttempted(false);
        },
      }
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="V-Score deductions" fallback="/(admin)/overview" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Every deduction that was not a review: a cancelled place, or a committed day dropped inside
          24 hours of it. A no-show is not here — that is expressed by the organisation&apos;s review,
          so it can only ever be counted once.
        </Text>
        <Text style={styles.intro}>
          Reversing one does not delete it. The record stays and stops counting, and the
          volunteer&apos;s score is rebuilt from their whole history without it. They are told, and
          your reason is what they read.
        </Text>

        {query.isLoading ? (
          <View style={styles.block}>
            <ListSkeleton rows={3} rowHeight={112} />
          </View>
        ) : query.isError ? (
          <View style={styles.block}>
            <ErrorState
              message={
                query.error instanceof Error ? query.error.message : 'Could not load deductions.'
              }
              onRetry={() => void query.refetch()}
            />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.block}>
            <EmptyState
              icon="scale-balance"
              title="No deductions"
              message="Nobody has lost V-Score points to a cancellation or a late day release. This list fills itself as it happens."
            />
          </View>
        ) : (
          <>
            <Text style={styles.sectionHeading}>Counting now ({active.length})</Text>
            {active.length === 0 ? (
              <Text style={styles.emptyLine}>Every deduction on record has been reversed.</Text>
            ) : (
              <View style={styles.list}>
                {active.map((row) => (
                  <DeductionCard
                    key={row.id}
                    row={row}
                    onReverse={() => {
                      setPending(row);
                      setReason('');
                      setAttempted(false);
                    }}
                  />
                ))}
              </View>
            )}

            {reversed.length > 0 ? (
              <>
                <Text style={styles.sectionHeading}>Reversed ({reversed.length})</Text>
                <Text style={styles.emptyLine}>
                  Kept on the record. A reversal cannot itself be undone — re-applying a deduction
                  would be a new decision, with its own reason.
                </Text>
                <View style={styles.list}>
                  {reversed.map((row) => (
                    <DeductionCard key={row.id} row={row} onReverse={null} />
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!pending}
        icon="undo-variant"
        title={pending ? `Give back ${Math.abs(pending.points)} points?` : ''}
        message={
          pending
            ? `${pending.volunteer?.full_name ?? 'This volunteer'} lost ${Math.abs(pending.points)} points: “${pending.reason}” Reversing it rebuilds their score without this deduction and tells them why. It cannot be undone.`
            : ''
        }
        confirmLabel="Reverse it"
        cancelLabel="Cancel"
        busy={voidEvent.isPending}
        onConfirm={confirm}
        onCancel={() => {
          setPending(null);
          setReason('');
          setAttempted(false);
        }}
      >
        <Input
          label="Reason"
          required
          value={reason}
          onChangeText={setReason}
          placeholder="Why this deduction should not have counted"
          multiline
          error={attempted && reason.trim().length < 3 ? 'Write a reason first.' : undefined}
        />
        {voidEvent.error ? <Text style={styles.errorText}>{voidEvent.error.message}</Text> : null}
      </ConfirmDialog>

      <Toast message={toast} onDismiss={() => setToast(null)} durationMs={6000} />
    </SafeAreaView>
  );
}

function DeductionCard({
  row,
  onReverse,
}: {
  row: AdminScoreEventRow;
  onReverse: (() => void) | null;
}) {
  const voided = row.voided_at !== null;

  return (
    <View style={[styles.card, voided && styles.cardVoided]}>
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons
          name={voided ? 'undo-variant' : 'minus-circle-outline'}
          size={20}
          color={voided ? colors.textSecondary : colors.danger}
        />
        <Text style={styles.points}>{row.points}</Text>
        <Badge
          label={SCORE_EVENT_LABELS[row.kind]}
          tone={voided ? 'neutral' : 'warning'}
        />
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {row.volunteer?.full_name ?? 'A volunteer'}
      </Text>
      <Text style={styles.meta} numberOfLines={2}>
        {row.outreach?.title ?? 'Event no longer listed'} · {formatEventDate(row.created_at)}
      </Text>

      <Text style={styles.reason}>{row.reason}</Text>

      {voided ? (
        <View style={styles.voidedBlock}>
          <Text style={styles.voidedLabel}>
            Reversed {row.voided_at ? formatEventDate(row.voided_at) : ''}
          </Text>
          {row.voided_reason ? <Text style={styles.reason}>{row.voided_reason}</Text> : null}
        </View>
      ) : onReverse ? (
        <Button title="Reverse" variant="outline" onPress={onReverse} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.xxl },
  intro: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  block: { marginTop: spacing.lg },
  sectionHeading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },
  list: { gap: spacing.md, marginTop: spacing.md },
  emptyLine: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardVoided: { opacity: 0.72 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  points: { fontFamily: fontFamily.semiBold, fontSize: 18, color: colors.textPrimary },
  name: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
  meta: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary },
  reason: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  voidedBlock: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  voidedLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  action: { marginTop: spacing.md },
  errorText: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.danger },
});
