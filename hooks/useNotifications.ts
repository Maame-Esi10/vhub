import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { PushPayload } from '@/lib/push';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (userId: string) => [...notificationKeys.all, 'list', userId] as const,
};

export type NotificationType = PushPayload['type'];

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  outreach_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

/** The three tabs in design-refs/Notifications.png. */
export type NotificationFilter = 'all' | 'matches' | 'updates';

/**
 * Every notification for the signed-in user, newest first.
 *
 * Read straight from Supabase rather than through the serverless API:
 * `notifications_select_own` already scopes the table to `auth.uid()`, and
 * reading needs no secret. Only the WRITES are asymmetric — the server inserts
 * (there is no client insert policy at all) and the client may touch nothing
 * but `read_at`, enforced by column grant.
 *
 * Not filtered in SQL. The list is small and per-user, and holding one cached
 * array lets the three tabs switch instantly and share an unread count without
 * three separate queries.
 */
export function useNotifications() {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: notificationKeys.list(userId ?? 'anonymous'),
    enabled: !!userId,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw new Error(error.message || 'Could not load your notifications.');
      }
      return (data ?? []) as AppNotification[];
    },
  });
}

export function filterNotifications(
  notifications: readonly AppNotification[],
  filter: NotificationFilter
): AppNotification[] {
  if (filter === 'all') return [...notifications];
  if (filter === 'matches') return notifications.filter((n) => n.type === 'new_match');
  // "Updates" is everything that is not a match — status decisions, reminders,
  // and the QA test push — rather than an explicit list, so a notification type
  // added later still surfaces somewhere instead of silently vanishing.
  return notifications.filter((n) => n.type !== 'new_match');
}

/**
 * A dated section heading, or one notification under it.
 *
 * `first` and `last` say where the row sits inside its dated group, which is
 * what lets the screen draw each group as ONE rounded panel with hairline
 * separators rather than as a stack of separate boxes. A flat list cannot work
 * that out per row without looking at its neighbours, so it is computed once
 * here, where the grouping already happens.
 */
export type NotificationListRow =
  | { kind: 'header'; key: string; label: string }
  | {
      kind: 'notification';
      key: string;
      notification: AppNotification;
      first: boolean;
      last: boolean;
    };

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * TODAY / YESTERDAY / an explicit date, as in design-refs/Notifications.png.
 *
 * Compared on local calendar date rather than elapsed hours: something sent at
 * 23:50 is "yesterday" at 00:10, not "22 minutes ago and also today".
 */
export function notificationGroupHeading(iso: string): string {
  const created = new Date(iso);
  if (Number.isNaN(created.getTime())) return 'EARLIER';

  const dayDiff = Math.round((startOfLocalDay(new Date()) - startOfLocalDay(created)) / 86_400_000);
  if (dayDiff <= 0) return 'TODAY';
  if (dayDiff === 1) return 'YESTERDAY';
  return created
    .toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    .toUpperCase();
}

/**
 * Flattens a sorted notification list into headed rows for one FlatList.
 *
 * Lives here rather than on the volunteer screen because the organisation has
 * an inbox too, and two copies of a date-grouping rule is two places for
 * "YESTERDAY" to start meaning different things.
 */
export function toNotificationRows(
  notifications: readonly AppNotification[]
): NotificationListRow[] {
  const rows: NotificationListRow[] = [];
  let lastHeading: string | null = null;

  for (const notification of notifications) {
    const heading = notificationGroupHeading(notification.created_at);
    const startsGroup = heading !== lastHeading;
    if (startsGroup) {
      rows.push({ kind: 'header', key: `header-${heading}`, label: heading });
      lastHeading = heading;
    }
    rows.push({
      kind: 'notification',
      key: notification.id,
      notification,
      first: startsGroup,
      // Provisional: corrected below once the next row is known. A row is the
      // last of its group until something else joins the group after it.
      last: true,
    });
  }

  // One backward pass to unset `last` on every row that turned out to have a
  // sibling under it. Done here rather than by looking ahead in the loop
  // because the heading of the NEXT notification is what decides it, and
  // computing that twice is how the two answers drift apart.
  for (let i = 0; i < rows.length - 1; i += 1) {
    const row = rows[i];
    const next = rows[i + 1];
    if (row?.kind === 'notification' && next?.kind === 'notification') {
      row.last = false;
    }
  }

  return rows;
}

export function unreadCount(notifications: readonly AppNotification[]): number {
  return notifications.reduce((total, n) => (n.read_at ? total : total + 1), 0);
}

/**
 * Marks one notification read, or every unread one when no id is given (the
 * double-check control in the header).
 *
 * `read_at` is the ONLY column the client may write here — `revoke update on
 * notifications` + `grant update (read_at)` in schema.sql. Adding any other
 * field to this payload fails the whole statement with 42501
 * ("permission denied for table notifications"), not an RLS error.
 */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);

  return useMutation({
    mutationFn: async (notificationId?: string): Promise<void> => {
      const readAt = new Date().toISOString();
      let query = supabase.from('notifications').update({ read_at: readAt });

      query = notificationId
        ? query.eq('id', notificationId)
        : // Only the unread ones, so re-tapping "mark all read" doesn't
          // rewrite timestamps on rows already read.
          query.is('read_at', null);

      const { error } = await query;
      if (error) {
        throw new Error(error.message || 'Could not update your notifications.');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list(userId ?? 'anonymous') });
    },
  });
}
