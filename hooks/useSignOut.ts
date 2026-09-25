import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { unregisterPushNotifications } from '@/lib/push';
import { clearProfileCache } from '@/lib/profileCache';

/**
 * Signs out of Supabase and clears authStore synchronously so useAuthGuard's
 * routing effect (which reacts to `user`) redirects to (auth)/welcome
 * immediately, rather than waiting on the async onAuthStateChange round trip.
 */
export function useSignOut() {
  const reset = useAuthStore((state) => state.reset);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      // BEFORE signOut, not after: deleting this device's push token is an
      // authenticated write governed by `using (user_id = auth.uid())`. Once
      // the session is gone auth.uid() is null, the policy matches no rows,
      // and the delete removes nothing while still reporting success -- the
      // account would keep receiving pushes on a handed-on phone.
      // Never throws, so it cannot strand the user in a signed-in state.
      await unregisterPushNotifications();
      await supabase.auth.signOut();
    } finally {
      // Clear local state regardless of network outcome so the user is
      // never stuck signed-in on-device after requesting sign-out. The
      // profile saved for offline launches goes too (lib/profileCache.ts).
      void clearProfileCache();
      reset();
      setSigningOut(false);
    }
  }, [reset]);

  return { signOut, signingOut };
}
