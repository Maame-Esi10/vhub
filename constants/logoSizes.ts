/**
 * Responsive sizing for the single logo.png brand mark, used everywhere it
 * appears (splash, auth headers, in-app chrome). One source image, scaled
 * per placement so it reads correctly at each size across phone widths —
 * never stretched (callers must resize with resizeMode="contain" and equal
 * width/height so the aspect ratio stays locked).
 */
export type LogoVariant = 'hero' | 'medium' | 'small';

const WIDTH_RATIO: Record<LogoVariant, number> = {
  hero: 0.32, // splash screen — large, prominent, centered
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

// Responsive size for the "V-HUB" splash wordmark, which sits under the `hero`
// logo mark on the splash screen. Same clamp pattern as getLogoSize, sized in
// px so it stays legible on the smallest supported phone widths (~320-360dp)
// without relying solely on adjustsFontSizeToFit as a safety net.
const WORDMARK_WIDTH_RATIO = 0.11;
const WORDMARK_CLAMP: [min: number, max: number] = [26, 40];

/** Font size (px) for the splash wordmark at the current screen width. */
export function getSplashWordmarkFontSize(screenWidth: number): number {
  const [min, max] = WORDMARK_CLAMP;
  return Math.min(max, Math.max(min, screenWidth * WORDMARK_WIDTH_RATIO));
}
