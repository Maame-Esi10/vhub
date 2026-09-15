import { useState, type ReactNode } from 'react';
import { Animated, Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';

export interface FlyerBackgroundProps {
  /** Cloudinary URL of the outreach flyer, or null/undefined when none was uploaded. */
  uri: string | null | undefined;
  /** Container style — the CALLER owns height, radius and padding. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * The flyer as a card/hero background, with the existing navy band as the
 * fallback.
 *
 * Three problems this solves, all of which have bitten this project before:
 *
 * 1. **Varied dimensions.** Organisations upload whatever they have — portrait
 *    posters, wide banners, phone photos. `resizeMode="cover"` on a container
 *    whose height the CALLER fixes scales the image to fill and crops the
 *    overflow centrally, so nothing is ever squashed to fit. The carousel's
 *    bad crops came from letting the image dictate the box; here the box is
 *    fixed and the image adapts to it.
 *
 * 2. **Flashing and jumping.** The container is navy from first paint and never
 *    changes size, because its height comes from the caller's style rather than
 *    from the image. The image fades in over the navy once decoded. There is no
 *    white flash, no reflow, and a card with a flyer occupies exactly the same
 *    space as one without — so a list does not jump as images arrive.
 *
 * 3. **Unreadable text over an unknown photo.** White text on an arbitrary
 *    upload is a gamble. A navy scrim at partial opacity sits between the image
 *    and the content, so the existing white type keeps its contrast on a dark
 *    photo and on a bright one alike. The scrim is the existing navy token at
 *    reduced opacity, not a new colour.
 *
 * A failed load (dead URL, deleted asset) simply leaves the navy band: onError
 * holds the fade at zero, so a broken image degrades to exactly the design that
 * shipped before flyers existed.
 */
export function FlyerBackground({ uri, style, children }: FlyerBackgroundProps) {
  // Lazy `useState` rather than `useRef(...).current`: same single
  // construction and same stable instance, without reading a ref during render.
  const [fade] = useState(() => new Animated.Value(0));
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;

  return (
    <View style={[styles.container, style]}>
      {showImage ? (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onLoad={() =>
                Animated.timing(fade, {
                  toValue: 1,
                  duration: 220,
                  useNativeDriver: true,
                }).start()
              }
              onError={() => setFailed(true)}
              accessible={false}
            />
            <View style={styles.scrim} />
          </Animated.View>
        </>
      ) : (
        /*
          THE NO-FLYER STATE IS DESIGNED, NOT BLANK.

          It was a flat navy rectangle. On a feed card that reads as a plain
          band, but on the Manage event hero it is a large empty box holding a
          status pill and a title, and it looked unfinished rather than
          deliberate — reported from a device.

          What is drawn: two soft off-edge discs and the app's own heart-pulse
          motif, all at low opacity in existing tokens. The motif is the mark
          the app already uses for an outreach, so an event with no flyer reads
          as a VHub event rather than as a missing image. Nothing here is a new
          colour, and nothing is a placeholder icon of the "image not found"
          kind, which would tell an organisation something is wrong when
          nothing is.

          Deliberately behind `content` and non-interactive, and deliberately
          absent whenever there IS a flyer: this must never dirty a real image.
        */
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.glowWarm} />
          <View style={styles.glowCool} />
          <MaterialCommunityIcons
            name="heart-pulse"
            size={132}
            color={colors.primary}
            style={styles.motif}
          />
        </View>
      )}

      {/* Content sits above both the image and the scrim. */}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.navy,
    overflow: 'hidden',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.navy,
    // Enough to hold white type legible over a bright photo, light enough that
    // the flyer is still clearly the flyer.
    opacity: 0.55,
  },
  /*
    The empty-state decoration. Every value here is deliberately low: the band
    carries white type at every size it is used, and the point is to give the
    navy some structure, not to compete with the title sitting on it.

    The discs run off the edges so they read as part of a larger shape rather
    than as two circles someone placed. `overflow: 'hidden'` on the container
    does the cropping.
  */
  glowWarm: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    right: -76,
    top: -104,
    backgroundColor: 'rgba(255, 107, 107, 0.13)',
  },
  glowCool: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    left: -66,
    bottom: -78,
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
  },
  motif: {
    position: 'absolute',
    right: 10,
    bottom: -26,
    opacity: 0.15,
    transform: [{ rotate: '-8deg' }],
  },
  content: {
    position: 'relative',
  },
});
