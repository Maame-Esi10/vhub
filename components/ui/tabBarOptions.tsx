import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily } from '@/constants/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Shared tab bar chrome for both the volunteer and organisation groups, so
 * the two bars stay identical as screens are added. Matches the Figma bars
 * in design-refs/ (Volunteer Home Feed.png, Organization Dashboard.png):
 * coral active, mid-gray inactive, small uppercase Inter labels.
 *
 * A HOOK, not a constant, because the bar has to clear the device's bottom
 * inset. A fixed `height` overrides react-navigation's own safe-area
 * handling, so the previous flat `height: 64` pushed the labels down into
 * the gesture bar on devices with one. Height is now 56 + inset and the
 * bottom padding is the inset itself, so the bar grows on inset devices and
 * stays compact on those without.
 *
 * Deliberately un-annotated: `BottomTabNavigationOptions` isn't importable
 * here (expo-router vendors @react-navigation/bottom-tabs rather than
 * exposing it as a resolvable dependency), so the type is inferred and
 * checked structurally at the `<Tabs screenOptions={...}>` call site. The
 * `as const` on textTransform is what keeps it a string literal rather than
 * widening to `string`, which would fail that check.
 */
export function useTabBarScreenOptions() {
  const insets = useSafeAreaInsets();

  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textSecondary,
    tabBarStyle: {
      backgroundColor: colors.background,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      height: 56 + insets.bottom,
      paddingTop: 6,
      paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
    },
    tabBarLabelStyle: {
      fontFamily: fontFamily.semiBold,
      // 9.5/0.2 rather than 10/0.5: the organisation bar carries five tabs,
      // and at the wider tracking "DASHBOARD" and "APPLICANTS" were being
      // truncated on narrow devices. Both bars share the value so they stay
      // visually identical.
      fontSize: 9.5,
      letterSpacing: 0.2,
      textTransform: 'uppercase' as const,
    },
    // Without this a long label silently ellipsises instead of shrinking.
    tabBarAllowFontScaling: false,
    tabBarItemStyle: {
      paddingHorizontal: 2,
    },
  };
}

/**
 * Builds a tabBarIcon renderer that swaps a filled glyph in on focus and an
 * outline glyph otherwise — the weight change is what reads as "selected" in
 * the designs, alongside the coral tint react-navigation passes in as
 * `color`. Both names are checked against MaterialCommunityIcons.glyphMap at
 * the type level, so a typo is a compile error rather than a blank square.
 */
export function tabBarIcon(focusedName: IconName, unfocusedName: IconName) {
  return function TabBarIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return (
      <MaterialCommunityIcons
        name={focused ? focusedName : unfocusedName}
        size={24}
        color={color}
      />
    );
  };
}
