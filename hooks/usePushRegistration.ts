import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { registerForPushNotifications } from '@/lib/push';

/**
 * Registers this device's Expo push token once the user is signed in and
 * their profile row exists.
 *
 * Gated on `profile`, not just `user`. push_tokens.user_id is a foreign key to
 * profiles(id), and during signup the auth session exists for a moment before
 * useSignUp has written the profiles row -- registering in that window would
 * fail the FK and surface as a 500 from /api/notifications. Waiting for the
 * profile also means the very first registration happens after onboarding
 * rather than mid-wizard.
 *
 * Runs once per signed-in user, tracked by ref rather than by effect deps
 * alone: authStore.profile is replaced by a new object on every profile edit,
 * which would otherwise re-register on each save.
 *
 * Re-registering on later launches is intentional and cheap -- Expo can
 * rotate a token silently with no callback, and the API's upsert on
 * (user_id, expo_push_token) makes a repeat registration a no-op.
 */
export function usePushRegistration(): void {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !profile) {
      // Signed out: clear the marker so the next sign-in (possibly a
      // different account on the same device) registers again.
      registeredFor.current = null;
      return;
    }
    if (registeredFor.current === user.id) return;
    registeredFor.current = user.id;

    void registerForPushNotifications().then((result) => {
      if (!result.ok && result.reason === 'error') {
        // Permission denials are a normal user choice and stay silent; a real
        // failure is worth a breadcrumb without interrupting the session.
        console.warn('[push] registration failed:', result.detail);
      }
    });
  }, [user, profile]);
}
