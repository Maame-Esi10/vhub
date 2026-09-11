import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { scaleWithFont, useFontScale } from '@/constants/typography';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface SettingsRowProps {
  icon: IconName;
  label: string;
  /** Muted text shown before the chevron, e.g. a current value or status. */
  value?: string;
  /** Omit to render a read-only status row: no chevron, not pressable. */
  onPress?: () => void;
}

/**
 * One row in a settings group — icon tile, label, optional trailing value,
 * chevron. Matches the row treatment in design-refs/Settings.png.
 *
 * `onPress` is optional so a group can carry a row that only reports state.
 * A row that looks tappable but leads nowhere (or somewhere harmful) is
 * worse than one that plainly doesn't move.
 */
export function SettingsRow({ icon, label, value, onPress }: SettingsRowProps) {
  // The hook's subscription is what re-renders this row when the phone's font
  // size changes; `scaleWithFont` below reads the live value.
  const { stacked } = useFontScale();

  /*
    AT A LARGE SYSTEM FONT THE LABEL AND VALUE STOP SHARING A LINE.

    This row has four things across it, and on a 360dp phone there are about
    232dp of width for the two text nodes once the icon, the chevron and the
    gaps are paid for. At 1.3x that is not enough for "Notifications" and a
    value beside it, and no redistribution of the same 232dp makes it enough —
    which is how "Notificatio / ns" happened: squeezed below the width of its
    own longest word, Android breaks inside the word as a last resort.

    So past `prefersStackedLayout()` the value moves UNDER the label and both
    get the full column. It is the ordinary settings-row treatment on both
    platforms, it reads better at that size anyway, and it is the only answer
    that does not involve taking the user's accessibility setting away.
  */
  const text = stacked ? (
    <View style={styles.stack}>
      <Text style={styles.label}>{label}</Text>
      {value ? <Text style={styles.stackedValue}>{value}</Text> : null}
    </View>
  ) : (
    <>
      {/*
        numberOfLines on BOTH is what makes a squeezed column impossible. A
        Text with no line limit will keep wrapping however narrow it gets, and
        once it is narrower than a single word React Native breaks INSIDE the
        word -- which is the "Not / verifi / ed" stack. With a limit it
        ellipsizes instead, so the worst case is a clipped string rather than a
        vertical ladder of letters.
      */}
      <Text
        style={[styles.label, { minWidth: scaleWithFont(96) }]}
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
      {value ? (
        <Text
          style={[styles.value, { minWidth: scaleWithFont(84) }]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {value}
        </Text>
      ) : null}
    </>
  );

  const content = (
    <>
      <View style={styles.iconTile}>
        <MaterialCommunityIcons name={icon} size={20} color={colors.textPrimary} />
      </View>
      {text}
      {onPress ? (
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={colors.textSecondary}
          style={styles.chevron}
        />
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
      accessibilityLabel={label}
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
    // spacing.md, not spacing.base: three gaps sit between the four parts, so
    // every 4px here costs 12px of text width on the narrowest phone.
    gap: spacing.md,
    minHeight: 64,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.8,
  },
  iconTile: {
    width: 40,
    height: 40,
    // Fixed means fixed: without this the tile is a flex item like any other
    // and squashes into an oval when the text either side is long.
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ---------------------------------------------------------------------
  // The four parts get ONE explicit distribution, and every part has a floor.
  //
  // This row has now been broken twice by fixing one side at the other's
  // expense, so the model is written out rather than tuned:
  //
  //   icon      fixed 40           (flexGrow 0, flexShrink 0)
  //   label     takes the slack    (flexGrow 1, flexBasis 0, minWidth 96)
  //   value     sized to content   (flexGrow 0, capped 40%, minWidth 84)
  //   chevron   fixed 20           (flexShrink 0)
  //
  // Attempt one gave the label `flex: 1` and the value nothing: flexBasis 0
  // meant the label started at zero and only grew into whatever the value had
  // not already claimed at full content width, so "Login email & password"
  // left the title a few characters wide -- the "one letter per line" bug.
  //
  // Attempt two gave the label flexBasis 55% and flexShrink 0. That saved the
  // title and starved the VALUE instead, because the value could shrink
  // without limit and had no line cap: hence "Not / verifi / ed".
  //
  // The real defect was shared by both: two unbounded text nodes competing for
  // one row, with nothing stopping either from being squeezed below the width
  // of a single word. So now BOTH have a minWidth wide enough for the longest
  // word they must hold ("Verification" ~88px at 15px, "password" ~57px at
  // 13px), and BOTH cap their line count so the fallback is an ellipsis rather
  // than a vertical stack.
  //
  // The 40% cap on the value is what keeps the arithmetic safe on a 360dp
  // phone: 328 content - 40 icon - 20 chevron - 36 gaps = 232 for text; the
  // value takes at most 131 of it, leaving the label 101, comfortably above
  // its 96 floor. On a 320dp phone the value shrinks to its own floor and the
  // row still fits without overflowing.
  //
  // ATTEMPT THREE (2026-09-11) found the assumption underneath all of that:
  // every number above is a fixed pixel, while the font sizes they were
  // measured against scale with the phone's accessibility setting. At 1.3x
  // the same 232dp has to hold text that is a third wider, and the arithmetic
  // stops working however it is divided -- hence "Notificatio / ns". So the
  // two floors now come from scaleWithFont(), and past 1.2x the row stops
  // being a row at all. The distribution below only describes the side-by-side
  // form.
  // ---------------------------------------------------------------------
  // The stacked form: label and value share one column, each on its own line.
  stack: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    gap: 2,
  },
  stackedValue: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  // minWidth is applied inline from scaleWithFont(96): a floor written in
  // fixed pixels is exactly the bug, because it stays 96 while the text in it
  // grows by a third.
  label: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    fontFamily: fontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  value: {
    flexGrow: 0,
    flexShrink: 1,
    // Content-sized, so a short value ("Verified") gives its space back to the
    // title instead of holding a fixed column open.
    flexBasis: 'auto',
    maxWidth: '40%',
    textAlign: 'right',
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  // An icon is a Text node underneath, so without this it is a shrinkable flex
  // item and the arrow clips to a sliver when the row is tight.
  chevron: {
    flexGrow: 0,
    flexShrink: 0,
    width: 20,
  },
  groupLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
