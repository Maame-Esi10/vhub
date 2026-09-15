import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '@/constants/theme';

/**
 * The splash's ground: a soft band of lift through the middle of the screen,
 * and a glow behind wherever the mark sits.
 *
 * WHY IT EXISTS (owner, 2026-09-15: "it currently looks plain... add
 * decoration where it is needed"). The splash was a flat near-black field with
 * four things stacked on it. Flat is not the same as minimal: with no depth
 * anywhere, the mark had nothing to sit ON and the screen read as unfinished
 * rather than as restrained.
 *
 * NO NEW DEPENDENCY. `react-native-svg` is already in the project, pulled in by
 * `react-native-qrcode-svg` for the check-in code, so real gradients were
 * already available. The alternative -- stacked translucent circles, the
 * technique the drawn illustrations use -- produces visible banding at this
 * size, because a 300px halo built from four discs has four edges in it.
 *
 * TWO LAYERS, EACH DOING ONE JOB:
 *
 * 1. A vertical gradient that lifts the middle of the screen slightly toward
 *    navy and returns to the near-black at both edges. It is deliberately
 *    barely perceptible as a gradient; what it does is stop the field reading
 *    as a single flat colour, which is what made the composition feel pasted on.
 *
 * 2. A radial glow centred on the mark, in the mark's OWN red rather than the
 *    coral interface accent -- the same distinction `colors.brandMark` exists
 *    for. It tops out at 22% opacity, so it is a suggestion of light rather
 *    than a coloured circle.
 *
 * Both are `pointerEvents="none"`: this is scenery, and the splash has one
 * interactive element on it (nothing) either way, but a full-screen SVG that
 * swallowed touches would be a trap for whatever gets added later.
 *
 * KNOWN AND ACCEPTED: the NATIVE splash (app.json) can only draw a flat colour,
 * so the glow appears at the handover from native to JS. It reads as the app
 * waking up rather than as a different screen, which a change of the whole
 * field would not.
 */
export interface SplashBackdropProps {
  /** Diameter of the glow. Sized by the caller from the mark. */
  glowSize: number;
  /**
   * Where the glow's centre sits, as a fraction of screen height. Must be the
   * mark's own centre, or the light comes from the wrong place.
   */
  glowCenterRatio: number;
}

export function SplashBackdrop({ glowSize, glowCenterRatio }: SplashBackdropProps) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="splashGround" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.heroBackground} stopOpacity="1" />
            <Stop offset="0.55" stopColor={colors.navy} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.heroBackground} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#splashGround)" />
      </Svg>

      <View
        style={[
          styles.glow,
          {
            width: glowSize,
            height: glowSize,
            marginLeft: -glowSize / 2,
            marginTop: -glowSize / 2,
            top: `${glowCenterRatio * 100}%`,
          },
        ]}
      >
        <Svg width={glowSize} height={glowSize}>
          <Defs>
            <RadialGradient id="splashGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.brandMark} stopOpacity="0.22" />
              <Stop offset="0.45" stopColor={colors.brandMark} stopOpacity="0.08" />
              <Stop offset="1" stopColor={colors.brandMark} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={glowSize} height={glowSize} fill="url(#splashGlow)" />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    left: '50%',
  },
});
