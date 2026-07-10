import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
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

SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op: splash screen may already be hidden (e.g. web)
});

const queryClient = new QueryClient();

/**
 * The native OS splash screen (configured via the expo-splash-screen plugin
 * in app.json) can only show a background color + one static centered
 * image — it can't render assets/splash.png's full design (headline,
 * subtitle, "Loading your mission..." text baked into that image). So the
 * native splash is hidden as soon as the JS bundle mounts (see the
 * mount-only effect below, not gated on `ready`), and this component takes
 * over displaying the real splash.png for the remainder of font/session
 * loading.
 */
function SplashScreenView() {
  return (
    <View style={styles.splash}>
      <Image source={require('../assets/splash.png')} style={styles.splashImage} resizeMode="cover" />
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

  const ready = (fontsLoaded || !!fontError) && !authLoading;

  useEffect(() => {
    // Hide the native splash on mount, not once `ready` — the JS
    // SplashScreenView below (assets/splash.png) takes over immediately so
    // there's no gap where a blank screen would otherwise show.
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
    backgroundColor: '#0B0B0F',
  },
  splashImage: {
    width: '100%',
    height: '100%',
  },
});
