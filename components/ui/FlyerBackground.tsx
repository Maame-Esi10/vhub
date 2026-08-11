import { useRef, useState, type ReactNode } from 'react';
import { Animated, Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
  const fade = useRef(new Animated.Value(0)).current;
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
      ) : null}

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
  content: {
    position: 'relative',
  },
});
