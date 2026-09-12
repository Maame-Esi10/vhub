import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * How far the bar floats in from the left and right edges of the screen.
 * Matches `spacing.base`, which is the horizontal rhythm the cards on the
 * screens behind it already use, so the bar lines up with the content rather
 * than sitting at some width of its own.
 */
const BAR_INSET = spacing.base;

/** Clearance between the bottom of the bar and the gesture bar or screen edge. */
const BAR_LIFT = spacing.md;

/** The bar's own height, before the label and icon are measured into it. */
const BAR_HEIGHT = 64;

/**
 * Shared tab bar chrome for the volunteer, organisation and admin groups, so
 * the three bars stay identical as screens are added.
 *
 * A FLOATING PILL, not a docked bar (owner, 2026-09-12). It is inset from both
 * edges, lifted clear of the bottom, and fully rounded, so it reads as a
 * control sitting ON the app rather than a strip the app ends at.
 *
 * THE SAFE AREA IS A MARGIN HERE, NOT PADDING. A docked bar absorbs the
 * device's bottom inset by growing taller and padding its contents down into
 * it — which is what the previous version did, and correctly, because the bar
 * went all the way to the bottom of the screen. A floating bar must do the
 * opposite: the inset has to sit UNDERNEATH it as empty space, or the pill
 * overlaps the gesture bar and the system's own swipe area lands on top of the
 * Profile tab. So `bottom` is the inset plus a fixed lift, and the height no
 * longer varies by device.
 *
 * `position: absolute` is what lets content scroll underneath it. React
 * Navigation stops reserving room for the bar when it is absolute, so every
 * screen behind it needs bottom padding of its own — which is why
 * TAB_BAR_CLEARANCE is exported rather than left for each screen to guess.
 *
 * Deliberately un-annotated: `BottomTabNavigationOptions` isn't importable here
 * (expo-router vendors @react-navigation/bottom-tabs rather than exposing it as
 * a resolvable dependency), so the type is inferred and checked structurally at
 * the `<Tabs screenOptions={...}>` call site. The `as const` on textTransform
 * and position is what keeps them string literals rather than widening to
 * `string`, which would fail that check.
 */
export function useTabBarScreenOptions() {
  const insets = useSafeAreaInsets();

  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textSecondary,
    tabBarStyle: {
      position: 'absolute' as const,
      left: BAR_INSET,
      right: BAR_INSET,
      bottom: insets.bottom + BAR_LIFT,
      height: BAR_HEIGHT,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
      backgroundColor: colors.background,
      borderRadius: radius.pill,
      // A floating surface needs an edge of its own: against a white screen
      // the shadow alone is not enough to separate the two, and against a
      // photograph the shadow does nothing at all.
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      // React Navigation's default bar draws a top border; on a pill that
      // renders as a stray line across the middle of the rounded ends.
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      elevation: 8,
      shadowColor: colors.navy,
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    tabBarLabelStyle: {
      fontFamily: fontFamily.semiBold,
      // 9.5/0.2 rather than 10/0.5: the organisation bar carries five tabs,
      // and at the wider tracking "DASHBOARD" and "APPLICANTS" were being
      // truncated on narrow devices. Every bar shares the value so they stay
      // visually identical.
      fontSize: 9.5,
      letterSpacing: 0.2,
      textTransform: 'uppercase' as const,
      marginTop: 1,
    },
    // Without this a long label silently ellipsises instead of shrinking. It
    // is also the one place in the app where text does NOT scale with the
    // system font: five labels across a pill have nowhere to grow into, and a
    // truncated tab label is worse than a small one.
    tabBarAllowFontScaling: false,
    tabBarItemStyle: {
      paddingHorizontal: 2,
      borderRadius: radius.pill,
    },
  };
}

/**
 * Room a screen must leave at the bottom of its scroll content so the last
 * thing in it is not sitting under the floating bar.
 *
 * Exported as a function of the inset rather than a constant because the bar's
 * own offset depends on it: the pill's top edge is at
 * `inset + BAR_LIFT + BAR_HEIGHT` from the bottom of the screen, and this is
 * that plus a little air.
 */
export function tabBarClearance(bottomInset: number): number {
  return bottomInset + BAR_LIFT + BAR_HEIGHT + spacing.base;
}

/**
 * Builds a tabBarIcon renderer that swaps a filled glyph in on focus and an
 * outline glyph otherwise.
 *
 * IONICONS, NOT MATERIAL COMMUNITY ICONS (owner, 2026-09-12: "the icons look
 * outdated"). Material Community's glyphs are drawn on a 24dp grid with heavy,
 * even strokes and a lot of interior detail — `file-document-outline` and
 * `account-circle-outline` in particular read as a 2014 Android app. Ionicons
 * are lighter, more geometric, and ship as matched outline/filled PAIRS for
 * almost every glyph, which is exactly what a tab bar wants: the weight change
 * is what says "selected", with the coral tint reinforcing it rather than
 * carrying it alone.
 *
 * Both names are checked against Ionicons.glyphMap at the type level, so a
 * typo is a compile error rather than a blank square.
 *
 * `emphasis` is for the one tab that is a primary action rather than a
 * destination — Create, on the organisation bar. See CreateTabIcon.
 */
export function tabBarIcon(focusedName: IconName, unfocusedName: IconName) {
  return function TabBarIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? focusedName : unfocusedName} size={23} color={color} />;
  };
}

/**
 * The Create tab's icon: a plus in a filled coral disc.
 *
 * WHY THIS ONE IS DIFFERENT. Every other tab is a place you go; Create is a
 * thing you do, and it is the single action the whole organisation side exists
 * to support. Drawing it as another outline glyph in a row of five makes the
 * app's primary action the hardest thing on the bar to find. A filled disc is
 * the established pattern for exactly this and costs no extra room.
 *
 * It keeps its label, unlike the floating action button this resembles: the
 * bar is the only navigation in the app and a wordless icon in the middle of
 * it would be a guess.
 */
export function CreateTabIcon({ focused }: { color: ColorValue; focused: boolean }) {
  return (
    <View style={[styles.createDisc, !focused && styles.createDiscIdle]}>
      <Ionicons name="add" size={20} color={colors.white} />
    </View>
  );
}

const styles = StyleSheet.create({
  createDisc: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    // Lifted very slightly so the disc's optical centre matches the baseline
    // of the outline glyphs either side of it, which are lighter.
    marginTop: Platform.OS === 'ios' ? -1 : 0,
  },
  createDiscIdle: {
    // Still coral when unselected, only quieter: the point of the disc is that
    // this action is always findable, which a grey one would undo.
    opacity: 0.55,
  },
});
