import { useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Badge, Button, EmptyState, ErrorState, Input, ListSkeleton, Toast } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  useDisputeEvidence,
  useDisputeQueue,
  useResolveDispute,
  type DisputeQueueRow,
} from '@/hooks';

/**
 * Disputes: a volunteer's challenge to a record about them.
 *
 * BOTH SIDES, OBJECTIVELY. The screen shows the volunteer's statement and,
 * beside it, the record itself — for attendance, whether there was a scan and
 * what the silent location check returned; for a review, the ratings and the
 * volunteer's aggregate history so one bad rating can be seen for what it is.
 * An admin deciding from the statement alone is deciding on eloquence.
 *
 * WHAT UPHOLDING DOES: it records that the volunteer was right and tells both
 * parties. It does NOT recompute a V-Score, and the screen says so plainly
 * rather than leaving an admin to assume otherwise. Recalculating a score from
 * full history is a change to something already built and tested, and it is
 * awaiting its own approval.
 */
export default function AdminDisputes() {
  const queue = useDisputeQueue();
  const resolve = useResolveDispute();

  const [openId, setOpenId] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const rows = queue.data ?? [];
  const openDispute = rows.find((row) => row.id === openId) ?? null;
  const evidence = useDisputeEvidence(openDispute);

  function submit(decision: 'uphold' | 'reject') {
    setAttempted(true);
    if (!openDispute || resolution.trim().length < 3) return;

    resolve.mutate(
      { disputeId: openDispute.id, decision, resolution: resolution.trim() },
      {
        onSuccess: () => {
          setToast(
            decision === 'uphold'
              ? 'Upheld. Both the volunteer and the organisation have been told.'
              : 'Not upheld. Both parties have been told why.'
          );
          setOpenId(null);
          setResolution('');
          setAttempted(false);
        },
      }
    );
  }

  if (queue.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header count={null} />
        <View style={styles.stateWrap}>
          <ListSkeleton rows={3} rowHeight={120} />
        </View>
      </SafeAreaView>
    );
  }

  if (queue.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header count={null} />
        <View style={styles.stateWrap}>
          <ErrorState
            message={queue.error instanceof Error ? queue.error.message : 'Could not load disputes.'}
            onRetry={() => queue.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={queue.isRefetching} onRefresh={() => queue.refetch()} />
        }
        ListHeaderComponent={<Header count={rows.length} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState
            icon="scale-balance"
            title="Nothing disputed"
            message="No volunteer has challenged an attendance record or a review. When one does, it appears here oldest first."
          />
        }
        renderItem={({ item }) => {
          const open = openId === item.id;
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons
                  name={item.type === 'attendance' ? 'calendar-remove-outline' : 'star-outline'}
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.name} numberOfLines={1}>
                  {item.volunteer?.full_name ?? 'Volunteer'}
                </Text>
                <Badge label={item.type === 'attendance' ? 'Attendance' : 'Review'} />
              </View>

              <Text style={styles.meta} numberOfLines={1}>
                {item.outreach?.title ?? 'Outreach'} · {item.outreach?.date ?? ''}
              </Text>

              <View style={styles.statementBlock}>
                <Text style={styles.statementLabel}>What they say</Text>
                <Text style={styles.statementText}>{item.statement}</Text>
              </View>

              {open ? (
                <>
                  <View style={styles.evidenceBlock}>
                    <Text style={styles.statementLabel}>What the record says</Text>
                    {evidence.isLoading ? (
                      <Text style={styles.evidenceLine}>Loading the record…</Text>
                    ) : (
                      <EvidenceBody dispute={item} evidence={evidence.data} />
                    )}
                  </View>

                  <Text style={styles.limitNote}>
                    Upholding records the correction and tells both parties. It does not recalculate the
                    volunteer’s V-Score — that change is separate and is not switched on.
                  </Text>

                  <Input
                    label="Your decision, in words both will read"
                    required
                    value={resolution}
                    onChangeText={setResolution}
                    placeholder="What you found, and what it means"
                    multiline
                    error={
                      attempted && resolution.trim().length < 3
                        ? 'Write your reasoning before deciding.'
                        : undefined
                    }
                  />
                  {resolve.error ? <Text style={styles.errorText}>{resolve.error.message}</Text> : null}

                  <View style={styles.actions}>
                    <Button
                      title={resolve.isPending ? 'Saving…' : 'Uphold'}
                      onPress={() => submit('uphold')}
                      disabled={resolve.isPending}
                      style={styles.actionButton}
                    />
                    <Button
                      title="Not upheld"
                      variant="outline"
                      onPress={() => submit('reject')}
                      disabled={resolve.isPending}
                      style={styles.actionButton}
                    />
                  </View>
                </>
              ) : (
                <Button
                  title="Look at the record"
                  variant="outline"
                  onPress={() => {
                    setOpenId(item.id);
                    setResolution('');
                    setAttempted(false);
                  }}
                  style={styles.openButton}
                />
              )}
            </View>
          );
        }}
      />

      <Toast message={toast} onDismiss={() => setToast(null)} durationMs={5000} />
    </SafeAreaView>
  );
}

function EvidenceBody({
  dispute,
  evidence,
}: {
  dispute: DisputeQueueRow;
  evidence: ReturnType<typeof useDisputeEvidence>['data'];
}) {
  if (!evidence) return <Text style={styles.evidenceLine}>The record could not be loaded.</Text>;

  if (dispute.type === 'attendance') {
    return (
      <View style={styles.evidenceList}>
        {evidence.attendance.length === 0 ? (
          <Text style={styles.evidenceLine}>
            No check-in was ever recorded for this volunteer at this outreach.
          </Text>
        ) : (
          evidence.attendance.map((row) => (
            <Text key={row.id} style={styles.evidenceLine}>
              Scanned{' '}
              {row.checked_in_at
                ? new Date(row.checked_in_at).toLocaleString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'at an unrecorded time'}
              {row.location_check ? ` · location ${row.location_check.replace(/_/g, ' ')}` : ''}
            </Text>
          ))
        )}

        <Text style={styles.evidenceLine}>
          {evidence.review
            ? `The organisation marked them ${evidence.review.attended ? 'present' : 'ABSENT'}.`
            : 'The organisation has not filed a review for this event, so nothing has been marked either way.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.evidenceList}>
      {evidence.review ? (
        <>
          <Text style={styles.evidenceLine}>
            Reliability {evidence.review.reliability_score ?? '—'}/5 · Clinical{' '}
            {evidence.review.clinical_score ?? 'not rated'}
          </Text>
          {evidence.review.notes ? (
            <Text style={styles.evidenceLine}>“{evidence.review.notes}”</Text>
          ) : (
            <Text style={styles.evidenceLine}>The organisation left no written note.</Text>
          )}
        </>
      ) : (
        <Text style={styles.evidenceLine}>The review this refers to no longer exists.</Text>
      )}

      {/*
        The aggregate is here so one bad rating can be seen in proportion. A
        volunteer with thirty events behind them and one poor review is a
        different case from one with two events and two poor reviews, and the
        statement alone cannot show that.
      */}
      {evidence.history ? (
        <Text style={styles.evidenceLine}>
          Across the platform: {evidence.history.eventsAttended} events attended, V-Score{' '}
          {evidence.history.vScore != null ? Math.round(evidence.history.vScore) : '—'}.
        </Text>
      ) : null}
    </View>
  );
}

function Header({ count }: { count: number | null }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Disputes</Text>
      <Text style={styles.subtitle}>
        {count === null
          ? 'Volunteers challenging a record about them.'
          : count === 0
            ? 'Nothing is waiting on a decision.'
            : `${count} waiting, oldest first. Both parties are told the outcome in your own words.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.xxl },
  stateWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  header: { gap: spacing.sm, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg },
  title: { fontFamily: fontFamily.semiBold, fontSize: 24, color: colors.textPrimary },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  separator: { height: spacing.md },
  card: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  meta: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary },
  statementBlock: {
    marginTop: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    gap: spacing.xs,
  },
  statementLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statementText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  evidenceBlock: {
    marginTop: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    gap: spacing.xs,
  },
  evidenceList: { gap: spacing.xs },
  evidenceLine: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  limitNote: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  openButton: { marginTop: spacing.base },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  actionButton: { flex: 1 },
  errorText: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.danger },
});
