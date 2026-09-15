import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Badge, Button, ConfirmDialog, Input, ListSkeleton, Toast } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  useAccountSearch,
  useModeratedAccounts,
  useModerateAccount,
  type ModerationSearchRow,
} from '@/hooks';
import { humanError } from '@/lib/errorMessage';
import { tabBarClearance } from '@/components/ui/tabBarOptions';

/**
 * Moderation: suspend, ban, reinstate.
 *
 * SUSPENSION STOPS FUTURE ACTIVITY AND NEVER REWRITES THE PAST. Attendance
 * that happened happened, reviews stay written, V-Scores keep meaning what they
 * meant. What stops is what has not happened yet — and the screen says so, in
 * those words, above the buttons, because an admin about to suspend somebody
 * needs to know exactly how far it reaches.
 *
 * SEARCH, NOT A DIRECTORY. Moderation starts with a complaint about a specific
 * person. A browsable roll of every account invites looking through people for
 * its own sake, and would be the one screen where an admin's reach over
 * ordinary users is casual rather than deliberate. Nothing appears until two
 * characters are typed.
 *
 * The one list that IS shown unprompted is everyone currently suspended, so a
 * moderation can be found and undone without remembering a name.
 */
export default function AdminPeople() {
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState('');
  const search = useAccountSearch(term);
  const moderated = useModeratedAccounts();
  const moderate = useModerateAccount();

  const [pending, setPending] = useState<{
    row: ModerationSearchRow;
    action: 'suspend' | 'ban' | 'reinstate';
  } | null>(null);
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function confirm() {
    setAttempted(true);
    if (!pending || reason.trim().length < 3) return;

    moderate.mutate(
      { targetUserId: pending.row.id, action: pending.action, reason: reason.trim() },
      {
        onSuccess: (result) => {
          const consequences: string[] = [];
          if (result.outreachesCancelled) {
            consequences.push(
              `${result.outreachesCancelled} outreach${result.outreachesCancelled === 1 ? '' : 'es'} cancelled`
            );
          }
          if (result.volunteersNotified) consequences.push(`${result.volunteersNotified} volunteers told`);
          if (result.applicationsWithdrawn) {
            consequences.push(`${result.applicationsWithdrawn} applications withdrawn`);
          }
          if (result.placesBackfilled) {
            consequences.push(`${result.placesBackfilled} place${result.placesBackfilled === 1 ? '' : 's'} refilled from the waitlist`);
          }

          // The consequences are REPORTED, not assumed. An admin who suspends
          // an organisation has just cancelled other people's Saturdays, and
          // being told how many is the difference between a decision and a
          // click.
          setToast(
            consequences.length > 0
              ? `Done. ${consequences.join(', ')}.`
              : 'Done. Nothing was scheduled, so nothing was cancelled.'
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
      <ScrollView contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarClearance(insets.bottom) },
        ]} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>People</Text>
        <Text style={styles.subtitle}>
          Suspending an account stops what has not happened yet. It never changes the past: attendance
          stays recorded, reviews stay written, and V-Scores keep meaning what they meant.
        </Text>

        <Input
          label="Find an account"
          value={term}
          onChangeText={setTerm}
          placeholder="Name or email"
          autoCapitalize="none"
        />

        {term.trim().length >= 2 ? (
          search.isLoading ? (
            <ListSkeleton rows={2} rowHeight={96} />
          ) : (search.data ?? []).length === 0 ? (
            <Text style={styles.emptyLine}>No account matches that.</Text>
          ) : (
            <View style={styles.list}>
              {(search.data ?? []).map((row) => (
                <AccountCard
                  key={row.id}
                  row={row}
                  onAction={(action) => {
                    setPending({ row, action });
                    setReason('');
                    setAttempted(false);
                  }}
                />
              ))}
            </View>
          )
        ) : (
          <Text style={styles.hint}>Type at least two characters. There is no browsable list of accounts.</Text>
        )}

        <Text style={styles.sectionHeading}>Currently stopped</Text>
        {moderated.isLoading ? (
          <ListSkeleton rows={1} rowHeight={96} />
        ) : (moderated.data ?? []).length === 0 ? (
          <Text style={styles.emptyLine}>Nobody is suspended or banned.</Text>
        ) : (
          <View style={styles.list}>
            {(moderated.data ?? []).map((row) => (
              <AccountCard
                key={row.id}
                row={row}
                onAction={(action) => {
                  setPending({ row, action });
                  setReason('');
                  setAttempted(false);
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!pending}
        icon={pending?.action === 'reinstate' ? 'account-check-outline' : 'account-cancel-outline'}
        tone={pending?.action === 'reinstate' ? 'default' : 'destructive'}
        title={
          pending
            ? pending.action === 'reinstate'
              ? `Reinstate ${pending.row.full_name}?`
              : pending.action === 'ban'
                ? `Ban ${pending.row.full_name}?`
                : `Suspend ${pending.row.full_name}?`
            : ''
        }
        message={pending ? consequenceText(pending.row, pending.action) : ''}
        confirmLabel={
          pending?.action === 'reinstate' ? 'Reinstate' : pending?.action === 'ban' ? 'Ban' : 'Suspend'
        }
        cancelLabel="Cancel"
        busy={moderate.isPending}
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
          placeholder="What happened, in words the account holder will read"
          multiline
          error={attempted && reason.trim().length < 3 ? 'Write a reason first.' : undefined}
        />
        {moderate.error ? <Text style={styles.errorText}>{humanError(moderate.error)}</Text> : null}
      </ConfirmDialog>

      <Toast message={toast} onDismiss={() => setToast(null)} durationMs={5000} />
    </SafeAreaView>
  );
}

/** Exactly what this action will do, spelled out before it is taken. */
function consequenceText(row: ModerationSearchRow, action: 'suspend' | 'ban' | 'reinstate'): string {
  if (action === 'reinstate') {
    return 'They can post and apply again from now on. Anything cancelled or withdrawn while they were stopped stays that way. The people affected were already told.';
  }

  const permanence =
    action === 'ban' ? 'This is permanent.' : 'This can be undone, and they can be reinstated later.';

  if (row.role === 'organisation') {
    return `Their open and closed outreaches will be cancelled and every affected volunteer told by push and email. They will not be able to post again. Past events, attendance and reviews are untouched. ${permanence} The reason below is sent to them.`;
  }

  return `Their pending, waitlisted and accepted applications will be withdrawn, and each accepted place offered to the waitlist so the organisation is not left short. Past attendance, reviews and their V-Score are untouched. ${permanence} The reason below is sent to them.`;
}

function AccountCard({
  row,
  onAction,
}: {
  row: ModerationSearchRow;
  onAction: (action: 'suspend' | 'ban' | 'reinstate') => void;
}) {
  const stopped = row.moderation_state !== 'active';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons
          name={row.role === 'organisation' ? 'office-building-outline' : 'account-outline'}
          size={20}
          color={colors.primary}
        />
        <Text style={styles.name} numberOfLines={1}>
          {row.full_name}
        </Text>
        <Badge
          label={
            row.moderation_state === 'active'
              ? 'Active'
              : row.moderation_state === 'suspended'
                ? 'Suspended'
                : 'Banned'
          }
          tone={row.moderation_state === 'active' ? 'success' : 'danger'}
        />
      </View>

      <Text style={styles.meta} numberOfLines={1}>
        {row.role === 'organisation' ? 'Organisation' : 'Volunteer'}
        {row.email ? ` · ${row.email}` : ''}
        {row.region ? ` · ${row.region}` : ''}
      </Text>

      {stopped && row.moderation_reason ? (
        <Text style={styles.reason}>“{row.moderation_reason}”</Text>
      ) : null}

      <View style={styles.actions}>
        {stopped ? (
          <Button
            title="Reinstate"
            variant="outline"
            onPress={() => onAction('reinstate')}
            style={styles.actionButton}
          />
        ) : (
          <>
            <Button
              title="Suspend"
              variant="outline"
              onPress={() => onAction('suspend')}
              style={styles.actionButton}
            />
            <Button
              title="Ban"
              variant="outline"
              onPress={() => onAction('ban')}
              style={styles.actionButton}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.xxl },
  title: { fontFamily: fontFamily.semiBold, fontSize: 24, color: colors.textPrimary },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  sectionHeading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  list: { gap: spacing.md, marginTop: spacing.md },
  emptyLine: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
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
  reason: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textPrimary },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  actionButton: { flex: 1 },
  errorText: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.danger },
});
