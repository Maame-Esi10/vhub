import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  describeNotification,
  formatRelativeTime,
  notificationToneColors,
} from '@/lib/notificationPresentation';
import type { AppNotification } from '@/hooks/useNotifications';

export interface NotificationCardProps {
  notification: AppNotification;
  onPress: () => void;
  /**
   * Whether tapping actually goes somewhere. Comes from
   * `notificationDestination()` on the screen, so the "View" affordance and
   * the tap can never disagree: a card that offers to open something always
   * opens something, and a notice that leads nowhere does not pretend to.
   */
  navigable?: boolean;
}

/**
 * One notification, as a card.
 *
 * WHAT THIS REPLACED, AND WHY (owner, 2026-09-19: the notifications page
 * "looks outdated").
 *
 * It was a full-bleed row: a 44dp icon circle, a title, a body and a hairline
 * rule underneath, with unread carried by a tinted fill and a four-pixel coral
 * bar down the left edge. That is the inbox pattern the rest of the app moved
 * away from. Every other list in VHub -- the feed, the applications tracker,
 * the roster -- is now bordered white cards on a padded ground, built from the
 * same parts in the same order, and the notifications screen was the last list
 * still drawn the old way. Put the two side by side and they read as two
 * different apps, which is exactly the complaint.
 *
 * THE LEFT COLOUR BAR IS GONE, on the same reasoning that removed it from the
 * application cards: a colour means something only to somebody who has been
 * told the key, and nothing told anybody. Unread is now said in three ways,
 * one of which is a word: a "NEW" badge, a faint warm ground, and
 * full-strength title text against the muted read state. The word is the one
 * that works for a red/green-deficient user and in bright sunlight, which is
 * where a volunteer actually checks these.
 *
 * THE CATEGORY CAPTION IS THE REAL CHANGE, though. Nine kinds of news share
 * four `type` values, so an identity-verification decision, a dispute outcome
 * and an ordinary application update all looked the same. The caption names
 * which one it is in words, above the title; see lib/notificationPresentation.ts.
 */
export function NotificationCard({ notification, onPress, navigable = true }: NotificationCardProps) {
  const unread = !notification.read_at;
  const { category, icon, tone } = describeNotification(notification);
  const tint = notificationToneColors(tone);
  const time = formatRelativeTime(notification.created_at);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // Spoken before the title so the state and the kind are known without
      // relying on the visual cues at all.
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${category}. ${notification.title}. ${notification.body}. ${time}`}
      style={({ pressed }) => [
        styles.card,
        unread && styles.cardUnread,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, { backgroundColor: tint.bg }]}>
          <MaterialCommunityIcons name={icon} size={18} color={tint.fg} />
        </View>
        <Text style={[styles.category, { color: tint.fg }]} numberOfLines={2}>
          {category}
        </Text>
        {unread ? (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>New</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.title, !unread && styles.titleRead]}>{notification.title}</Text>
      <Text style={styles.body}>{notification.body}</Text>

      <View style={styles.footer}>
        <Text style={styles.time}>{time}</Text>
        {navigable ? (
          <View style={styles.viewRow}>
            <Text style={styles.viewLabel}>View</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /*
    THE FEED CARD'S CONTAINER, TO THE TOKEN: white ground, one-pixel border,
    radius.lg. The same shape as an outreach card and an application card, so
    all three lists read as one app.
  */
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  /*
    A very faint warm ground for unread. Deliberately fainter than the old row
    tint: it is now one of three cues rather than the main one, and a strong
    fill on a card with a border reads as a selected state instead of an
    unread one.
  */
  cardUnread: {
    backgroundColor: '#FFF8F7',
    borderColor: colors.borderOnSurface,
  },
  pressed: {
    opacity: 0.85,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // Both are needed on a row that wraps: alignItems centres children within
    // their line, alignContent places the line itself and otherwise pins it
    // to the top of the box.
    flexWrap: 'wrap',
    alignContent: 'center',
    rowGap: spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  category: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  newBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  newBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.white,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  titleRead: {
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  time: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
});
