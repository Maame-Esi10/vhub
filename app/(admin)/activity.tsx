import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { humanError } from '@/lib/errorMessage';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Badge, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useAdminActions } from '@/hooks';
import type { AdminAction, AdminActionTargetType } from '@/types/database';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

/**
 * The audit trail, newest first.
 *
 * It is deliberately built and shipped BEFORE the features it records. An
 * admin decision made without the row that records it is a decision with no
 * evidence behind it, and history cannot be added afterwards — so the log
 * exists from the first admin write onwards rather than being caught up later.
 *
 * It will be empty until package C lands, and it says so in those words. An
 * empty log here is the correct and expected state, not a failure.
 */
export default function AdminActivity() {
  // The floating tab bar is absolute and reserves no space, so the last
  // element needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  const actionsQuery = useAdminActions();
  const actions = actionsQuery.data ?? [];

  if (actionsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={[styles.title, styles.standalone]}>Activity</Text>
        <View style={styles.stateWrap}>
          <ListSkeleton rows={4} rowHeight={92} />
        </View>
      </SafeAreaView>
    );
  }

  if (actionsQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={[styles.title, styles.standalone]}>Activity</Text>
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              humanError(actionsQuery.error, 'Could not load the admin activity log.')
            }
            onRetry={() => actionsQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={actions}
        keyExtractor={(action) => action.id}
        contentContainerStyle={[styles.content, tabBarPadding]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={actionsQuery.isRefetching} onRefresh={() => actionsQuery.refetch()} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Activity</Text>
            <Text style={styles.subtitle}>
              Every admin decision, in the order it happened. Entries cannot be edited or removed — a
              correction is recorded as a new entry.
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <ActionRow action={item} />}
        ListEmptyComponent={
          <EmptyState
            icon="clipboard-text-clock-outline"
            title="Nothing recorded yet"
            message="No admin decision has been made on this platform. Entries will appear here from the first one onwards — approving an organisation, reviewing a credential, suspending an account or settling a dispute."
          />
        }
      />
    </SafeAreaView>
  );
}

/** Plain-language names for the things an admin acts on. */
const TARGET_LABELS: Record<AdminActionTargetType, string> = {
  volunteer: 'Volunteer',
  organisation: 'Organisation',
  outreach: 'Outreach',
  application: 'Application',
  event_review: 'Review',
  dispute: 'Dispute',
  document: 'Document',
  vetted_source: 'Source',
  policy: 'Policy',
};

const TARGET_ICONS: Record<AdminActionTargetType, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  volunteer: 'account-outline',
  organisation: 'office-building-outline',
  outreach: 'calendar-outline',
  application: 'file-document-outline',
  event_review: 'star-outline',
  dispute: 'scale-balance',
  document: 'file-lock-outline',
  vetted_source: 'link-variant',
  policy: 'text-box-outline',
};

function formatStamp(iso: string): string {
  const when = new Date(iso);
  return `${when.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })} · ${when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function ActionRow({ action }: { action: AdminAction }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <MaterialCommunityIcons
          name={TARGET_ICONS[action.target_type]}
          size={18}
          color={colors.textSecondary}
        />
        <Text style={styles.action} numberOfLines={2}>
          {action.action}
        </Text>
        <Badge label={TARGET_LABELS[action.target_type]} />
      </View>

      {action.reason ? <Text style={styles.reason}>“{action.reason}”</Text> : null}

      <Text style={styles.meta}>
        {/*
          actor_email is the snapshot taken when the row was written, not a
          join. It is what still names the person after their account is gone
          — the audit row survives the account deliberately.
        */}
        {action.actor_email ?? 'Account since removed'} · {formatStamp(action.created_at)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.xxl },
  stateWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  header: { gap: spacing.sm, paddingBottom: spacing.lg },
  title: { fontFamily: fontFamily.semiBold, fontSize: 24, color: colors.textPrimary },
  // The loading and error branches render outside the list, so they carry the
  // screen's horizontal padding themselves.
  standalone: { paddingHorizontal: spacing.lg, paddingTop: spacing.base },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  separator: { height: spacing.md },
  row: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  action: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
  reason: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21, color: colors.textPrimary },
  meta: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.textSecondary },
});
