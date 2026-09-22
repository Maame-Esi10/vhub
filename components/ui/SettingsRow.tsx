import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface SettingsRowProps {
  icon: IconName;
  label: string;
  /** The supporting line under the label: a current value, or a status. */
  value?: string;
  /** Omit to render a read-only status row: no chevron, not pressable. */
  onPress?: () => void;
  /** Draws the row and its glyph in the danger tone, for Sign Out and the like. */
  destructive?: boolean;
}

/**
 * One row in a settings group.
 *
 * REDRAWN TO THE OWNER'S REFERENCE (2026-09-22, `design-refs/Reference -
 * settings list.png`): a soft grey slab, a bare line glyph at the leading edge,
 * the label, and the chevron sitting in a WHITE CIRCLE at the trailing edge.
 * The circle is the whole trick in that reference -- it lifts the arrow off the
 * grey without a border, and it is what makes a flat row read as tappable.
 *
 * THE LABEL AND VALUE NOW ALWAYS STACK, and that is a simplification worth
 * stating rather than a style change. They used to sit SIDE BY SIDE, and this
 * one row had been broken three separate times by that arrangement:
 *
 *   - give the label `flex: 1` and the value keeps its full content width, so
 *     "Login email & password" squeezes the title to one letter per line;
 *   - give the label a fixed basis and the value starves instead, so "Not
 *     verified" becomes "Not / verifi / ed";
 *   - fix both with pixel floors, and they stop being right the moment the
 *     phone's font scale moves, which is how "Notificatio / ns" happened.
 *
 * Every one of those is the same defect: two text nodes competing for about
 * 230dp on a 360dp phone, with nothing guaranteeing either enough room for its
 * own longest word. Stacked, each gets the full column and the competition does
 * not exist. It needs no `scaleWithFont` floors, no line caps, no
 * `prefersStackedLayout` branch and no measurement -- the arithmetic that kept
 * going wrong is simply gone, and it happens to be what the reference does too.
 */
export function SettingsRow({ icon, label, value, onPress, destructive = false }: SettingsRowProps) {
  const tint = destructive ? colors.danger : colors.textPrimary;

  const content = (
    <>
      <MaterialCommunityIcons name={icon} size={22} color={tint} style={styles.icon} />

      <View style={styles.text}>
        <Text style={[styles.label, destructive && styles.labelDestructive]}>{label}</Text>
        {value ? <Text style={styles.value}>{value}</Text> : null}
      </View>

      {onPress ? (
        /*
          A WHITE DISC, not a bare chevron. On a grey slab a loose arrow reads
          as decoration; in a disc it reads as a button, which is what the
          reference uses and why its rows look tappable without borders.
        */
        <View style={styles.chevronDisc}>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textPrimary} />
        </View>
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // The value is part of what the row says, so it is spoken with the label
      // rather than left as a second unlabelled node.
      accessibilityLabel={value ? `${label}. ${value}` : label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

/** Small letterspaced caption above a group of SettingsRows. */
export function SettingsGroupLabel({ children }: { children: string }) {
  return <Text style={styles.groupLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    minHeight: 60,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.8,
  },
  /*
    An icon is a Text node underneath, so without these it is a shrinkable flex
    item and clips to a sliver when the label is long.
  */
  icon: {
    flexGrow: 0,
    flexShrink: 0,
    width: 24,
    textAlign: 'center',
  },
  text: {
    flexGrow: 1,
    flexShrink: 1,
    // A basis of 0 lets the column take exactly the slack and no more, which
    // is what keeps the chevron disc pinned to the trailing edge.
    flexBasis: 0,
    gap: 1,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  labelDestructive: {
    color: colors.danger,
  },
  value: {
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  chevronDisc: {
    width: 30,
    height: 30,
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
});
