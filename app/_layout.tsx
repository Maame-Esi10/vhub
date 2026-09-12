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
import { readReturningUser } from '@/lib/launchState';

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

  /*
    WHICH SPLASH, decided before the first frame is drawn.

    `null` means "not read yet", and it is why the native splash is not hidden
    until this resolves. The alternative — guess, draw, then correct — is the
    double-splash the whole screen was rebuilt to remove, and it would be at
    its most obvious here, because the two variants are not a superset and a
    subset: the mark sits in the middle of the screen in one and above a block
    of text in the other, so it would visibly jump.

    Reading one AsyncStorage key takes a few milliseconds against the second
    and a half of fonts and session resolution that follow it, so nobody waits
    on this; it simply happens while the native splash — which draws the same
    mark on the same ground — is still up.
  */
  const [returningUser, setReturningUser] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    readReturningUser().then((value) => {
      if (!cancelled) setReturningUser(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setMinDisplayElapsed(true), MIN_SPLASH_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const ready = (fontsLoaded || !!fontError) && !authLoading && minDisplayElapsed;

  useEffect(() => {
    // Hide the native splash once we know which JS splash replaces it, not on
    // mount: the two are identical for a returning user, so handing over at
    // this moment is invisible. Hiding before the answer arrived would show
    // the wrong one first.
    if (returningUser === null) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [returningUser]);

  if (returningUser === null) {
    // The native splash is still up. Drawing anything here would replace it
    // with a second, differently composed screen for a few milliseconds.
    return null;
  }

  if (!ready) {
    // A returning user gets the mark alone — no wordmark, no tagline, no
    // spinner — which is exactly what the native splash was already showing.
    return returningUser ? <SplashView variant="mark" /> : <SplashView />;
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
