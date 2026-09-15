/**
 * Responsive sizing for the single logo.png brand mark, used everywhere it
 * appears (splash, auth headers, in-app chrome). One source image, scaled
 * per placement so it reads correctly at each size across phone widths —
 * never stretched (callers must resize with resizeMode="contain" and equal
 * width/height so the aspect ratio stays locked).
 */
export type LogoVariant = 'hero' | 'medium' | 'small';

const WIDTH_RATIO: Record<LogoVariant, number> = {
  /*
    THE SPLASH MARK, one size for BOTH splash variants (2026-09-15).

    There used to be a second, smaller `heroCompact` (0.22) for the full
    splash, on the reasoning -- recorded here at the time -- that at 0.32 the
    mark "dominated the screen and crowded the text block instead of
    introducing it".

    THAT WAS TRUE OF THE OLD COMPOSITION AND IS NOT TRUE OF THIS ONE, which is
    why the constant is gone rather than merely unused. The crowding came from
    a flex column with a similar gap between every element: at 0.32 the mark
    sat a few pixels above a wordmark it was three times the height of, and the
    text had nowhere to be. The splash is now a lockup (mark + wordmark, 4px
    apart) with a deliberate 36px boundary before the text block, so the mark
    is no longer adjacent to the thing it was out of proportion with.

    Two sizes also had a cost the note did not anticipate: the mark-only splash
    and the full splash showed the mark at different sizes in different places,
    so the app's two loading screens read as two screens from two different
    apps (owner, 2026-09-15). One constant is what makes them agree.

    0.32 rather than a compromise value, because the mark-only screen is the
    one the owner approved and nothing there should shrink. If the full splash
    reads as crowded on a small handset, this single number is the dial.
  */
  hero: 0.32,
  medium: 0.09, // auth headers (welcome, login, register)
  small: 0.055, // in-app top bar / nav header
};

const CLAMP: Record<LogoVariant, [min: number, max: number]> = {
  hero: [96, 160],
  medium: [32, 40],
  small: [20, 26],
};

/** Square size (px) for a given logo placement at the current screen width. */
export function getLogoSize(variant: LogoVariant, screenWidth: number): number {
  const [min, max] = CLAMP[variant];
  return Math.min(max, Math.max(min, screenWidth * WIDTH_RATIO[variant]));
}

// Responsive size for the "VHub" splash wordmark, which sits under the `hero`
// logo mark on the splash screen. Same clamp pattern as getLogoSize, sized in
// px so it stays legible on the smallest supported phone widths (~320-360dp)
// without relying solely on adjustsFontSizeToFit as a safety net.
//
// SIZED UP WHEN THE NAME CHANGED (2026-09-15). These numbers were set for
// "V-HUB": five glyphs, every one a capital, plus a hyphen, plus two points of
// tracking. "VHub" is four glyphs, two of them lowercase, with the tracking
// gone -- roughly a quarter narrower at the same point size. Left alone, the
// wordmark stopped filling the space under the mark and the lockup read as
// under-set rather than as a smaller word. The ratio and clamp are raised to
// restore the optical width the composition was drawn around, NOT to make the
// text bigger for its own sake.
const WORDMARK_WIDTH_RATIO = 0.128;
const WORDMARK_CLAMP: [min: number, max: number] = [30, 46];

/** Font size (px) for the splash wordmark at the current screen width. */
export function getSplashWordmarkFontSize(screenWidth: number): number {
  const [min, max] = WORDMARK_CLAMP;
  return Math.min(max, Math.max(min, screenWidth * WORDMARK_WIDTH_RATIO));
}
