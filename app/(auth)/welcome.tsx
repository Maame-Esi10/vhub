import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ImageSourcePropType,
  ListRenderItemInfo,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
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

type RegisterRole = 'volunteer' | 'organisation';

/** Auto-advance interval for the intro carousel; manual swipes reset this timer. */
const AUTOPLAY_INTERVAL_MS = 4000;

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const logoSize = getLogoSize('medium', width);
  const flatListRef = useRef<FlatList<Slide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Read inside the interval callback instead of `activeIndex` so the
  // effect below doesn't need to re-run (and reset the timer) every time
  // the slide changes.
  const activeIndexRef = useRef(0);
  const autoplayTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
    }, AUTOPLAY_INTERVAL_MS);
  }, [pauseAutoplay]);

  useEffect(() => {
    startAutoplay();
    return pauseAutoplay;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
      // A manual swipe just landed — restart the countdown so autoplay
      // doesn't fire again a moment later.
      startAutoplay();
    },
    [width, startAutoplay]
  );

  const handleSkip = useCallback(() => {
    const lastIndex = SLIDES.length - 1;
    flatListRef.current?.scrollToIndex({ index: lastIndex, animated: true });
    activeIndexRef.current = lastIndex;
    setActiveIndex(lastIndex);
    startAutoplay();
  }, [startAutoplay]);

  const goToRegister = useCallback(
    (role: RegisterRole) => {
      router.push({ pathname: '/(auth)/register', params: { role } });
    },
    [router]
  );

  const keyExtractor = useCallback((item: Slide) => item.key, []);

  const getItemLayout = useCallback(
    (_: ArrayLike<Slide> | null | undefined, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Slide>) => (
      <View style={[styles.slide, { width }]}>
        <Image source={SLIDE_IMAGES[item.key]} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFill, styles.slideOverlay]} />

        <View style={[styles.content, { paddingTop: insets.top + spacing.base }]}>
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <Image
                source={require('../../assets/logo.png')}
                style={{ width: logoSize, height: logoSize }}
                resizeMode="contain"
              />
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

          <View style={styles.textBlock}>
            <Text style={styles.headline}>{item.headline}</Text>
            <Text style={styles.subtext}>{item.subtext}</Text>
          </View>

          <View style={[styles.ctaBlock, { paddingBottom: insets.bottom + spacing.lg }]}>
            <PagerDots count={SLIDES.length} activeIndex={activeIndex} />

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
      </View>
    ),
    [activeIndex, handleSkip, goToRegister, insets.top, insets.bottom, width, logoSize]
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={pauseAutoplay}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        getItemLayout={getItemLayout}
        style={styles.list}
      />
    </View>
  );
}

interface PagerDotsProps {
  count: number;
  activeIndex: number;
}

function PagerDots({ count, activeIndex }: PagerDotsProps) {
  return (
    <View style={styles.pagerRow} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={[styles.dot, index === activeIndex && styles.dotActive]} />
      ))}
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
    flex: 1,
    backgroundColor: colors.heroBackground,
  },
  slideOverlay: {
    backgroundColor: colors.overlay,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  topBar: {
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
  textBlock: {
    marginTop: spacing.xxl,
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
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    opacity: 0.5,
  },
  dotActive: {
    width: 20,
    opacity: 1,
  },
  ctaBlock: {
    gap: spacing.sm,
  },
  primaryCta: {
    marginBottom: spacing.xs,
  },
  postOutreachLabel: {
    letterSpacing: 1,
  },
});
