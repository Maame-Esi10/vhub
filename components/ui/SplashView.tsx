import { ActivityIndicator, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { getLogoSize, getSplashWordmarkFontSize } from '@/constants/logoSizes';

const LOGO = require('../../assets/logo.png');

export interface SplashViewProps {
  /** Hide the spinner row when the screen is not actually waiting on anything. */
  showLoading?: boolean;
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
export function SplashView({ showLoading = true }: SplashViewProps) {
  const { width } = useWindowDimensions();
  const logoSize = getLogoSize('hero', width);
  const wordmarkFontSize = getSplashWordmarkFontSize(width);

  return (
    <View style={styles.splash}>
      <View style={styles.content}>
        <Image
          source={LOGO}
          style={{ width: logoSize, height: logoSize }}
          resizeMode="contain"
          accessible={false}
        />
        <Text
          style={[styles.wordmark, { fontSize: wordmarkFontSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
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
    color: colors.primary,
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
