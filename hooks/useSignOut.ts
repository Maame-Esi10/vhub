import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

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
      await supabase.auth.signOut();
    } finally {
      // Clear local state regardless of network outcome so the user is
      // never stuck signed-in on-device after requesting sign-out.
      reset();
      setSigningOut(false);
    }
  }, [reset]);

  return { signOut, signingOut };
}
