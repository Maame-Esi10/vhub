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
