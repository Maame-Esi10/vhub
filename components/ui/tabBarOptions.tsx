import { Ionicons } from '@expo/vector-icons';
import {
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type ColorValue,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * How far the bar floats in from the left and right edges.
 *
 * A PROPORTION OF THE SCREEN, NOT A FIXED NUMBER (owner, reported three times:
 * "it still spans the full width... I want space OUTSIDE the container").
 *
 * The history is the useful part. It was `spacing.base` (16) so the pill lined
 * up with the content gutter, which is exactly what made it read as part of
 * the page rather than as something floating on it. Raising it to 28 helped
 * and was still not enough, because 28 on a 400dp screen is a bar 86% of the
 * width -- which the eye reads as full-width with rounded ends, not as a pill.
 *
 * `(-------)` is wrong. `(   -------   )` is right.
 *
 * 12% a side puts the bar at roughly three quarters of the screen, which is
 * the point where it stops touching and starts floating. Clamped so it does
 * not collapse on a small handset or drift absurdly wide on a tablet.
 *
 * THE LABELS ARE WHAT MADE THIS IMPOSSIBLE BEFORE, and they are gone: see
 * tabBarShowLabel below. Five labelled tabs cannot fit in three quarters of a
 * phone screen at a legible size, which is why two earlier attempts only
 * nudged the number.
 */
function barInset(screenWidth: number): number {
  return Math.min(Math.max(screenWidth * 0.12, 28), 72);
}

/** Clearance between the bottom of the bar and the gesture bar or screen edge. */
const BAR_LIFT = spacing.md;

/** The bar's own height. 58 rather than 64: with the labels gone there is
 * nothing under the glyph to leave room for, and a shorter bar reads more like
 * a pill and less like a strip. */
const BAR_HEIGHT = 58;

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
  const { width } = useWindowDimensions();
  const inset = barInset(width);

  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textSecondary,
    tabBarStyle: {
      position: 'absolute' as const,
      left: inset,
      right: inset,
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
    /*
      ICONS ONLY (owner, 2026-09-15).

      This is the trade the short bar required, and it is a real one. Five
      labelled tabs need roughly the full width of a phone at a legible size,
      so every previous attempt to inset the pill was capped by the longest
      word on the admin bar ("CREDENTIALS"). Dropping the labels is what makes
      three-quarter width possible at all.

      What it costs: a first-time user identifies a tab by its glyph rather
      than by reading it. The glyphs are the conventional ones for exactly
      these destinations -- house, document, calendar, person, and a filled
      coral disc for Create -- and the accessibility label on every tab still
      speaks its name, so a screen reader is unaffected.

      Putting labels back is this one line. The inset would have to come down
      with it.
    */
    tabBarShowLabel: false,
    tabBarLabelStyle: {
      fontFamily: fontFamily.semiBold,
      // 9/0 rather than 9.5/0.2, which was itself down from 10/0.5. Each
      // reduction has bought room for the same thing: five labels across a
      // pill, the longest being "CREDENTIALS" on the admin bar at eleven
      // characters. Widening BAR_INSET above narrows the bar by 24px, which
      // costs roughly 5px per tab on a five-tab bar, and this returns it.
      //
      // Letter-spacing is now zero. On uppercase text at this size it was
      // buying legibility worth less than the ~2px per label it cost, and a
      // truncated label is worse than a slightly tighter one.
      fontSize: 9,
      letterSpacing: 0,
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
 * The bottom padding a scroll container needs so its LAST element is clear of
 * the floating tab bar, ready to spread into a `contentContainerStyle`.
 *
 * WHY THIS EXISTS RATHER THAN EACH SCREEN CALLING tabBarClearance ITSELF
 * (owner-reported, 2026-09-14: Sign Out on Settings was visible behind the
 * pill and could not be tapped).
 *
 * The bar is `position: absolute`, so React Navigation reserves NO room for
 * it and every screen it floats over must leave that room itself. The trap is
 * which screens those are. A screen registered with `href: null` is hidden
 * from the BAR but is still a screen OF the tab navigator, so the bar renders
 * on top of it exactly as it does on a visible tab -- Settings, Edit Profile,
 * Notifications and twenty others included. Only the four/five visible tabs
 * per group had been padded, because "tab screen" was read as "screen with a
 * tab button" when it actually means "screen inside the tab navigator".
 *
 * A fixed `paddingBottom: spacing.xxl` (32) is not close: the pill's top edge
 * sits at `inset + 76` from the bottom of the screen, so on a typical handset
 * the last ~85px of content is underneath it -- comfortably more than a
 * button's height, which is why the control was completely unreachable rather
 * than merely tight.
 *
 * Returning the whole style object rather than the number keeps the
 * arithmetic in one place and makes the call site a single spread, so a screen
 * added later copies a line instead of re-deriving a measurement.
 *
 * Spread it LAST so it wins over any paddingBottom already in the stylesheet:
 *   contentContainerStyle={[styles.content, useTabBarContentPadding()]}
 */
export function useTabBarContentPadding(): { paddingBottom: number } {
  const insets = useSafeAreaInsets();
  return { paddingBottom: tabBarClearance(insets.bottom) };
}

/**
 * The offset a FIXED FOOTER needs so its buttons are not under the pill.
 *
 * WHY THIS IS SEPARATE FROM useTabBarContentPadding (owner-reported,
 * 2026-09-15: "the Next button vanishes... on Step 3 I am stuck").
 *
 * A footer that is a SIBLING of the scroll view, not a child of it, sits at the
 * bottom of the screen and is completely unaffected by the scroll content's
 * padding. Create Outreach, Edit Outreach, the volunteer outreach detail and
 * the attendance screen all have one, and every one of those footers held the
 * screen's primary action -- Next, Save, Apply.
 *
 * THE SYMPTOM LOOKED LIKE A BUG IN THE BUTTON, WHICH IS WHY IT SURVIVED.
 * The button reappeared whenever a text field was focused, because the
 * keyboard shrinks the window and KeyboardAvoidingView lifts the footer clear
 * of the pill. So it seemed to come and go with focus. On the Create Outreach
 * step that has no text input at all, the keyboard never opened, the footer
 * never lifted, and the flow was impassable.
 *
 * MARGIN, NOT PADDING. Padding would stretch the footer down behind the pill,
 * leaving a tall bar with its border high up the screen and an empty region
 * underneath. A margin keeps the footer a compact bar that ENDS above the
 * floating pill, which is what the design intends: the pill floats over the
 * page, and the page's furniture stops short of it.
 *
 * A screen using this should NOT also put the full clearance on its scroll
 * content -- the footer is between the two, so the padding would be dead space.
 */
export function useTabBarFooterOffset(): { marginBottom: number } {
  const insets = useSafeAreaInsets();
  return { marginBottom: tabBarClearance(insets.bottom) };
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
    // Larger than before, because with the labels gone the glyph is the only
    // thing naming the destination.
    return <Ionicons name={focused ? focusedName : unfocusedName} size={26} color={color} />;
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
    // NOT CORAL WHEN INACTIVE (owner, 2026-09-15). It used to stay coral at
    // 55% opacity on the reasoning that the primary action should always be
    // findable -- but on a bar where coral is what says "you are here", a
    // permanently coral tab says you are on Create when you are not. The disc
    // shape still makes it findable; the colour is now free to mean selected.
    backgroundColor: colors.textSecondary,
    opacity: 0.55,
  },
});
