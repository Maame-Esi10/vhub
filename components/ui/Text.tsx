import { forwardRef } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextInput } from 'react-native';
import { MAX_FONT_SCALE } from '@/constants/typography';

export type TextProps = RNTextProps;

/**
 * THE app's text primitive. Every screen imports `Text` from here, never from
 * `react-native` directly.
 *
 * It exists for two reasons, both of which have to be true of every single
 * piece of text in the app or they are not true at all — which is why this is
 * a primitive and not a style anyone can forget to apply.
 *
 * 1. A WORD IS NEVER SPLIT ACROSS LINES. (Owner's standing rule, 2026-09-11,
 *    after "Notifications" rendered as "Notificatio / ns" on Settings at a
 *    large system font size.)
 *
 *    Android's default line breaker is `highQuality`, which is allowed to
 *    break inside a word when doing so gives a tidier right edge. `simple` is
 *    the greedy breaker: it breaks at spaces and leaves words alone.
 *    `android_hyphenationFrequency: 'none'` stops the other route to the same
 *    result. Neither is a complete guarantee on its own — a container narrower
 *    than a single word will still be broken by Android as a last resort — so
 *    the other half of the rule is layout: see `scaleWithFont` in
 *    constants/typography.ts, and the minimum widths it feeds.
 *
 * 2. FONT SCALING IS HONOURED, AND CAPPED. `allowFontScaling` stays on, so the
 *    user's accessibility setting is respected; `maxFontSizeMultiplier` stops
 *    it past the point where the layouts can hold it. See MAX_FONT_SCALE for
 *    why a ceiling is the accessible answer rather than a compromise on it.
 *
 * Both are defaults, not impositions: pass either prop explicitly and the
 * caller wins. `SplashView`'s wordmark, for instance, does not scale at all,
 * because it is a logotype rather than text to be read.
 */
export const Text = forwardRef<TextInput, TextProps>(function Text(props, ref) {
  return (
    <RNText
      textBreakStrategy="simple"
      android_hyphenationFrequency="none"
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      {...props}
      ref={ref}
    />
  );
});
