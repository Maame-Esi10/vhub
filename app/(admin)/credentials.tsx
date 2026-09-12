import { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { humanError } from '@/lib/errorMessage';
import { Text } from '@/components/ui/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Badge,
  Button,
  DocumentViewer,
  EmptyState,
  ErrorState,
  Input,
  ListSkeleton,
  Toast,
} from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useCredentialQueue, useDecideCredential, type CredentialQueueRow } from '@/hooks';
import { getDocumentUrl, type SignedDocument } from '@/lib/api-client';
import { VOLUNTEER_CATEGORIES } from '@/constants/categories';
import type { VolunteerCategory } from '@/types/database';
import { tabBarClearance } from '@/components/ui/tabBarOptions';

/**
 * Gate 1: the volunteer credential queue.
 *
 * ONE SCREEN, NOT A LIST AND A DETAIL. Unlike an organisation — which submits
 * several registrations, several documents and five contact facts — a volunteer
 * submits exactly one document against one claimed category. Everything needed
 * to judge that fits on a card, so pushing a second screen would add a
 * navigation step to every single decision and show nothing new.
 *
 * WHAT GATE 1 IS: is the document real, legible, unexpired, and does it
 * plausibly match the claimed category? It is explicitly NOT a judgement about
 * clinical competence — that is Gate 2, which belongs to the organisation
 * considering this person for a particular role, and which changes no platform
 * status.
 */
export default function AdminCredentials() {
  const insets = useSafeAreaInsets();
  const queue = useCredentialQueue();
  const decide = useDecideCredential();

  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [viewing, setViewing] = useState<CredentialQueueRow | null>(null);
  const [viewerState, setViewerState] = useState<{
    loading: boolean;
    error: string | null;
    signed: SignedDocument | null;
  }>({ loading: false, error: null, signed: null });

  async function openDocument(row: CredentialQueueRow) {
    setViewing(row);
    setViewerState({ loading: true, error: null, signed: null });
    try {
      const signed = await getDocumentUrl(row.id);
      setViewerState({ loading: false, error: null, signed });
    } catch (error) {
      setViewerState({
        loading: false,
        error: humanError(error, 'This document could not be opened.'),
        signed: null,
      });
    }
  }

  function submitDecision(row: CredentialQueueRow, decision: 'approve' | 'reject') {
    setAttempted(true);
    if (reason.trim().length < 3) return;

    decide.mutate(
      { volunteerId: row.id, decision, reason: reason.trim() },
      {
        onSuccess: () => {
          setOpenId(null);
          setReason('');
          setAttempted(false);
          setToast(
            decision === 'approve'
              ? `${row.full_name} is verified.`
              : `${row.full_name} was told why it was not approved.`
          );
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
            message={
              humanError(queue.error, 'Could not load the credential queue.')
            }
            onRetry={() => queue.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const rows = queue.data ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarClearance(insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={queue.isRefetching} onRefresh={() => queue.refetch()} />
        }
        ListHeaderComponent={<Header count={rows.length} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState
            icon="card-account-details-outline"
            title="Nothing waiting"
            message="No volunteer has a credential document waiting for review. When one uploads, they appear here oldest first."
          />
        }
        renderItem={({ item }) => {
          const open = openId === item.id;
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="account-outline" size={20} color={colors.primary} />
                <Text style={styles.name} numberOfLines={1}>
                  {item.full_name}
                </Text>
                <Badge label={item.category ? categoryLabel(item.category) : 'No category'} />
              </View>

              <Text style={styles.meta}>
                {[item.district, item.region].filter(Boolean).join(', ') || 'Location not given'}
                {item.experience_level ? ` · ${item.experience_level}` : ''}
              </Text>
              <Text style={styles.waiting}>{waitingFor(item.verification_submitted_at)}</Text>

              {item.has_document ? (
                <Pressable
                  onPress={() => void openDocument(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.full_name}'s document`}
                  style={({ pressed }) => [styles.documentRow, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons name="file-lock-outline" size={20} color={colors.primary} />
                  <Text style={styles.documentText}>Open the document</Text>
                  <MaterialCommunityIcons
                    name="magnify-plus-outline"
                    size={18}
                    color={colors.textSecondary}
                  />
                </Pressable>
              ) : (
                <Text style={styles.noDocument}>
                  No document is attached, so there is nothing to judge. Reject with a reason asking
                  them to upload one.
                </Text>
              )}

              {open ? (
                <View style={styles.decisionBlock}>
                  <Text style={styles.decisionHint}>
                    Check it is real, legible, unexpired and plausibly matches{' '}
                    {item.category ? categoryLabel(item.category) : 'the category they claim'}. This is
                    not a judgement about how good a clinician they are.
                  </Text>
                  <Input
                    label="Reason"
                    required
                    value={reason}
                    onChangeText={setReason}
                    placeholder="What you saw, and what it means"
                    multiline
                    error={
                      attempted && reason.trim().length < 3 ? 'Write a reason before deciding.' : undefined
                    }
                  />
                  {decide.error ? <Text style={styles.errorText}>{humanError(decide.error)}</Text> : null}
                  <View style={styles.actions}>
                    <Button
                      title={decide.isPending ? 'Saving…' : 'Approve'}
                      onPress={() => submitDecision(item, 'approve')}
                      disabled={decide.isPending}
                      style={styles.actionButton}
                    />
                    <Button
                      title="Reject"
                      variant="outline"
                      onPress={() => submitDecision(item, 'reject')}
                      disabled={decide.isPending}
                      style={styles.actionButton}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  title="Decide"
                  variant="outline"
                  onPress={() => {
                    setOpenId(item.id);
                    setReason('');
                    setAttempted(false);
                  }}
                  style={styles.decideButton}
                />
              )}
            </View>
          );
        }}
      />

      <DocumentViewer
        visible={!!viewing}
        onClose={() => {
          setViewing(null);
          setViewerState({ loading: false, error: null, signed: null });
        }}
        title={viewing ? `${viewing.full_name}'s document` : 'Document'}
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

/** The display label for a category, from the single source of truth. */
function categoryLabel(category: VolunteerCategory): string {
  return VOLUNTEER_CATEGORIES.find((entry) => entry.value === category)?.label ?? category;
}

function Header({ count }: { count: number | null }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Credentials</Text>
      <Text style={styles.subtitle}>
        {count === null
          ? 'Volunteers waiting on a Gate 1 check.'
          : count === 0
            ? 'Nothing is waiting on a decision.'
            : `${count} waiting, oldest first. Approving here unlocks full applications to clinical outreaches.`}
      </Text>
    </View>
  );
}

function waitingFor(submittedAt: string | null): string {
  if (!submittedAt) return 'Submission date not recorded';
  const days = Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86_400_000);
  if (days <= 0) return 'Submitted today';
  if (days === 1) return 'Waiting 1 day';
  return `Waiting ${days} days`;
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
  waiting: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.textSecondary },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    marginTop: spacing.sm,
  },
  documentText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 14, color: colors.textPrimary },
  noDocument: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.warning,
    marginTop: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  decideButton: { marginTop: spacing.base },
  decisionBlock: { gap: spacing.md, marginTop: spacing.base },
  decisionHint: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  actions: { flexDirection: 'row', gap: spacing.md },
  actionButton: { flex: 1 },
  errorText: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.danger },
});
