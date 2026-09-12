import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, SplashView } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { getLogoSize } from '@/constants/logoSizes';
import { useSignOut } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';

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

// Each key must have a matching file under assets/images/ — require() paths
// are static, so the app will fail to bundle until all three exist.
//
// ALL THREE ARE JPEG, AND THAT IS PART OF THE SMOOTHNESS FIX, NOT HOUSEKEEPING.
// Slides 1 and 2 were photographs saved as PNG, 2.3MB and 2.2MB. PNG is
// lossless and has no flat colour to exploit in a photograph, so it was storing
// camera noise byte for byte. Under Metro these are fetched from the dev server
// over the network before the carousel is allowed to appear, and 4.5MB does not
// arrive inside PREFETCH_TIMEOUT_MS on a phone-to-laptop connection — so the
// carousel was released while its own images were still downloading. The three
// together are now ~530KB.
const SLIDE_IMAGES: Record<string, ImageSourcePropType> = {
  'onboarding-1': require('../../assets/images/onboarding-1.jpg'),
  'onboarding-2': require('../../assets/images/onboarding-2.jpg'),
  'onboarding-3': require('../../assets/images/onboarding-3.jpg'),
};

const LOGO = require('../../assets/logo.png');

type RegisterRole = 'volunteer' | 'organisation';

/** Auto-advance interval for the intro carousel; manual swipes reset this timer. */
const AUTOPLAY_INTERVAL_MS = 4000;

/**
 * How long one slide takes to travel one screen width under its own steam.
 *
 * THIS NUMBER ONLY EXISTS BECAUSE WE STOPPED USING scrollTo({ animated: true }).
 * That built-in call takes no duration and no easing — it is roughly 250ms on
 * Android and 300ms on iOS, fixed, with the platform's own interpolator. A
 * quarter of a second to move a full-screen photograph is abrupt however
 * smoothly it is drawn: a finger swipe feels like a glide because the finger
 * controls it, and nothing about a 250ms machine-driven jump reads the same
 * way. There is no prop that slows it down, which is why this is now driven by
 * an Animated.timing whose offset we push into the scroll view frame by frame.
 */
const SLIDE_GLIDE_MS = 650;

/**
 * Ceiling on how much longer a multi-slide move may take than a single-slide
 * one. SKIP travels two widths; without a cap it would either take twice as
 * long (sluggish for a control whose whole point is "get me out of here") or,
 * at a fixed duration, move at double speed — which is the bug being fixed.
 */
const MAX_GLIDE_STRETCH = 1.6;

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
  // Lazy `useState` rather than `useRef(...).current`: same single
  // construction and same stable instance, without reading a ref during render.
  const [scrollX] = useState(() => new Animated.Value(0));
  const activeIndexRef = useRef(0);
  const autoplayTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** True between onScrollBeginDrag and the end of that gesture — i.e. this scroll came from a finger, not from autoplay. */
  const userDraggingRef = useRef(false);

  /**
   * The offset we are driving the scroll view to, and the animation driving it.
   *
   * A SECOND Animated.Value, deliberately not `scrollX`. `scrollX` is attached
   * to the scroll view's own onScroll event through the native driver, so it is
   * written by the native side every frame; animating it from JS at the same
   * time would have two writers fighting over one value. This one is purely an
   * output — JS drives it, its listener pushes the number into the scroll view,
   * and `scrollX` then reports back what actually happened. The dots therefore
   * still track the real offset and stay on the native thread exactly as before.
   */
  const [glideX] = useState(() => new Animated.Value(0));
  const glideAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const id = glideX.addListener(({ value }) => {
      // `animated: false` — the easing IS the animation; asking the platform to
      // animate to each intermediate point as well would fight this one.
      scrollRef.current?.scrollTo({ x: value, animated: false });
    });
    return () => glideX.removeListener(id);
  }, [glideX]);

  /** Abandon any glide in progress. A finger on the screen always wins. */
  const stopGlide = useCallback(() => {
    glideAnim.current?.stop();
    glideAnim.current = null;
  }, []);

  /**
   * Move to `index` over a duration proportional to how far it actually is,
   * so every transition travels at roughly the same speed on screen.
   *
   * A FIXED DURATION WAS THE BUG. The old autoplay wrapped from the last slide
   * to the first with `(i + 1) % length`, which is a two-screen journey given
   * the same ~250ms as a one-screen one — double speed, slide 2 flashing past,
   * reading as a snap back to the start. It happened every twelve seconds.
   */
  const glideTo = useCallback(
    (index: number) => {
      if (width <= 0) return;
      stopGlide();

      // Start from where the carousel ACTUALLY is, not from wherever the last
      // glide finished. A paging scroll view always comes to rest on a page
      // boundary, and handleMomentumScrollEnd writes the page a swipe landed
      // on, so this is the true current offset. Without it, a swipe followed by
      // an auto-advance would jump back to the old position and set off again.
      const from = activeIndexRef.current * width;
      glideX.setValue(from);

      const target = index * width;
      const distance = Math.abs(target - from);
      activeIndexRef.current = index;

      const stretch = Math.min(MAX_GLIDE_STRETCH, Math.max(1, distance / width));
      const animation = Animated.timing(glideX, {
        toValue: target,
        duration: SLIDE_GLIDE_MS * stretch,
        easing: Easing.inOut(Easing.cubic),
        // Cannot be native: the native driver only writes style props, and this
        // value is not a style — its listener calls scrollTo(). A native-driven
        // value does not fire JS listeners at all, so the carousel would sit
        // still. The slides are completely static and nothing re-renders during
        // the move, so the JS thread has only this one call per frame to make.
        useNativeDriver: false,
      });
      glideAnim.current = animation;
      animation.start(() => {
        glideAnim.current = null;
      });
    },
    [glideX, stopGlide, width]
  );

  /**
   * Direction of travel for autoplay: +1 forward, -1 back.
   *
   * The carousel now REVERSES at each end (1, 2, 3, 2, 1, 2, ...) instead of
   * rewinding to the start. Every move is then exactly one slide wide, which is
   * what makes a constant, readable speed possible at all. The alternative —
   * a true infinite loop — means cloning the first and last slides and silently
   * teleporting the offset when they come into view, which is a lot of
   * machinery and one more thing to get wrong, for three slides that the user
   * sees once.
   */
  const directionRef = useRef(1);

  const pauseAutoplay = useCallback(() => {
    if (autoplayTimer.current) {
      clearInterval(autoplayTimer.current);
      autoplayTimer.current = null;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    pauseAutoplay();
    autoplayTimer.current = setInterval(() => {
      let next = activeIndexRef.current + directionRef.current;
      if (next >= SLIDES.length || next < 0) {
        directionRef.current *= -1;
        next = activeIndexRef.current + directionRef.current;
      }
      glideTo(next);
    }, AUTOPLAY_INTERVAL_MS);
  }, [pauseAutoplay, glideTo]);

  // Autoplay only starts once the images are actually in cache. Starting it
  // during prefetch would burn the first slide's screen time on a blank frame.
  useEffect(() => {
    if (!imagesReady) return;
    startAutoplay();
    return pauseAutoplay;
  }, [imagesReady, startAutoplay, pauseAutoplay]);

  const handleScrollBeginDrag = useCallback(() => {
    userDraggingRef.current = true;
    stopGlide();
    pauseAutoplay();
  }, [pauseAutoplay, stopGlide]);

  /** Where the swipe left us, and whose turn it is to move next. */
  const settleAt = useCallback(
    (offsetX: number) => {
      if (width <= 0) return;
      const index = Math.round(offsetX / width);
      activeIndexRef.current = index;
      // Carry on AWAY from whichever end the user landed on, rather than
      // marching them straight back into the wall they just swiped up against.
      if (index >= SLIDES.length - 1) directionRef.current = -1;
      else if (index <= 0) directionRef.current = 1;
    },
    [width]
  );

  /**
   * A drag that ends without a fling.
   *
   * THIS HANDLER IS THE SECOND HALF OF A REAL BUG. Autoplay was paused on drag
   * begin and restarted ONLY by onMomentumScrollEnd — and a slow drag released
   * with no velocity does not always produce a momentum phase. When it did not,
   * autoplay was paused for good and the carousel simply stopped for the rest
   * of the session, with nothing to suggest why. Restarting here too costs
   * nothing when momentum does follow: startAutoplay clears the old timer
   * first, and onMomentumScrollEnd then corrects the index a moment later.
   */
  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      settleAt(event.nativeEvent.contentOffset.x);
      userDraggingRef.current = false;
      startAutoplay();
    },
    [settleAt, startAutoplay]
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      settleAt(event.nativeEvent.contentOffset.x);
      // Only a real swipe restarts the countdown. Restarting it after an
      // autoplay-driven scroll too would add the animation's duration to
      // every interval, so the carousel drifted slower and slower.
      if (userDraggingRef.current) {
        userDraggingRef.current = false;
        startAutoplay();
      }
    },
    [settleAt, startAutoplay]
  );

  const handleSkip = useCallback(() => {
    const lastIndex = SLIDES.length - 1;
    // Two slides in one move, so glideTo stretches the duration rather than
    // doubling the speed. Arriving at the end, the only way on is back.
    directionRef.current = -1;
    glideTo(lastIndex);
    startAutoplay();
  }, [glideTo, startAutoplay]);

  const goToRegister = useCallback(
    (role: RegisterRole) => {
      router.push({ pathname: '/(auth)/register', params: { role } });
    },
    [router]
  );

  /**
   * A volunteer who signed up but never finished the wizard (category still
   * null) lands back here on every launch. Offering them the two role buttons
   * would be nonsense — they already have an account and a role — so this
   * screen swaps in a resume action for that state. Pushing (not replacing)
   * is what leaves welcome underneath the wizard, so its back button has
   * somewhere to go.
   */
  const signedIn = useAuthStore((state) => !!state.user);
  const resumingOnboarding = useAuthStore(
    (state) =>
      !!state.user && state.profile?.role === 'volunteer' && state.volunteerProfile?.category == null
  );
  const { signOut, signingOut } = useSignOut();

  const continueOnboarding = useCallback(() => {
    router.push('/(auth)/onboarding');
  }, [router]);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
      }),
    [scrollX]
  );

  if (!imagesReady) {
    /*
      The SAME splash the root layout shows, not a second one of its own.

      This used to draw its own logo + wordmark screen, which meant the app put
      up two differently composed branded screens back to back — the wordmark
      splash while fonts and the session resolved, then this one while the
      carousel prefetched. Rendering the one component means the splash simply
      stays up until the carousel is genuinely ready, which is how it always
      read in the comment here and never did on a device.
    */
    return (
      <>
        <StatusBar style="light" />
        {/*
          The SAME variant the root layout just showed, so the handover from
          one to the other is invisible. Signed out, the root splash is the
          full introduction and this continues it; signed in — a volunteer who
          never finished the wizard lands here on every launch — the root
          splash was the mark alone and so is this. Getting this wrong would
          reintroduce the two-splashes-in-a-row stutter from the other side.
        */}
        <SplashView variant={signedIn ? 'mark' : 'full'} />
      </>
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
        onScrollEndDrag={handleScrollEndDrag}
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

        {resumingOnboarding ? (
          <>
            <Button
              title="FINISH SETTING UP"
              variant="outline"
              inverted
              onPress={continueOnboarding}
              accessibilityLabel="Finish setting up your volunteer profile"
              style={styles.primaryCta}
            />
            <Button
              title={signingOut ? 'SIGNING OUT...' : 'NOT YOU? SIGN OUT'}
              variant="text"
              inverted
              disabled={signingOut}
              onPress={signOut}
              accessibilityLabel="Sign out"
              textStyle={styles.postOutreachLabel}
            />
          </>
        ) : (
          <>
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
          </>
        )}
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
  list: {
    flex: 1,
  },
  slide: {
    // No `flex: 1` here. A slide's width is set inline from the window width,
    // and `flex: 1` also sets flexBasis to 0 on the main axis — which inside a
    // horizontal scroll view IS the width. Two rules arguing over the size of a
    // paging slide is exactly the kind of ambiguity that lands a page boundary
    // a pixel or two off; the explicit width is the one that should win.
    height: '100%',
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
