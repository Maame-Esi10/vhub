import { PixelRatio, useWindowDimensions } from 'react-native';

/**
 * How the app behaves when the phone is set to a large system font size.
 *
 * THE PROBLEM THIS SOLVES, WRITTEN OUT BECAUSE IT IS STRUCTURAL.
 *
 * Every `fontSize` in this app scales with the OS accessibility setting —
 * React Native's `allowFontScaling` defaults to true and we want it to. But
 * every OTHER number in a stylesheet is a fixed density-independent pixel:
 * `minWidth: 96`, `height: 64`, `maxWidth: '40%'`, `paddingHorizontal:
 * spacing.base`. So when the user turns their font up to 1.5x, the text needs
 * roughly half as much room again and the boxes holding it do not move at all.
 *
 * Everything the owner reported on 2026-09-11 is that one mismatch:
 *   - "Notificatio / ns" — a label squeezed narrower than its longest word, so
 *     Android broke inside the word. Nothing is wrong with the text; the
 *     column it was given is too narrow at that scale.
 *   - "30% Complet" with the "e" missing — two labels in a space-between row
 *     with no wrap allowance, clipped at the container edge.
 *   - Text escaping its container — a fixed-height box with text that now
 *     needs three lines instead of two.
 *
 * THE ANSWER IS TWO-PART, AND BOTH PARTS ARE NEEDED.
 *
 * 1. A CEILING ON SCALING (`MAX_FONT_SCALE`). Android lets the user go to 2.0x
 *    and beyond, and stacks a separate "display size" multiplier on top of it.
 *    No phone layout survives that intact, and an app that refuses to draw is
 *    less accessible than one that draws slightly smaller than asked. Every
 *    piece of text in the app honours the user's setting up to this ceiling and
 *    then stops growing. This is the same thing iOS apps do when they cap
 *    Dynamic Type.
 *
 * 2. LAYOUT THAT GROWS WITH THE TEXT (`scaleWithFont`). A ceiling alone still
 *    leaves a 96dp column holding 1.3x text. Anywhere a box's size is decided
 *    by the words inside it, that number is multiplied by the live font scale
 *    so the box grows with its contents.
 *
 * 1.3 is the ceiling because it is the largest multiplier at which the tightest
 * row in the app — SettingsRow, four items across a 360dp phone — still fits
 * its longest label without breaking a word.
 */
export const MAX_FONT_SCALE = 1.3;

/**
 * The user's system font scale, clamped to what the layouts can hold.
 *
 * Read through `PixelRatio.getFontScale()` rather than `useWindowDimensions()`
 * because it is the same number React Native itself multiplies `fontSize` by,
 * so a box sized with this cannot drift out of step with the text in it.
 */
export function clampedFontScale(): number {
  return Math.min(MAX_FONT_SCALE, Math.max(1, PixelRatio.getFontScale()));
}

/**
 * Grows a text-driven layout constant by the current font scale.
 *
 * Use it for any number that exists because of the words inside the box — a
 * `minWidth` sized to the longest label, a `minHeight` sized to two lines, the
 * width of a fixed value column. Do NOT use it for things that are not about
 * text: icon tiles, avatars, hairlines, page margins. Scaling those makes a
 * large-font layout emptier rather than more readable.
 */
export function scaleWithFont(value: number): number {
  return Math.round(value * clampedFontScale());
}

/**
 * True when the user has turned their font up far enough that side-by-side
 * layouts should become stacked ones.
 *
 * Some rows cannot be rescued by giving them more room, because there is no
 * more room: a label and its value on one line, on a 360dp phone, at 1.25x.
 * The honest fix there is to stop putting them on one line. This is the test
 * for that, kept in one place so every screen makes the same call at the same
 * point rather than each picking its own threshold.
 */
export function prefersStackedLayout(): boolean {
  return PixelRatio.getFontScale() >= 1.2;
}

/**
 * The font scale, as a value a component re-reads when it changes.
 *
 * `PixelRatio.getFontScale()` is a plain function call, so a component that
 * used it directly would keep whatever value it read on its first render.
 * Android delivers a font-size change as a configuration change, which is also
 * what `useWindowDimensions` subscribes to — so depending on it is what makes
 * a layout respond while the app is open rather than only after a restart.
 */
export function useFontScale(): { scale: number; stacked: boolean } {
  // The dimensions themselves are unused; the subscription is the point.
  useWindowDimensions();
  return { scale: clampedFontScale(), stacked: prefersStackedLayout() };
}
