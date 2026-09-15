import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface HintRowProps {
  icon: IconName;
  /** One short line. Never two. */
  text: string;
  /** The tappable words at the end, e.g. "Edit profile". */
  actionLabel: string;
  onPress: () => void;
  accessibilityLabel: string;
}

/**
 * One line on a home screen pointing somewhere people do not find on their own.
 *
 * WHY (owner, 2026-09-15). Two things were invisible. Nothing told a volunteer
 * that the skills on their profile decide what their feed shows them, so a
 * thin profile looked like a quiet platform rather than a fixable setting. And
 * nobody visits the Info Hub unprompted, so the one screen that explains
 * clinical versus support was read by the people who least needed it.
 *
 * DELIBERATELY NOT A CARD, A BANNER OR A DISMISSIBLE. A card competes with the
 * outreaches, which are what the screen is for; a dismissible needs somewhere
 * to remember the dismissal and gives the least engaged user a way to remove
 * the thing aimed at them. One quiet line survives being seen fifty times,
 * which is the test a permanent hint has to pass.
 *
 * ONE LINE, and the prop is typed as such to keep it that way. A hint long
 * enough to wrap twice is an explanation, and explanations belong behind it.
 */
export function HintRow({ icon, text, actionLabel, onPress, accessibilityLabel }: HintRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={16} color={colors.textSecondary} />
      <View style={styles.textWrap}>
        <Text style={styles.text}>
          {text} <Text style={styles.action}>{actionLabel}</Text>
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // alignItems centres children within their line; alignContent places the
    // line itself and defaults to flex-start, so a wrapping row pins to the top.
    alignContent: 'center',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  pressed: {
    opacity: 0.7,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  text: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  action: {
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
});
