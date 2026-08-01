import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { useAuthGuard, usePushRegistration } from '@/hooks';
import { configureNotificationHandler } from '@/lib/push';
import {
  configureOnlineManager,
  queryPersister,
  shouldPersistQuery,
  QUERY_CACHE_BUSTER,
  QUERY_CACHE_MAX_AGE_MS,
} from '@/lib/offline';
import { OfflineBanner } from '@/components/ui';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { getSplashWordmarkFontSize } from '@/constants/logoSizes';

SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op: splash screen may already be hidden (e.g. web)
});

// Module scope, not an effect: Expo requires the handler to be registered
// before any notification can be delivered, which includes one that arrives
// during the first render pass.
configureNotificationHandler();

// gcTime must be at least the persisted cache's max age. React Query's 5-minute
// default would evict a query from memory long before the on-disk copy expired,
// and the persister writes whatever is in memory -- so the cache would quietly
// empty itself and offline would show nothing.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { gcTime: QUERY_CACHE_MAX_AGE_MS },
  },
});

configureOnlineManager();

/** Minimum time the JS splash stays up, even if fonts/session resolve sooner. */
const MIN_SPLASH_DISPLAY_MS = 1500;

/**
 * The native OS splash screen (configured via the expo-splash-screen plugin
 * in app.json) can only show a background color + one static centered
 * image — it can't render the full splash design (wordmark, tagline,
 * "Loading your mission..." row). So the native splash is hidden as soon as
 * the JS bundle mounts (see the mount-only effect below, not gated on
 * `ready`), and this component takes over for the remainder of font/session
 * loading. Every element here is coded UI (no flat background image, no
 * logo mark), so it stays crisp at any device resolution.
 */
function SplashScreenView() {
  const { width } = useWindowDimensions();
  const wordmarkFontSize = getSplashWordmarkFontSize(width);

  return (
    <View style={styles.splash}>
      <View style={styles.splashContent}>
        <Text
          style={[styles.splashWordmark, { fontSize: wordmarkFontSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          V-HUB
        </Text>
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
  // No-op until a signed-in user with a profile row exists; see the hook.
  usePushRegistration();
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
      {/* Above the Stack so it overlays every screen rather than being
          re-implemented per screen and forgotten on half of them. */}
      <OfflineBanner />
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: QUERY_CACHE_MAX_AGE_MS,
        buster: QUERY_CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      <SafeAreaProvider>
        <RootNavigator />
      </SafeAreaProvider>
    </PersistQueryClientProvider>
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
  splashWordmark: {
    fontFamily: fontFamily.bold,
    color: colors.primary,
    marginBottom: spacing.base,
    flexShrink: 1,
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
