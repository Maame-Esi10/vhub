import { useEffect, useState } from 'react';
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
import { OfflineBanner, SplashView } from '@/components/ui';

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

/*
 * The native OS splash screen (configured via the expo-splash-screen plugin in
 * app.json) can only show a background color + one static centered image — it
 * can't render the full splash design (logo, wordmark, tagline, "Loading your
 * mission..." row). So the native splash is hidden as soon as the JS bundle
 * mounts (see the mount-only effect below, not gated on `ready`), and
 * <SplashView> takes over for the remainder of font/session loading.
 *
 * That component lives in components/ui/SplashView.tsx because the welcome
 * screen renders it too while it prefetches the carousel images. It used to
 * draw its own, different loading screen there, which is why the app appeared
 * to have two splash screens in a row.
 */

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
    return <SplashView />;
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
