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
   * `notificationDestination()` on the screen, so the chevron and the tap can
   * never disagree: a row that offers to open something always opens
   * something, and a notice that leads nowhere does not pretend to.
   */
  navigable?: boolean;
}

/**
 * One notification, as an inbox row.
 *
 * WHY IT NO LONGER LOOKS LIKE A CHAT BUBBLE (owner, 2026-09-21: "the
 * notification messages read like chat bubbles. Tell me whether that is only
 * the reminder ones or all of them").
 *
 * IT WAS ALL OF THEM. There is no per-type styling anywhere in this component
 * and never was -- every notification, reminder or not, renders through this
 * one file. The reminders merely stood out because their body text is the
 * longest, which made the box taller and the resemblance more obvious. The
 * cause was the anatomy I gave the card in the first rebuild, which was
 * accidentally the anatomy of a chat message:
 *
 *   - a large CIRCULAR icon, which reads as an avatar;
 *   - a rounded box (radius.lg, 20px) wrapped tightly around a short line of
 *     prose, which is a speech bubble;
 *   - a TIMESTAMP UNDER THE MESSAGE, bottom-aligned, which is the single
 *     strongest signal of the lot. Every messaging app on the phone puts the
 *     time there and almost nothing else does.
 *
 * So it is rebuilt as a LIST ROW rather than a bubble. The icon is a plain
 * glyph in a small rounded tile, not a circle. The time moved to the top
 * right, on the caption's line, where a news list puts it. The footer and its
 * dividing rule are gone, replaced by one chevron at the trailing edge,
 * vertically centred -- the universal "this row opens something" mark, and a
 * thing no chat app has. The corner radius dropped to radius.md.
 *
 * WHAT WAS KEPT, and why the answer was not "go back to plain rows": the
 * bordered container is what makes this list belong with the feed and the
 * applications tracker, and the previous full-bleed rows with hairline
 * dividers are the pattern the owner called outdated in the first place. The
 * container stays; the contents stopped imitating a conversation.
 *
 * THE CATEGORY CAPTION is still the substantive part. Nine kinds of news share
 * four `type` values, so without it an identity-verification decision, a
 * dispute outcome and an ordinary application update are indistinguishable.
 * See lib/notificationPresentation.ts.
 *
 * Unread is said three ways, one of them a word: a "New" badge, a faint ground
 * and full-strength title text. The word is the cue that survives a
 * red/green deficiency and bright sunlight.
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
        styles.row,
        unread && styles.rowUnread,
        pressed && styles.pressed,
      ]}
    >
      {/*
        A ROUNDED SQUARE, NOT A CIRCLE. A circle at this size beside a line of
        prose is an avatar, and an avatar beside prose is a chat message.
      */}
      <View style={[styles.iconTile, { backgroundColor: tint.bg }]}>
        <MaterialCommunityIcons name={icon} size={20} color={tint.fg} />
      </View>

      <View style={styles.content}>
        <View style={styles.captionRow}>
          <Text style={[styles.category, { color: tint.fg }]} numberOfLines={1}>
            {category}
          </Text>
          {unread ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>New</Text>
            </View>
          ) : null}
          {/*
            THE TIME BELONGS UP HERE. Under the message it is a chat
            timestamp; on the caption line it is a dateline, which is what a
            list of news items uses.
          */}
          <Text style={styles.time}>{time}</Text>
        </View>

        <Text style={[styles.title, !unread && styles.titleRead]}>{notification.title}</Text>
        <Text style={styles.body}>{notification.body}</Text>
      </View>

      {navigable ? (
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={colors.textSecondary}
          style={styles.chevron}
        />
      ) : (
        // Holds the column so every row's text stops at the same place,
        // whether or not it navigates.
        <View style={styles.chevronSpacer} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // flex-start, not center: the icon and the chevron align to the TOP of a
    // multi-line row, which is what keeps a tall row reading as a list entry
    // rather than as a block with something floating beside it.
    alignItems: 'flex-start',
    gap: spacing.md,
    // radius.md, not radius.lg. Twenty-pixel corners on a box wrapped around
    // a sentence is a speech bubble.
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  rowUnread: {
    backgroundColor: '#FFF8F7',
    borderColor: colors.borderOnSurface,
  },
  pressed: {
    opacity: 0.85,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // Both are needed on a row that wraps: alignItems centres children within
    // their line, alignContent places the line itself and otherwise pins it
    // to the top of the box.
    flexWrap: 'wrap',
    alignContent: 'center',
    rowGap: spacing.xs,
    marginBottom: spacing.xs,
  },
  category: {
    flexShrink: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  newBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  newBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.white,
  },
  time: {
    // Pushed to the trailing edge of the caption line, and the last thing to
    // give up space when the caption is long.
    marginLeft: 'auto',
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
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
    marginTop: 2,
  },
  chevron: {
    marginTop: spacing.sm,
  },
  chevronSpacer: {
    width: 20,
  },
});
