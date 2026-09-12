import { ActivityIndicator, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { getLogoSize, getSplashWordmarkFontSize } from '@/constants/logoSizes';

const LOGO = require('../../assets/logo.png');

export type SplashVariant = 'full' | 'mark';

export interface SplashViewProps {
  /** Hide the spinner row when the screen is not actually waiting on anything. */
  showLoading?: boolean;
  /**
   * `full` introduces the app; `mark` is the logo alone on the dark ground.
   *
   * WHICH ONE, AND WHY IT DEPENDS ON WHO IS OPENING THE APP (owner, 2026-09-11).
   * The fuller screen is an introduction — it names the product and says what
   * it is for. That is worth a returning volunteer's time exactly once. Every
   * launch after that it is a wall of text between them and the app they
   * already know, so a signed-in user gets the mark alone: no wordmark, no
   * tagline, no spinner.
   *
   * The mark variant is also pixel-for-pixel what the native splash draws (the
   * same file, the same near-black ground), so for a returning user the two
   * screens are indistinguishable and the whole launch reads as one still
   * image that ends when the app is ready.
   */
  variant?: SplashVariant;
}

/**
 * THE splash screen. One component, one design, every place the app is still
 * getting ready.
 *
 * There used to be two in a row: this one (wordmark only) while fonts and the
 * session resolved, and then a second, differently composed one on the welcome
 * screen (logo + wordmark, no tagline) while the carousel images prefetched.
 * Two branded loading screens back to back read as a stutter, not as a brand.
 * The logo now lives here — where the owner wanted it — and welcome renders
 * this same component, so the app shows one continuous splash that simply ends
 * when the carousel is ready.
 *
 * Everything except the mark is coded UI, so it stays crisp at any resolution.
 */
export function SplashView({ showLoading = true, variant = 'full' }: SplashViewProps) {
  const { width } = useWindowDimensions();
  // Two sizes, because the mark has two jobs. Alone on the dark ground it is
  // the whole screen; above the wordmark and the subtitle it is the top of a
  // lockup and has to leave them room. See constants/logoSizes.ts.
  const logoSize = getLogoSize(variant === 'mark' ? 'hero' : 'heroCompact', width);
  const wordmarkFontSize = getSplashWordmarkFontSize(width);

  if (variant === 'mark') {
    return (
      <View style={styles.splash}>
        <Image
          source={LOGO}
          style={{ width: logoSize, height: logoSize }}
          resizeMode="contain"
          accessible={false}
        />
      </View>
    );
  }

  return (
    <View style={styles.splash}>
      <View style={styles.content}>
        <Image
          source={LOGO}
          style={{ width: logoSize, height: logoSize }}
          resizeMode="contain"
          accessible={false}
        />
        {/*
          THE WORDMARK IS A LOGOTYPE, NOT TEXT TO BE READ, so it is the one
          string in the app that does not scale with the system font: it sits
          directly under the mark and has to stay in proportion to it. Every
          other line on this screen scales normally.
        */}
        <Text
          style={[styles.wordmark, { fontSize: wordmarkFontSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          allowFontScaling={false}
        >
          V-HUB
        </Text>
        <Text style={styles.title}>Volunteer Medical Outreach</Text>
        <Text style={styles.subtext}>
          Connecting compassionate volunteers with communities in need of medical care
        </Text>
      </View>

      {showLoading ? (
        <View style={styles.footer}>
          <ActivityIndicator size="small" color={colors.white} />
          <Text style={styles.loadingText}>Loading your mission...</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.heroBackground,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  content: {
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: fontFamily.bold,
    // The mark's own red, not the coral accent. These sit two millimetres
    // apart on the splash and were two different reds — near enough to read as
    // a printing error rather than as a palette. `colors.primary` stays the
    // interface accent everywhere else; this one colour answers to the artwork.
    color: colors.brandMark,
    marginTop: spacing.base,
    marginBottom: spacing.base,
    flexShrink: 1,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.white,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtext: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.white,
    opacity: 0.7,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  footer: {
    position: 'absolute',
    bottom: spacing.xxl * 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.white,
    opacity: 0.8,
  },
});
