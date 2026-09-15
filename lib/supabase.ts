import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variables.'
  );
}

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/*
  TIE THE REFRESH TIMER TO THE APP BEING IN FRONT.

  `autoRefreshToken: true` starts a timer, and on a phone that timer is not a
  reliable thing: Android throttles and eventually kills background timers, so
  an app left in the background for a while comes back holding a token that
  expired while nothing was running to renew it. The first request after that
  fails, and because a token refresh is not something any screen is watching,
  the failure surfaces somewhere unrelated.

  This is the arrangement Supabase documents for React Native, and it was
  simply missing. Its absence is also why the pending-confirmation screen only
  ever updated after the app was closed and reopened (owner-reported
  2026-09-14): nothing whatsoever ran when the app came back to the front, so
  a cold start was the only thing that re-read the session.

  `startAutoRefresh` is safe to call when already running, and both calls are
  no-ops without a session, so no guard is needed.
*/
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
