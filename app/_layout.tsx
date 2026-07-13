import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { useAuthGuard } from '@/hooks';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { getLogoSize } from '@/constants/logoSizes';

SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op: splash screen may already be hidden (e.g. web)
});

const queryClient = new QueryClient();

/** Minimum time the JS splash stays up, even if fonts/session resolve sooner. */
const MIN_SPLASH_DISPLAY_MS = 1500;

/**
 * The native OS splash screen (configured via the expo-splash-screen plugin
 * in app.json) can only show a background color + one static centered
 * image — it can't render the full splash design (wordmark, tagline,
 * "Loading your mission..." row). So the native splash is hidden as soon as
 * the JS bundle mounts (see the mount-only effect below, not gated on
 * `ready`), and this component takes over for the remainder of font/session
 * loading. Every element here except the logo mark is coded UI (no flat
 * background image), so it stays crisp at any device resolution.
 */
function SplashScreenView() {
  const { width } = useWindowDimensions();
  const logoSize = getLogoSize('hero', width);

  return (
    <View style={styles.splash}>
      <View style={styles.splashContent}>
        <Image
          source={require('../assets/logo.png')}
          style={[styles.splashLogo, { width: logoSize, height: logoSize }]}
          resizeMode="contain"
        />
        <Text style={styles.splashWordmark}>V-HUB</Text>
        <Text style={styles.splashTitle}>Volunteer Medical Outreach</Text>
        <Text style={styles.splashSubtext}>
          Connecting compassionate volunteers with communities in need of medical care
        </Text>
      </View>
      <View style={styles.splashFooter}>
        <ActivityIndicator size="small" color={colors.white} />
        <Text style={styles.splashLoadingText}>Loading your mission...</Text>
      </View>
    </View>
  );
}

function RootNavigator() {
  const { loading: authLoading } = useAuthGuard();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [minDisplayElapsed, setMinDisplayElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinDisplayElapsed(true), MIN_SPLASH_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const ready = (fontsLoaded || !!fontError) && !authLoading && minDisplayElapsed;

  useEffect(() => {
    // Hide the native splash on mount, not once `ready` — the JS
    // SplashScreenView below takes over immediately so there's no gap where
    // a blank screen would otherwise show.
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  if (!ready) {
    return <SplashScreenView />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <RootNavigator />
      </SafeAreaProvider>
    </QueryClientProvider>
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
  splashContent: {
    alignItems: 'center',
  },
  splashLogo: {
    marginBottom: spacing.base,
  },
  splashWordmark: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  splashTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.white,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  splashSubtext: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.white,
    opacity: 0.7,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  splashFooter: {
    position: 'absolute',
    bottom: spacing.xxl * 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  splashLoadingText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.white,
    opacity: 0.8,
  },
});
