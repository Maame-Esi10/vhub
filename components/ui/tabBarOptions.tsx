import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { colors, fontFamily } from '@/constants/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Shared tab bar chrome for both the volunteer and organisation groups, so
 * the two bars stay identical as screens are added. Matches the Figma bars
 * in design-refs/ (Volunteer Home Feed.png, Organization Dashboard.png):
 * coral active, mid-gray inactive, small uppercase Inter labels.
 *
 * Deliberately un-annotated: `BottomTabNavigationOptions` isn't importable
 * here (expo-router vendors @react-navigation/bottom-tabs rather than
 * exposing it as a resolvable dependency), so the type is inferred and
 * checked structurally at the `<Tabs screenOptions={...}>` call site. The
 * `as const` on textTransform is what keeps it a string literal rather than
 * widening to `string`, which would fail that check.
 */
export const tabBarScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.textSecondary,
  tabBarStyle: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 64,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabBarLabelStyle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
};

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
