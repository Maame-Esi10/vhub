import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { EmptyState, ErrorState, ListSkeleton, ScreenHeader } from '@/components/ui';
// The row is generic — icon, title, body, unread cues — and only lives under
// components/volunteer because that side had an inbox first. Imported rather
// than copied so the two inboxes cannot drift apart visually.
import { NotificationRow } from '@/components/volunteer';
import {
  toNotificationRows,
  unreadCount,
  useMarkNotificationsRead,
  useNotifications,
  type AppNotification,
} from '@/hooks/useNotifications';
import { colors, fontFamily, spacing } from '@/constants/theme';

/**
 * The organisation's inbox.
 *
 * WHY THIS EXISTS. The organisation side had no notifications screen at all,
 * which was not obvious because pushes still ARRIVED — the under-subscription
 * escalation reached a real device on 2026-08-20. Every one of those also
 * writes a `notifications` row, and until now nothing in the organisation's app
 * could read one: miss the push, and the message was gone.
 *
 * NO TABS, unlike the volunteer screen. Its three are All / Matches / Updates,
 * and "Matches" is `new_match`, which is only ever sent to volunteers. Offering
 * an organisation a tab that is structurally always empty would be a worse
 * screen, not a more consistent one.
 *
 * No design ref exists for this screen (design-refs/Notifications.png is the
 * volunteer one), so it deliberately reuses that screen's language — the same
 * ScreenHeader, the same dated group headings, the same row — rather than
 * inventing a second visual style for the same content.
 */
export default function OrganisationNotifications() {
  const router = useRouter();
  const notificationsQuery = useNotifications();
  const markRead = useMarkNotificationsRead();

  const notifications = useMemo(() => notificationsQuery.data ?? [], [notificationsQuery.data]);
  const rows = useMemo(() => toNotificationRows(notifications), [notifications]);
  const unread = unreadCount(notifications);

  /**
   * Tapping marks read and routes on what the server attached.
   *
   * A new applicant goes to the vetting queue for THAT event rather than to the
   * event page: the notification exists because there is someone to decide on,
   * and the decision is one screen further in.
   */
  function handlePress(notification: AppNotification) {
    if (!notification.read_at) {
      markRead.mutate(notification.id);
    }

    const kind = (notification.data as { kind?: string } | null)?.kind;
    if (kind === 'new_application' && notification.outreach_id) {
      router.push(`/(organisation)/applicants?outreachId=${notification.outreach_id}`);
      return;
    }
    if (notification.outreach_id) {
      router.push(`/(organisation)/outreach/${notification.outreach_id}`);
    }
  }

  const header = (
    <ScreenHeader
      title="Notifications"
      fallback="/(organisation)/dashboard"
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

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={rows.length === 0 ? styles.emptyContent : styles.listContent}
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
  // Real breathing room at both ends of the list rather than rows running into
  // the header and the tab bar.
  listContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  groupHeader: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.xl,
  },
  pressed: {
    opacity: 0.6,
  },
});
