import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface HintRailItem {
  icon: IconName;
  /** Two or three words. It is a signpost, not a sentence. */
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}

export interface HintRailProps {
  items: readonly HintRailItem[];
  /** Side padding of the screen, so the rail can bleed to both edges. */
  edgePadding?: number;
}

/**
 * Secondary signposts as one scrolling row, not a stack of boxes.
 *
 * WHY IT CHANGED (owner, 2026-09-16: "bad UI decision... they are secondary
 * information and should not occupy the position they do").
 *
 * The first version was two full-width rows above the feed. Each was a
 * defensible sentence and together they were a wall between somebody opening
 * the app and the outreaches they came for -- secondary content taking primary
 * space, which is the fault whatever the words say.
 *
 * A horizontal rail fixes the thing that was actually wrong: VERTICAL SPACE.
 * Two pills cost one short row whatever their number, so a third signpost
 * later costs nothing rather than pushing the feed further down.
 *
 * IT BLEEDS TO BOTH EDGES. The rail's padding comes from the caller rather
 * than the scroll view, so the first pill lines up with the content above it
 * and the last one runs off the right edge instead of stopping short -- which
 * is what tells somebody there is more to scroll without needing an indicator.
 *
 * THE LABELS ARE SIGNPOSTS, NOT EXPLANATIONS. "Why these matches?" is a
 * question somebody either has or does not; answering it here would rebuild
 * the wall this replaced. The answer is one tap away.
 */
export function HintRail({ items, edgePadding = spacing.xl }: HintRailProps) {
  if (items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.rail}
      contentContainerStyle={[styles.content, { paddingHorizontal: edgePadding }]}
      // A rail of two or three pills is not a scroll gesture people expect to
      // fight the vertical list for, so it keeps its own taps responsive.
      keyboardShouldPersistTaps="handled"
    >
      {items.map((item) => (
        <Pressable
          key={item.label}
          onPress={item.onPress}
          accessibilityRole="button"
          accessibilityLabel={item.accessibilityLabel}
          hitSlop={6}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name={item.icon} size={15} color={colors.primary} />
          <Text style={styles.label} numberOfLines={1}>
            {item.label}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={15} color={colors.textSecondary} />
        </Pressable>
      ))}
      {/* Trailing air, so the last pill is not flush against the screen edge
          once it has been scrolled to. */}
      <View style={styles.tail} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: {
    // flexGrow 0 so the rail takes its content height and nothing more: inside
    // a column it would otherwise try to fill the space it is given.
    flexGrow: 0,
    /*
      SPACE ABOVE, NOT ONLY BELOW (owner, 2026-09-18: the pill "sits too close
      under the V-Score text", on both home screens).

      The rail had a bottom margin and no top one, so on both screens it sat
      flush under the greeting block -- close enough to the V-Score line to
      read as part of it rather than as a separate row of signposts. The margin
      lives here rather than on either screen because both place the rail
      immediately under their header and both were wrong in the same way.

      20, not 16: it has to be clearly larger than the 8 between the greeting
      and the V-Score line under it, or the group boundary is not stated.
    */
    marginTop: spacing.lg,
    marginBottom: spacing.base,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  pressed: {
    opacity: 0.65,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textPrimary,
  },
  tail: {
    width: spacing.md,
  },
});
