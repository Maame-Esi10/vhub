import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { getLogoSize } from '@/constants/logoSizes';

interface Slide {
  key: string;
  headline: string;
  subtext: string;
}

// Slide order below matches the active-dot position seen in the Figma
// exports (design-refs/Onboarding-2.png -> Onboarding-1.png -> Onboarding.png),
// which is the definitive sequence signal (filename suffixes are not in order).
const SLIDES: Slide[] = [
  {
    key: 'onboarding-1',
    headline: 'Lend a Hand, Lift a Heart',
    subtext: "Step into a community that brings care and support where it's needed most",
  },
  {
    key: 'onboarding-2',
    headline: 'Healing begins with a hand held.',
    subtext: "Join a community of hearts dedicated to bringing care where it's needed most.",
  },
  {
    key: 'onboarding-3',
    headline: 'Every Touch Matters',
    subtext: 'Join others in spreading kindness and making a real difference in people’s lives',
  },
];

// Each key must have a matching file at assets/images/onboarding-{1,2,3}.png
// (see docs/REPORT_NOTES.md / project owner instructions) — require() paths
// are static, so the app will fail to bundle until all three exist.
const SLIDE_IMAGES: Record<string, ImageSourcePropType> = {
  'onboarding-1': require('../../assets/images/onboarding-1.png'),
  'onboarding-2': require('../../assets/images/onboarding-2.png'),
  'onboarding-3': require('../../assets/images/onboarding-3.png'),
};

const LOGO = require('../../assets/logo.png');

type RegisterRole = 'volunteer' | 'organisation';

/** Auto-advance interval for the intro carousel; manual swipes reset this timer. */
const AUTOPLAY_INTERVAL_MS = 4000;

/**
 * Longest we will hold the carousel back waiting for image prefetch. Prefetch
 * is a nice-to-have, never a gate: on a slow or unreachable Metro connection
 * this must still show the carousel rather than sit on a dark screen forever.
 */
const PREFETCH_TIMEOUT_MS = 1500;

/**
 * Warms the image cache for all three slides before the carousel renders.
 *
 * These are `require()`d assets, which behave very differently by build:
 * in a production bundle they resolve to a local file and decode almost
 * instantly, but under Metro (which is how this is developed and tested, via
 * `npx expo start --dev-client`) they resolve to an http:// URL on the dev
 * server and are fetched over the network per slide — which is what produced
 * the dark flash before each image appeared.
 *
 * Failures are swallowed deliberately: a prefetch miss just means the image
 * loads at its normal speed, which is strictly no worse than not prefetching.
 */
function usePrefetchedSlides(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const uris = Object.values(SLIDE_IMAGES)
      .map((source) => Image.resolveAssetSource(source)?.uri)
      .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);

    const finish = () => {
      if (!cancelled) setReady(true);
    };

    if (uris.length === 0) {
      finish();
      return;
    }

    const timeout = setTimeout(finish, PREFETCH_TIMEOUT_MS);
    Promise.all(uris.map((uri) => Image.prefetch(uri).catch(() => false))).then(finish, finish);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  return ready;
}

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const logoSize = getLogoSize('medium', width);

  const imagesReady = usePrefetchedSlides();

  // Measured once each. The chrome used to sit inside every slide in a
  // `space-between` column, which is what positioned the headline in the
  // leftover space between them. Now that the chrome is a shared overlay, the
  // slide has to reserve that same space itself or the text would drift to
  // the true centre of the screen. These settle on the first layout pass and
  // never change again, so they cost one re-render, not one per scroll.
  const [topBarHeight, setTopBarHeight] = useState(0);
  const [ctaHeight, setCtaHeight] = useState(0);

  const scrollRef = useRef<ScrollView>(null);
  // Drives the pager dots. Kept as an Animated.Value on the native thread so
  // the dots track the swipe continuously without a single JS re-render --
  // the previous version held the active index in React state, so every slide
  // change re-rendered all three full-screen slides mid-animation, which is
  // what made both swiping and auto-advance stutter.
  const scrollX = useRef(new Animated.Value(0)).current;
  const activeIndexRef = useRef(0);
  const autoplayTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** True between onScrollBeginDrag and onMomentumScrollEnd — i.e. this scroll came from a finger, not from autoplay. */
  const userDraggingRef = useRef(false);

  const pauseAutoplay = useCallback(() => {
    if (autoplayTimer.current) {
      clearInterval(autoplayTimer.current);
      autoplayTimer.current = null;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    pauseAutoplay();
    autoplayTimer.current = setInterval(() => {
      const nextIndex = (activeIndexRef.current + 1) % SLIDES.length;
      activeIndexRef.current = nextIndex;
      scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
    }, AUTOPLAY_INTERVAL_MS);
  }, [pauseAutoplay, width]);

  // Autoplay only starts once the images are actually in cache. Starting it
  // during prefetch would burn the first slide's screen time on a blank frame.
  useEffect(() => {
    if (!imagesReady) return;
    startAutoplay();
    return pauseAutoplay;
  }, [imagesReady, startAutoplay, pauseAutoplay]);

  const handleScrollBeginDrag = useCallback(() => {
    userDraggingRef.current = true;
    pauseAutoplay();
  }, [pauseAutoplay]);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      activeIndexRef.current = Math.round(event.nativeEvent.contentOffset.x / width);
      // Only a real swipe restarts the countdown. Restarting it after an
      // autoplay-driven scroll too would add the animation's duration to
      // every interval, so the carousel drifted slower and slower.
      if (userDraggingRef.current) {
        userDraggingRef.current = false;
        startAutoplay();
      }
    },
    [width, startAutoplay]
  );

  const handleSkip = useCallback(() => {
    const lastIndex = SLIDES.length - 1;
    activeIndexRef.current = lastIndex;
    scrollRef.current?.scrollTo({ x: lastIndex * width, animated: true });
    startAutoplay();
  }, [startAutoplay, width]);

  const goToRegister = useCallback(
    (role: RegisterRole) => {
      router.push({ pathname: '/(auth)/register', params: { role } });
    },
    [router]
  );

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
      }),
    [scrollX]
  );

  if (!imagesReady) {
    // Same background and brand mark as the carousel itself, so this reads as
    // the splash still settling rather than as a separate loading screen.
    return (
      <View style={[styles.container, styles.preloadCenter]}>
        <StatusBar style="light" />
        <Image source={LOGO} style={{ width: logoSize, height: logoSize }} resizeMode="contain" />
        <Text style={styles.wordmark}>V-HUB</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/*
        A plain ScrollView, not a FlatList. There are exactly three
        full-screen slides, so virtualisation buys nothing and actively hurts:
        FlatList mounts cells lazily, so slide 3's <Image> did not exist until
        the user had nearly swiped to it, and it then loaded from scratch --
        the second half of the dark-flash bug. All three are mounted here from
        the first frame.
      */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={styles.list}
      >
        {SLIDES.map((slide) => (
          <View key={slide.key} style={[styles.slide, { width }]}>
            <Image
              source={SLIDE_IMAGES[slide.key]}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              // Android fades every image in over 300ms by default, which
              // reads as "dark, then picture" on a full-bleed hero even once
              // the bytes are already cached.
              fadeDuration={0}
            />
            <View style={[StyleSheet.absoluteFill, styles.slideOverlay]} />

            <View
              style={[
                styles.slideText,
                {
                  paddingTop: insets.top + spacing.base + topBarHeight + spacing.xxl,
                  paddingBottom: ctaHeight,
                },
              ]}
            >
              <Text style={styles.headline}>{slide.headline}</Text>
              <Text style={styles.subtext}>{slide.subtext}</Text>
            </View>
          </View>
        ))}
      </Animated.ScrollView>

      {/*
        Top bar and CTAs are identical on every slide, so they live here as one
        overlay instead of being rebuilt inside each of the three slides. That
        is what lets the slide contents stay completely static while scrolling.
      */}
      <View
        style={[styles.topBar, { top: insets.top + spacing.base }]}
        pointerEvents="box-none"
        onLayout={(event) => setTopBarHeight(event.nativeEvent.layout.height)}
      >
        <View style={styles.brand}>
          <Image source={LOGO} style={{ width: logoSize, height: logoSize }} resizeMode="contain" />
          <Text style={styles.wordmark}>V-HUB</Text>
        </View>
        <Pressable
          onPress={handleSkip}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Skip to last slide"
        >
          <Text style={styles.skipText}>SKIP</Text>
        </Pressable>
      </View>

      <View
        style={[styles.ctaBlock, { paddingBottom: insets.bottom + spacing.lg }]}
        pointerEvents="box-none"
        onLayout={(event) => setCtaHeight(event.nativeEvent.layout.height)}
      >
        <PagerDots count={SLIDES.length} scrollX={scrollX} width={width} />

        <Button
          title="BECOME A VOLUNTEER"
          variant="outline"
          inverted
          onPress={() => goToRegister('volunteer')}
          accessibilityLabel="Become a volunteer"
          style={styles.primaryCta}
        />
        <Button
          title="POST AN OUTREACH"
          variant="text"
          inverted
          onPress={() => goToRegister('organisation')}
          accessibilityLabel="Post an outreach"
          textStyle={styles.postOutreachLabel}
        />
      </View>
    </View>
  );
}

interface PagerDotsProps {
  count: number;
  scrollX: Animated.Value;
  width: number;
}

/**
 * Dots interpolated straight off the scroll position, so the active pill
 * grows and shrinks continuously as the slide moves rather than snapping
 * when the momentum ends.
 *
 * The pill widens via `scaleX` rather than an animated `width`: the native
 * driver only supports transform and opacity, and dropping to the JS driver
 * here would put the dots back on the same thread as everything else — the
 * exact coupling this rewrite removes. A side benefit is that the dots keep
 * fixed layout slots, so the row doesn't shuffle sideways as it animates.
 */
function PagerDots({ count, scrollX, width }: PagerDotsProps) {
  return (
    <View style={styles.pagerRow} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }).map((_, index) => {
        const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
        return (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              {
                opacity: scrollX.interpolate({
                  inputRange,
                  outputRange: [0.5, 1, 0.5],
                  extrapolate: 'clamp',
                }),
                transform: [
                  {
                    scaleX: scrollX.interpolate({
                      inputRange,
                      outputRange: [0.3, 1, 0.3],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.heroBackground,
  },
  preloadCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  list: {
    flex: 1,
  },
  slide: {
    flex: 1,
    backgroundColor: colors.heroBackground,
  },
  slideOverlay: {
    backgroundColor: colors.overlay,
  },
  slideText: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  topBar: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  wordmark: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    letterSpacing: 2,
    color: colors.white,
  },
  skipText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.white,
  },
  headline: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: 'bold',
    fontSize: 32,
    lineHeight: 38,
    color: colors.white,
    marginBottom: spacing.base,
  },
  subtext: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.white,
    opacity: 0.9,
  },
  pagerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  dot: {
    width: 20,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  ctaBlock: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: 0,
    gap: spacing.sm,
  },
  primaryCta: {
    marginBottom: spacing.xs,
  },
  postOutreachLabel: {
    letterSpacing: 1,
  },
});
