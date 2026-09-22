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
import { EmptyState, ErrorState, FilterChips, ListSkeleton, ScreenHeader } from '@/components/ui';
import { NotificationCard } from '@/components/ui/NotificationCard';
import {
  filterNotifications,
  toNotificationRows,
  unreadCount,
  useMarkNotificationsRead,
  useNotifications,
  type AppNotification,
  type NotificationFilter,
} from '@/hooks/useNotifications';
import { notificationDestination } from '@/lib/notificationPresentation';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { humanError } from '@/lib/errorMessage';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

/**
 * The volunteer's inbox.
 *
 * REBUILT 2026-09-19 (owner: it "looks outdated"). Three things changed, and
 * only the first is cosmetic.
 *
 * 1. The rows became cards, in the language every other list in the app now
 *    uses. See components/ui/NotificationCard.tsx.
 * 2. The underlined text tabs became the same pill chips the applications
 *    tracker and the feed filter with. The underline row was the app's only
 *    instance of that control, and it carried a transparent two-pixel view
 *    under every inactive tab to stop the row jumping -- a hack that exists
 *    because the pattern did not belong here.
 * 3. Tapping now routes on what the notification IS, via
 *    notificationDestination(). It used to route on "does it have an
 *    outreach_id", which sent an identity-verification decision to the
 *    Applications tracker.
 *
 * "Mark all read" is now a labelled button rather than a double-tick glyph in
 * the header. The glyph was the same fault as the coloured rail on the
 * application cards: a mark nobody was taught to read, in the most prominent
 * position on the screen.
 */
export default function Notifications() {
  // The floating tab bar is absolute and reserves no space, so the last
  // card needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
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

  /*
    Counts on the chips, so switching tab is an informed choice rather than a
    guess. Totals rather than unread counts: the unread figure is stated once,
    in words, beside them, and two different numbers meaning two different
    things on one row is how a screen stops being readable.
  */
  const tabs = useMemo(
    () => [
      { value: 'all' as const, label: 'All', count: notifications.length },
      {
        value: 'matches' as const,
        label: 'Matches',
        count: filterNotifications(notifications, 'matches').length,
      },
      {
        value: 'updates' as const,
        label: 'Updates',
        count: filterNotifications(notifications, 'updates').length,
      },
    ],
    [notifications]
  );

  /** Marks read, then goes wherever this notification actually belongs. */
  function handlePress(notification: AppNotification) {
    if (!notification.read_at) {
      markRead.mutate(notification.id);
    }

    const destination = notificationDestination(notification, 'volunteer');
    if (destination) {
      router.push(destination as Parameters<typeof router.push>[0]);
    }
  }

  const header = <ScreenHeader title="Notifications" fallback="/(volunteer)/feed" />;

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

        <FilterChips options={tabs} value={filter} onChange={setFilter} />
      </View>

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
              navigable={notificationDestination(item.notification, 'volunteer') !== null}
              first={item.first}
              last={item.last}
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
  /*
    The controls sit in their own padded block with a real gap under the
    header and a hairline closing them off, rather than the chips running
    straight into the first card.
  */
  controls: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
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
