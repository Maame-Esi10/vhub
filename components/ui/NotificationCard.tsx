import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
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
   * `notificationDestination()` on the screen, so the affordance and the tap
   * can never disagree: a row that offers to open a screen always opens one,
   * and a notice that leads nowhere does not pretend to.
   */
  navigable?: boolean;
  /** First row under its date heading: rounds the top corners. */
  first?: boolean;
  /** Last row before the next heading: rounds the bottom and drops the rule. */
  last?: boolean;
}

/**
 * One notification, as a row inside its day's panel.
 *
 * REBUILT TO THE OWNER'S REFERENCE DESIGN (2026-09-22). She supplied a banking
 * app's inbox and asked for that anatomy, with emojis in place of its
 * photographic thumbnails. Three things changed and each one removes something
 * that was saying what something else already said:
 *
 *   - THE UPPERCASE CAPTION IS GONE. "APPLICATION UPDATE" sat above a title
 *     reading "You're confirmed!" above a body reading "Ghana Health Drive:
 *     your application is now accepted." Three lines, one fact. The caption
 *     existed because nine kinds of news share four `type` values and a single
 *     blue clipboard icon could not tell them apart -- an argument about the
 *     ICON, which an emoji answers far better than a caption did. It is still
 *     in the accessibility label, where it costs no space.
 *   - THE TIMESTAMP MOVED BACK UNDER THE MESSAGE, which reverses a deliberate
 *     earlier decision and is worth being honest about. It was moved UP to the
 *     caption line because a time under a short message in a rounded box is the
 *     single strongest signal of a chat bubble. That diagnosis was right and the
 *     cure was aimed at the wrong half: it is the BOX that makes a bubble. With
 *     the per-row box gone, a small grey time under a sentence is a dateline,
 *     which is what every inbox in the reference uses.
 *   - THE PER-ROW BOX IS GONE, replaced by one rounded panel per day with
 *     hairline rules between rows. This is not the full-bleed list the owner
 *     called outdated either; it is the grouped list her reference uses, and it
 *     keeps the app's card language at the level of the GROUP instead of
 *     repeating it eleven times down a screen.
 *
 * WHAT SURVIVED. The message is still a two-line preview: a row with somewhere
 * to go opens it, and a row with nowhere to go (a suspension, a test push)
 * expands in place, because for those two this row is the only place the text
 * is ever read. Only the expandable rows carry a chevron now -- tapping a
 * notification to open the thing it is about needs no mark, and the reference
 * has none; a row that unfolds instead is the unusual one and says so.
 */
export function NotificationCard({
  notification,
  onPress,
  navigable = true,
  first = false,
  last = false,
}: NotificationCardProps) {
  const unread = !notification.read_at;
  const { category, emoji, tone } = describeNotification(notification);
  const tint = notificationToneColors(tone);
  const time = formatRelativeTime(notification.created_at);

  const [expanded, setExpanded] = useState(false);

  function handlePress() {
    // Always called: this is what marks the notification read, which is true
    // whether or not there is anywhere to go afterwards.
    onPress();
    if (!navigable) setExpanded((open) => !open);
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      // The category is spoken even though it is no longer drawn: it is the
      // thing that tells a credential decision from an application decision,
      // and a screen reader has no emoji to look at.
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${category}. ${notification.title}. ${notification.body}. ${time}`}
      accessibilityHint={navigable ? 'Opens the related screen' : 'Shows the whole message'}
      accessibilityState={navigable ? undefined : { expanded }}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last && styles.rowLast,
        unread && styles.rowUnread,
        pressed && styles.pressed,
      ]}
    >
      {/*
        A ROUNDED SQUARE, tinted with the notification's own tone, exactly the
        shape the reference gives its thumbnails. The emoji sits in it at a size
        that reads without shouting.
      */}
      <View style={[styles.emojiTile, { backgroundColor: tint.bg }]}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, !unread && styles.titleRead]} numberOfLines={2}>
          {notification.title}
        </Text>
        {/*
          THE PREVIEW. `undefined` removes the clamp when expanded rather than
          0: both work, but undefined is the documented way to say "no limit"
          and does not rely on 0 being treated as absent.
        */}
        <Text style={styles.body} numberOfLines={expanded ? undefined : 2}>
          {notification.body}
        </Text>
        <Text style={styles.time}>{time}</Text>
      </View>

      {/*
        Unread is said two ways and one of them survives a colour deficiency:
        a tinted row, and this dot. The word "New" is gone with the caption it
        sat on -- at one glance per row, a filled dot at the trailing edge is
        the same statement in a tenth of the space.
      */}
      {unread ? <View style={[styles.unreadDot, { backgroundColor: tint.fg }]} /> : null}

      {!navigable ? (
        <Text style={styles.expandMark}>{expanded ? 'Less' : 'More'}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // flex-start, not center: the tile aligns to the TOP of a multi-line row,
    // which keeps a tall row reading as a list entry rather than as a block
    // with something floating beside it.
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.background,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    // The hairline BETWEEN rows, cancelled on the last one by rowLast. A
    // bottom border rather than a separate separator component so a row always
    // carries its own rule and the two can never get out of step.
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  /*
    The panel's corners live on its first and last rows. There is no wrapper
    View around the group: a FlatList renders rows, not sections, and wrapping
    them would mean giving up the recycling that makes a long inbox scroll.
  */
  rowFirst: {
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  rowLast: {
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    borderBottomWidth: 0,
    marginBottom: spacing.base,
  },
  rowUnread: {
    backgroundColor: colors.surfaceSubtle,
  },
  pressed: {
    opacity: 0.85,
  },
  emojiTile: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 19,
    // Emoji sit high in their line box on Android; without a line height that
    // matches the tile they drift above centre.
    lineHeight: 24,
  },
  content: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  titleRead: {
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 1,
  },
  time: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: spacing.md,
  },
  expandMark: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.primary,
    marginTop: spacing.sm,
  },
});
