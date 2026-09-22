import { useMemo } from 'react';
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
import { EmptyState, ErrorState, ListSkeleton, ScreenHeader } from '@/components/ui';
import { NotificationCard } from '@/components/ui/NotificationCard';
import {
  toNotificationRows,
  unreadCount,
  useMarkNotificationsRead,
  useNotifications,
  type AppNotification,
} from '@/hooks/useNotifications';
import { notificationDestination } from '@/lib/notificationPresentation';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { humanError } from '@/lib/errorMessage';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

/**
 * The organisation's inbox.
 *
 * WHY THIS EXISTS. The organisation side had no notifications screen at all,
 * which was not obvious because pushes still ARRIVED. Every one of those also
 * writes a `notifications` row, and until it was built nothing in the
 * organisation's app could read one: miss the push, and the message was gone.
 *
 * NO FILTER CHIPS, unlike the volunteer screen. Its three are All / Matches /
 * Updates, and "Matches" is `new_match`, which is only ever sent to
 * volunteers. Offering an organisation a filter that is structurally always
 * empty would be a worse screen, not a more consistent one.
 *
 * Everything else is deliberately identical to the volunteer inbox, down to
 * the card, the summary line and the "Mark all read" button, so the two do not
 * drift into two visual styles for the same content. Rebuilt alongside it on
 * 2026-09-19.
 */
export default function OrganisationNotifications() {
  // The floating tab bar is absolute and reserves no space, so the last
  // card needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  const router = useRouter();
  const notificationsQuery = useNotifications();
  const markRead = useMarkNotificationsRead();

  const notifications = useMemo(() => notificationsQuery.data ?? [], [notificationsQuery.data]);
  const rows = useMemo(() => toNotificationRows(notifications), [notifications]);
  const unread = unreadCount(notifications);

  /**
   * Marks read, then goes wherever this notification actually belongs.
   *
   * A new applicant goes to the vetting queue for THAT event rather than to
   * the event page: the notification exists because there is someone to decide
   * on, and the decision is one screen further in. That rule, and the rest,
   * live in lib/notificationPresentation.ts so the card's "View" affordance is
   * driven by the same answer.
   */
  function handlePress(notification: AppNotification) {
    if (!notification.read_at) {
      markRead.mutate(notification.id);
    }

    const destination = notificationDestination(notification, 'organisation');
    if (destination) {
      router.push(destination as Parameters<typeof router.push>[0]);
    }
  }

  const header = <ScreenHeader title="Notifications" fallback="/(organisation)/dashboard" />;

  if (notificationsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        {/* 88, matching the real row now that the message is clamped to a two-line
            preview. A skeleton taller than what replaces it makes the list jump. */}
        <ListSkeleton rows={6} rowHeight={88} />
      </SafeAreaView>
    );
  }

  if (notificationsQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centerFill}>
          <ErrorState
            message={humanError(notificationsQuery.error, 'Please try again.')}
            onRetry={() => notificationsQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}

      {notifications.length > 0 ? (
        <View style={styles.controls}>
          <View style={styles.summaryRow}>
            <Text style={styles.summary}>
              {unread === 0
                ? 'You are all caught up.'
                : unread === 1
                  ? '1 unread notification'
                  : `${unread} unread notifications`}
            </Text>
            {unread > 0 ? (
              <Pressable
                onPress={() => markRead.mutate(undefined)}
                disabled={markRead.isPending}
                accessibilityRole="button"
                accessibilityLabel="Mark all notifications as read"
                hitSlop={8}
                style={({ pressed }) => [styles.markAll, pressed && styles.pressed]}
              >
                <Text style={styles.markAllText}>Mark all read</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[
          rows.length === 0 ? styles.emptyContent : styles.listContent,
          tabBarPadding,
        ]}
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
            <NotificationCard
              notification={item.notification}
              navigable={notificationDestination(item.notification, 'organisation') !== null}
              first={item.first}
              last={item.last}
              onPress={() => handlePress(item.notification)}
            />
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon="bell-outline"
            title="Nothing yet"
            message="New applicants, events short of volunteers and reminders about your own outreaches all land here."
            actionLabel="Go to your events"
            onAction={() => router.push('/(organisation)/dashboard')}
          />
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
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  controls: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
    alignContent: 'center',
    rowGap: spacing.sm,
  },
  summary: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  markAll: {
    minHeight: 32,
    justifyContent: 'center',
  },
  markAllText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  /*
    THE LIST IS INSET AT spacing.base, NOT spacing.xl (owner, 2026-09-22: "why
    are the texts centered and space is at the left and right"). 24px here plus
    the card's own padding plus the icon column plus the chevron column left the
    words about 250px of a 400px screen, so short lines sat in a narrow channel
    with wide empty margins and read as centred. The header above keeps its
    wider inset on purpose: a page title wants the generous margin, a dense list
    of rows does not.
  */
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.xxl,
  },
  groupHeader: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
});
