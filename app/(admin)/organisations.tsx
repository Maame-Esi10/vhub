import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useVerificationQueue, type VerificationQueueRow } from '@/hooks';

/**
 * Organisations waiting on a verification decision.
 *
 * OLDEST FIRST, and that is the only fair order: newest first means whoever
 * submitted on the busiest day waits indefinitely while later arrivals are
 * answered ahead of them.
 *
 * One card per organisation, tap for the full submission. The card carries
 * only enough to tell two waiting organisations apart — the decision itself
 * needs the documents, and those are on the detail screen.
 */
export default function AdminOrganisations() {
  const router = useRouter();
  const queue = useVerificationQueue();

  if (queue.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header count={null} />
        <View style={styles.stateWrap}>
          <ListSkeleton rows={3} rowHeight={104} />
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
              queue.error instanceof Error
                ? queue.error.message
                : 'Could not load the verification queue.'
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
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={queue.isRefetching} onRefresh={() => queue.refetch()} />
        }
        ListHeaderComponent={<Header count={rows.length} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <QueueCard row={item} onPress={() => router.push(`/(admin)/organisation/${item.id}`)} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="check-decagram-outline"
            title="Nothing waiting"
            message="No organisation has a verification submission open. When one submits, it appears here oldest first."
          />
        }
      />
    </SafeAreaView>
  );
}

function Header({ count }: { count: number | null }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Organisations</Text>
      <Text style={styles.subtitle}>
        {count === null
          ? 'Waiting on a verification decision.'
          : count === 0
            ? 'Nothing is waiting on a decision.'
            : `${count} waiting on a decision, oldest first. Until an organisation is verified it cannot publish an outreach.`}
      </Text>
    </View>
  );
}

/** "3 days ago", in the one place it is needed. Precise enough to spot a backlog. */
function waitingFor(submittedAt: string | null): string {
  if (!submittedAt) return 'Submission date not recorded';
  const days = Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86_400_000);
  if (days <= 0) return 'Submitted today';
  if (days === 1) return 'Waiting 1 day';
  return `Waiting ${days} days`;
}

function QueueCard({ row, onPress }: { row: VerificationQueueRow; onPress: () => void }) {
  // Anything past a week is called out rather than left for the reader to work
  // out from a date. A queue is only fair if the wait is visible.
  const days = row.verification_submitted_at
    ? Math.floor((Date.now() - new Date(row.verification_submitted_at).getTime()) / 86_400_000)
    : 0;
  const overdue = days >= 7;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Review ${row.org_name}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons name="office-building-outline" size={20} color={colors.primary} />
        <Text style={styles.orgName} numberOfLines={1}>
          {row.org_name}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
      </View>

      <Text style={styles.cardMeta} numberOfLines={1}>
        {row.org_type ?? 'Type not given'}
        {row.contact_person ? ` · ${row.contact_person}` : ''}
      </Text>
      {row.official_email ? (
        <Text style={styles.cardMeta} numberOfLines={1}>
          {row.official_email}
        </Text>
      ) : null}

      <Text style={[styles.waiting, overdue && styles.waitingOverdue]}>
        {waitingFor(row.verification_submitted_at)}
      </Text>
    </Pressable>
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
    gap: spacing.xs,
  },
  pressed: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  orgName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  cardMeta: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary },
  waiting: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  waitingOverdue: { color: colors.warning },
});
