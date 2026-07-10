/**
 * V-HUB design tokens.
 *
 * Single source of truth for color, spacing, radius, and typography values
 * used across every screen. Extracted from the Figma exports in
 * design-refs/ (see design-refs/README.md — that folder is a temporary
 * build reference and will be deleted once all UI is complete; this file
 * is what survives).
 *
 * Plain TS object export — no theming library.
 */

export const colors = {
  // Primary coral/salmon accent — primary CTAs/links on light screens,
  // and the icon/logo color on the dark splash.
  primary: '#FF6B6B',

  // Near-black navy used for solid "Login" / "Register" / "Continue"
  // buttons and dark text on light screens (not pure black).
  primaryDark: '#12172B',
  navy: '#12172B',

  // Light screen background.
  background: '#FFFFFF',

  // Light gray input field / surface fill (fully rounded pill fields).
  surface: '#F3F4F6',
  inputBg: '#F3F4F6',

  // Text.
  textPrimary: '#111827', // headings, near-black
  textSecondary: '#6B7280', // body / placeholder text, mid gray

  // Hairline borders/dividers on light surfaces.
  border: '#E5E7EB',

  // Status accents.
  success: '#22C55E', // verified / ID-check green
  warning: '#F59E0B', // "locked until verified" amber banner
  danger: '#EF4444', // destructive actions / error states

  // Dark hero/splash surfaces (onboarding carousel, splash screen).
  heroBackground: '#0B0B0F',
  // Dark scrim used over hero photography for text legibility.
  overlay: 'rgba(11, 11, 15, 0.55)',

  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

/**
 * Inter weight names as registered with expo-font via
 * @expo-google-fonts/inter's useFonts() call in app/_layout.tsx.
 * Reference these string keys as `fontFamily` values in StyleSheets —
 * do not hardcode the literal strings elsewhere.
 */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const theme = {
  colors,
  spacing,
  radius,
  fontFamily,
} as const;

export default theme;
