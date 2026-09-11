import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { EmptyState, ErrorState, ListSkeleton, ScreenHeader } from '@/components/ui';
import { NotificationRow } from '@/components/volunteer';
import {
  filterNotifications,
  toNotificationRows,
  unreadCount,
  useMarkNotificationsRead,
  useNotifications,
  type AppNotification,
  type NotificationFilter,
} from '@/hooks/useNotifications';
import { colors, fontFamily, spacing } from '@/constants/theme';

const TABS: { value: NotificationFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'matches', label: 'Matches' },
  { value: 'updates', label: 'Updates' },
];


export default function Notifications() {
  const router = useRouter();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const notificationsQuery = useNotifications();
  const markRead = useMarkNotificationsRead();

  const notifications = useMemo(() => notificationsQuery.data ?? [], [notificationsQuery.data]);
  const rows = useMemo(
    () => toNotificationRows(filterNotifications(notifications, filter)),
    [notifications, filter]
  );
  const unread = unreadCount(notifications);

  /**
   * Tapping marks read and routes on the payload the server attached. The
   * `type` values are the contract in lib/push.ts, kept in step with the four
   * dispatch sites in api/.
   */
  function handlePress(notification: AppNotification) {
    if (!notification.read_at) {
      markRead.mutate(notification.id);
    }

    // outreach_id is a real column, so it stays correct even for a payload
    // shape that predates a later change to `data`.
    if (notification.outreach_id) {
      router.push(`/(volunteer)/outreach/${notification.outreach_id}?from=/(volunteer)/notifications`);
      return;
    }
    if (notification.type === 'application_status') {
      router.push('/(volunteer)/applications');
    }
    // A 'test' notification routes nowhere: it exists only to prove delivery.
  }

  const header = (
    <ScreenHeader
      title="Notifications"
      fallback="/(volunteer)/feed"
      trailing={
        <Pressable
          onPress={() => markRead.mutate(undefined)}
          disabled={unread === 0 || markRead.isPending}
          accessibilityRole="button"
          accessibilityLabel="Mark all notifications as read"
          hitSlop={12}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <MaterialCommunityIcons
            name="check-all"
            size={24}
            // Greyed rather than hidden when nothing is unread, so the control
            // does not appear and disappear as the list changes.
            color={unread === 0 ? colors.border : colors.primary}
          />
        </Pressable>
      }
    />
  );

  if (notificationsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <ListSkeleton rows={5} rowHeight={88} />
      </SafeAreaView>
    );
  }

  if (notificationsQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centerFill}>
          <ErrorState
            message={
              notificationsQuery.error instanceof Error
                ? notificationsQuery.error.message
                : 'Please try again.'
            }
            onRetry={() => notificationsQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}

      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const active = tab.value === filter;
          return (
            <Pressable
              key={tab.value}
              onPress={() => setFilter(tab.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={styles.tab}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
              <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={rows.length === 0 ? styles.emptyContent : undefined}
        refreshControl={
          <RefreshControl
            refreshing={notificationsQuery.isRefetching}
            onRefresh={() => notificationsQuery.refetch()}
          />
        }
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <Text style={styles.groupHeader}>{item.label}</Text>
          ) : (
            <NotificationRow
              notification={item.notification}
              onPress={() => handlePress(item.notification)}
            />
          )
        }
        ListEmptyComponent={
          notifications.length === 0 ? (
            <EmptyState
              icon="bell-outline"
              title="No notifications yet"
              message="When an outreach matches your profile or an organisation responds to an application, you'll hear about it here."
              actionLabel="Browse outreaches"
              onAction={() => router.push('/(volunteer)/feed')}
            />
          ) : (
            <EmptyState
              icon="filter-variant"
              title="Nothing in this tab"
              message="You have no notifications of this kind yet."
            />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  tabLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textSecondary,
    paddingTop: spacing.sm,
  },
  tabLabelActive: {
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  tabUnderline: {
    height: 2,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
  },
  tabUnderlineActive: {
    backgroundColor: colors.primary,
  },
  groupHeader: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.textSecondary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
