import { useState } from 'react';
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
   * `notificationDestination()` on the screen, so the trailing glyph and the
   * tap can never disagree: a row that offers to open a screen always opens
   * one, and a notice that leads nowhere does not pretend to.
   */
  navigable?: boolean;
}

/**
 * One notification, as an inbox row.
 *
 * A PREVIEW THAT OPENS (owner, 2026-09-22: "it is supposed to display a
 * preview, then tap for it to be opened or direct you to the screen").
 *
 * The message is clamped to two lines. What a tap then does depends on whether
 * the notification has anywhere to go, and both answers come from the single
 * `navigable` flag the screen derives from `notificationDestination()`:
 *
 *   - It HAS a destination: the tap opens that screen, which is where the full
 *     story lives anyway. The tracker states an application's status in words;
 *     the verification screen shows the document and the reason.
 *   - It has NONE (a suspension, a test push): the tap expands the row in
 *     place. Those two are the only kinds whose row is the one and only place
 *     their text is ever read, so clamping them with no way to open them would
 *     hide the sentence that matters most. That is why the clamp could not be
 *     added on its own, and why it was left off when the rows were first
 *     shortened.
 *
 * The trailing glyph says which it will be: a right chevron opens a screen, a
 * down chevron opens the message. It used to be a right chevron or an empty
 * spacer, so a row that did nothing on tap looked like a row with nothing to do.
 *
 * WHY THE ROW LOOKED EMPTY DOWN THE MIDDLE (owner, same round: "why are the
 * texts centered and space is at the left and right"). The text column was
 * being squeezed from four directions at once: the screen's 24px list inset,
 * the card's own 16px padding, a 12px gap after the icon, and a 20px chevron
 * with another 12px gap before it. That left roughly 250px of a 400px screen
 * for the words, so short lines sat in a narrow channel with wide empty margins
 * either side, which reads as centred text. The list inset, the card padding,
 * both gaps and the chevron all came down and the words got the space back.
 *
 * AND WHY IT IS STILL NOT A CHAT BUBBLE. That was the fault before this one and
 * the anatomy that fixed it is unchanged: a rounded-square icon tile rather
 * than a circular avatar, the timestamp on the caption line rather than under
 * the message, and radius.md corners rather than radius.lg.
 *
 * COLOUR CARRIES THE STATE ("the boxes are too plain, dull"). The icon tile is
 * FILLED with the notification's own tone while it is unread and only tinted
 * once it has been read, and the New badge and the chevron take the same
 * colour. An unread row is now a different thing at a glance rather than on
 * inspection. That is deliberately not a coloured bar down the left edge: the
 * bar was removed from these rows and from the application cards for a reason
 * that still holds, which is that it is a decoration saying nothing the row
 * does not already say three other ways.
 */
export function NotificationCard({ notification, onPress, navigable = true }: NotificationCardProps) {
  const unread = !notification.read_at;
  const { category, icon, tone } = describeNotification(notification);
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
      // Spoken before the title so the state and the kind are known without
      // relying on the visual cues at all.
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${category}. ${notification.title}. ${notification.body}. ${time}`}
      accessibilityHint={navigable ? 'Opens the related screen' : 'Shows the whole message'}
      accessibilityState={navigable ? undefined : { expanded }}
      style={({ pressed }) => [
        styles.row,
        unread && styles.rowUnread,
        unread && { borderColor: tint.bg },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconTile, { backgroundColor: unread ? tint.fg : tint.bg }]}>
        <MaterialCommunityIcons name={icon} size={18} color={unread ? colors.white : tint.fg} />
      </View>

      <View style={styles.content}>
        <View style={styles.captionRow}>
          <Text style={[styles.category, { color: tint.fg }]} numberOfLines={1}>
            {category}
          </Text>
          {unread ? (
            <View style={[styles.newBadge, { backgroundColor: tint.fg }]}>
              <Text style={styles.newBadgeText}>New</Text>
            </View>
          ) : null}
          {/*
            THE TIME BELONGS UP HERE. Under the message it is a chat timestamp;
            on the caption line it is a dateline, which is what a list of news
            items uses.
          */}
          <Text style={styles.time}>{time}</Text>
        </View>

        <Text style={[styles.title, !unread && styles.titleRead]} numberOfLines={2}>
          {notification.title}
        </Text>
        {/*
          THE PREVIEW. `undefined` removes the clamp when expanded, rather than
          0: both work, but undefined is the documented way to say "no limit"
          and does not rely on 0 being treated as absent.
        */}
        <Text style={styles.body} numberOfLines={expanded ? undefined : 2}>
          {notification.body}
        </Text>
      </View>

      <MaterialCommunityIcons
        name={navigable ? 'chevron-right' : expanded ? 'chevron-up' : 'chevron-down'}
        size={18}
        color={unread ? tint.fg : colors.textSecondary}
        style={styles.chevron}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // flex-start, not center: the icon and the chevron align to the TOP of a
    // multi-line row, which keeps a tall row reading as a list entry rather
    // than as a block with something floating beside it.
    alignItems: 'flex-start',
    // 10, not 12. Every pixel between the icon and the words is a pixel the
    // words do not get, and the column was the thing that was short.
    gap: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  rowUnread: {
    backgroundColor: colors.surfaceSubtle,
  },
  pressed: {
    opacity: 0.85,
  },
  iconTile: {
    width: 32,
    height: 32,
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
    // their line, alignContent places the line itself and otherwise pins it to
    // the top of the box.
    flexWrap: 'wrap',
    alignContent: 'center',
    rowGap: spacing.xs,
    marginBottom: 3,
  },
  category: {
    flexShrink: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  newBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
  },
  newBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
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
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 1,
  },
  chevron: {
    marginTop: spacing.xs + 1,
  },
});
