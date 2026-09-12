import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { humanError } from '@/lib/errorMessage';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Badge,
  Button,
  DocumentViewer,
  ErrorState,
  Input,
  ListSkeleton,
  ScreenHeader,
  Toast,
} from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useAdminActionsForTarget, useDecideVerification, useVerificationDetail } from '@/hooks';
import { getOrganisationDocumentUrl, type SignedDocument } from '@/lib/api-client';
import type { OrganisationDocument, OrgVerificationState } from '@/types/database';

/**
 * One organisation's verification submission, and the decision on it.
 *
 * Everything submitted is on this screen, because a decision made on a partial
 * view is not a decision. Documents open full-screen; the written reason is
 * required for BOTH outcomes, not only for a rejection — an approval with a
 * reason is what lets a later admin see why this organisation passed when the
 * evidence looked thin.
 *
 * The history strip at the bottom is every previous decision about this
 * organisation, read from the audit trail. It is what stops the same
 * submission being approved and rejected in circles by different people.
 */
export default function AdminOrganisationDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const organisationId = typeof id === 'string' ? id : undefined;

  const detail = useVerificationDetail(organisationId);
  const history = useAdminActionsForTarget('organisation', organisationId);
  const decide = useDecideVerification();

  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // The viewer holds ONE document at a time and fetches its link on open. A
  // signed URL is never fetched ahead of time for a list: the links expire, and
  // minting eight of them to show a list of file names would waste every one.
  const [viewing, setViewing] = useState<OrganisationDocument | null>(null);
  const [viewerState, setViewerState] = useState<{
    loading: boolean;
    error: string | null;
    signed: SignedDocument | null;
  }>({ loading: false, error: null, signed: null });

  async function openDocument(document: OrganisationDocument) {
    setViewing(document);
    setViewerState({ loading: true, error: null, signed: null });
    try {
      const signed = await getOrganisationDocumentUrl(document.id);
      setViewerState({ loading: false, error: null, signed });
    } catch (error) {
      setViewerState({
        loading: false,
        error: humanError(error, 'This document could not be opened.'),
        signed: null,
      });
    }
  }

  function submitDecision(decision: 'approve' | 'reject') {
    setAttempted(true);
    if (reason.trim().length < 3 || !organisationId) return;

    decide.mutate(
      { organisationId, decision, reason: reason.trim() },
      {
        onSuccess: () => {
          setToast(
            decision === 'approve'
              ? 'Approved. The organisation can publish outreaches now.'
              : 'Rejected. The organisation has been told why.'
          );
          // Straight back to the queue: this organisation is no longer in it,
          // and staying on a decided record invites a second decision on it.
          setTimeout(() => router.back(), 900);
        },
      }
    );
  }

  if (detail.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Organisation" fallback="/(admin)/organisations" />
        <View style={styles.stateWrap}>
          <ListSkeleton rows={3} rowHeight={96} />
        </View>
      </SafeAreaView>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Organisation" fallback="/(admin)/organisations" />
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              humanError(detail.error, 'This organisation could not be loaded.')
            }
            onRetry={() => detail.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const { profile, registrations, documents } = detail.data;
  const decidable = profile.verification_state === 'documents_submitted';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Organisation" fallback="/(admin)/organisations" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <Text style={styles.orgName}>{profile.org_name}</Text>
          <View style={styles.badgeRow}>
            <Badge
              label={STATE_LABELS[profile.verification_state]}
              tone={profile.verification_state === 'verified' ? 'success' : 'neutral'}
            />
            {profile.org_type ? <Badge label={profile.org_type} /> : null}
          </View>
        </View>

        <Section title="Contact">
          <Fact label="Contact person" value={profile.contact_person} />
          <Fact label="Official email" value={profile.official_email} />
          <Fact label="Physical address" value={profile.physical_address} />
          <Fact label="Website" value={profile.website} />
          <Fact label="Public enquiries" value={profile.contact_email} />
        </Section>

        <Section title="Registration">
          {registrations.length === 0 ? (
            <Text style={styles.emptyLine}>No registration numbers were submitted.</Text>
          ) : (
            registrations.map((row) => <Fact key={row.id} label={row.label} value={row.number} />)
          )}
        </Section>

        <Section title={`Documents (${documents.length})`}>
          {documents.length === 0 ? (
            <Text style={styles.emptyLine}>No documents were submitted.</Text>
          ) : (
            documents.map((document) => (
              <Pressable
                key={document.id}
                onPress={() => void openDocument(document)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${document.label ?? 'document'}`}
                style={({ pressed }) => [styles.documentRow, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="file-lock-outline" size={20} color={colors.primary} />
                <Text style={styles.documentName} numberOfLines={1}>
                  {document.label ?? 'Document'}
                </Text>
                <MaterialCommunityIcons name="magnify-plus-outline" size={18} color={colors.textSecondary} />
              </Pressable>
            ))
          )}
        </Section>

        {decidable ? (
          <View style={styles.decisionBlock}>
            <Text style={styles.sectionTitle}>Your decision</Text>
            <Text style={styles.decisionHint}>
              The reason is required either way. If you reject, this exact text is sent to the
              organisation so it knows what to fix — write it to be read by them, not by us.
            </Text>
            <Input
              label="Reason"
              required
              value={reason}
              onChangeText={setReason}
              placeholder="What you saw, and what it means"
              multiline
              error={
                attempted && reason.trim().length < 3
                  ? 'Write a reason before deciding.'
                  : undefined
              }
            />

            {decide.error ? <Text style={styles.errorText}>{humanError(decide.error)}</Text> : null}

            <View style={styles.actions}>
              <Button
                title={decide.isPending ? 'Saving…' : 'Approve'}
                onPress={() => submitDecision('approve')}
                disabled={decide.isPending}
                style={styles.actionButton}
              />
              <Button
                title="Reject"
                variant="outline"
                onPress={() => submitDecision('reject')}
                disabled={decide.isPending}
                style={styles.actionButton}
              />
            </View>
          </View>
        ) : (
          <View style={styles.decidedCard}>
            <Text style={styles.decidedHeading}>
              {profile.verification_state === 'verified'
                ? 'Already verified'
                : `Currently ${STATE_LABELS[profile.verification_state].toLowerCase()}`}
            </Text>
            <Text style={styles.decidedBody}>
              {profile.verification_reason
                ? `Last reason given: “${profile.verification_reason}”`
                : 'There is no submission open for this organisation, so there is nothing to decide.'}
            </Text>
          </View>
        )}

        <Section title="History">
          {(history.data ?? []).length === 0 ? (
            <Text style={styles.emptyLine}>No admin decision has been recorded for this organisation.</Text>
          ) : (
            (history.data ?? []).map((entry) => (
              <View key={entry.id} style={styles.historyRow}>
                <Text style={styles.historyAction}>{entry.action}</Text>
                {entry.reason ? <Text style={styles.historyReason}>“{entry.reason}”</Text> : null}
                <Text style={styles.historyMeta}>
                  {entry.actor_email ?? 'Account since removed'} ·{' '}
                  {new Date(entry.created_at).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            ))
          )}
        </Section>
      </ScrollView>

      <DocumentViewer
        visible={!!viewing}
        onClose={() => {
          setViewing(null);
          // The signed link is dropped with the viewer. Keeping one past the
          // moment it is needed is the mistake this whole design avoids.
          setViewerState({ loading: false, error: null, signed: null });
        }}
        title={viewing?.label ?? 'Document'}
        url={viewerState.signed?.url ?? null}
        isImage={viewerState.signed?.isImage ?? false}
        loading={viewerState.loading}
        error={viewerState.error}
        onRetry={() => viewing && void openDocument(viewing)}
      />

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}

const STATE_LABELS: Record<OrgVerificationState, string> = {
  unverified: 'Not verified',
  documents_submitted: 'Waiting on review',
  verified: 'Verified',
  rejected: 'Rejected',
  suspended: 'Suspended',
  banned: 'Removed',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value?.trim() ? value : 'Not given'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  stateWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  identity: { gap: spacing.sm, paddingTop: spacing.base },
  orgName: { fontFamily: fontFamily.semiBold, fontSize: 22, color: colors.textPrimary },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  section: { gap: spacing.md },
  sectionTitle: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  sectionBody: { gap: spacing.md },
  factRow: { gap: 2 },
  factLabel: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textSecondary },
  factValue: { fontFamily: fontFamily.regular, fontSize: 15, color: colors.textPrimary },
  emptyLine: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textSecondary },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  documentName: { flex: 1, fontFamily: fontFamily.medium, fontSize: 14, color: colors.textPrimary },
  pressed: { opacity: 0.7 },
  decisionBlock: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  decisionHint: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  actionButton: { flex: 1 },
  errorText: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.danger },
  decidedCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    gap: spacing.xs,
  },
  decidedHeading: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
  decidedBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  historyRow: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyAction: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textPrimary },
  historyReason: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textPrimary },
  historyMeta: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.textSecondary },
});
