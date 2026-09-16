/**
 * VHub design tokens.
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
  // Primary coral/salmon accent — primary CTAs/links on light screens.
  primary: '#FF6B6B',

  // The RED OF THE LOGO ITSELF, sampled from assets/logo.png (the mean of its
  // opaque pixels). It is NOT the coral above, and the difference matters in
  // exactly one place: the splash, where the "VHub" wordmark sits two
  // millimetres under the mark. Drawn in coral the two reds were near enough
  // to read as a printing error rather than as a palette. Use this only for
  // type that has to belong to the artwork; `primary` remains the interface
  // accent everywhere else.
  brandMark: '#FD1D26',

  // Near-black navy used for solid "Login" / "Register" / "Continue"
  // buttons and dark text on light screens (not pure black).
  primaryDark: '#12172B',
  navy: '#12172B',

  // Light screen background.
  background: '#FFFFFF',

  // Light gray input field / surface fill (fully rounded pill fields).
  surface: '#F3F4F6',
  inputBg: '#F3F4F6',

  // One step lighter than `surface`, from the same neutral ramp. For card
  // fills that want a tint without reading as an input field.
  surfaceSubtle: '#F9FAFB',

  // Text.
  textPrimary: '#111827', // headings, near-black
  textSecondary: '#6B7280', // body / placeholder text, mid gray

  // Hairline borders/dividers on light surfaces.
  border: '#E5E7EB',

  /*
    A border that is actually VISIBLE on a tinted card.

    WHY IT EXISTS (owner, 2026-09-16: the applicant and roster cards "look
    unfinished"). The roster card already had `borderWidth: 1` with `border`,
    and it read as though it had none -- because #E5E7EB sits on #F3F4F6, and
    those two are barely a shade apart. The border was being drawn and could
    not be seen.

    `border` is correct on a WHITE ground, which is most of the app, and it
    stays the default. This is for the case it cannot serve: an edge on a
    `surface` or `surfaceSubtle` fill, where the line has to be darker than the
    thing it is outlining rather than lighter than the page behind it.
  */
  borderOnSurface: '#D7DAE0',

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
