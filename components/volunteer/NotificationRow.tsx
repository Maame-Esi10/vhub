import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { AppNotification, NotificationType } from '@/hooks/useNotifications';

export interface NotificationRowProps {
  notification: AppNotification;
  onPress: () => void;
}

/**
 * One row of design-refs/Notifications.png.
 *
 * Unread is carried by THREE cues, not colour alone: the tinted surface, the
 * left accent bar, and full-strength title text against the muted read state.
 * Colour-only would be invisible to a red/green-deficient user, and the tint
 * at this opacity is very low contrast on a bright phone screen outdoors --
 * which is where a volunteer actually checks these.
 */

const ICONS: Record<NotificationType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  new_match: 'heart',
  application_status: 'clipboard-check-outline',
  event_reminder: 'clock-outline',
  test: 'bell-outline',
};

/** Icon tint per type, matching the coral/blue/amber circles in the design. */
const ICON_COLORS: Record<NotificationType, { fg: string; bg: string }> = {
  new_match: { fg: colors.primary, bg: '#FFECEC' },
  application_status: { fg: '#3B82F6', bg: '#E4EDFD' },
  event_reminder: { fg: colors.warning, bg: '#FDF0DC' },
  test: { fg: colors.textSecondary, bg: colors.surface },
};

/**
 * "15m ago" / "2h ago" / "1d ago", as in the design.
 *
 * Deliberately stops at days rather than rolling over to weeks or months: the
 * list is capped at the most recent 100 and grouped under a dated heading, so
 * an exact "43d ago" carries no more meaning than the heading already does.
 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diffMs = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationRow({ notification, onPress }: NotificationRowProps) {
  const unread = !notification.read_at;
  const icon = ICONS[notification.type] ?? 'bell-outline';
  const tint = ICON_COLORS[notification.type] ?? ICON_COLORS.test;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // Spoken before the title so the state is known without the visual cues.
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${notification.title}. ${notification.body}`}
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.pressed]}
    >
      {unread && <View style={styles.accent} />}

      <View style={[styles.iconCircle, { backgroundColor: tint.bg }]}>
        <MaterialCommunityIcons name={icon} size={20} color={tint.fg} />
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, !unread && styles.titleRead]} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.time}>{formatRelativeTime(notification.created_at)}</Text>
        </View>
        <Text style={[styles.body, !unread && styles.bodyRead]}>{notification.body}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  rowUnread: {
    backgroundColor: '#FFF5F5',
  },
  pressed: {
    opacity: 0.7,
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.primary,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  titleRead: {
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  time: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  bodyRead: {
    opacity: 0.8,
  },
});
