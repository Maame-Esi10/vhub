import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { registerPushToken } from '@/lib/api-client';
import { colors } from '@/constants/theme';

/**
 * Expo push token acquisition and teardown.
 *
 * The server half of push has existed since Phase 3.2 -- /api/match,
 * /api/application-status and the daily reminder cron all read `push_tokens`
 * and dispatch through Expo. Nothing was ever writing a row into that table,
 * so every one of those dispatches found zero tokens and sent nothing. This
 * module is the missing writer.
 */

/**
 * Payloads the four server dispatch sites attach, kept in sync by hand with
 * `data: { type: ... }` in api/src/app/api/{match,application-status,
 * notifications}/route.ts and api/src/server/eventReminders.ts. Consumed when
 * routing a notification tap.
 */
export type PushPayload =
  | { type: 'new_match'; outreachId: string }
  | { type: 'application_status'; outreachId: string; status: string }
  | { type: 'event_reminder'; outreachId: string }
  | { type: 'test' };

const ANDROID_CHANNEL_ID = 'default';

/**
 * The token this app instance last registered, remembered so sign-out can
 * delete the right row without a second round trip to Expo's token service --
 * which would otherwise fail exactly when it matters most (signing out on a
 * flaky connection), leaving the token behind and the account still pushed to.
 */
let lastRegisteredToken: string | null = null;

/**
 * Controls what happens to a push that lands while the app is FOREGROUNDED.
 * Without this, Android and iOS both suppress the banner entirely on the
 * assumption the UI is already showing the information -- which for VHub is
 * wrong: an acceptance can arrive while the volunteer is anywhere in the app.
 *
 * `shouldShowAlert` is deprecated in expo-notifications 57 and replaced by the
 * banner/list split, so both are set: banner = the transient heads-up, list =
 * the persisted entry in the OS notification centre.
 *
 * Called at module scope from app/_layout.tsx, per Expo's requirement that the
 * handler be registered before any notification can be received.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'permission_denied' | 'unsupported' | 'error'; detail?: string };

/**
 * Requests notification permission, obtains this device's Expo push token and
 * registers it against the signed-in user via /api/notifications.
 *
 * Registration deliberately goes through the serverless API rather than a
 * direct Supabase insert. push_tokens' RLS would permit the direct write
 * (`with check (user_id = auth.uid())`), but routing it through the API means
 * user_id is taken from the caller's verified JWT server-side and is never
 * client-supplied at all.
 *
 * Every failure path is non-fatal and returns rather than throws: push is an
 * enhancement, and a volunteer who declines the OS permission prompt must
 * still get a fully working app. The caller logs and moves on.
 */
export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  // Web has no Expo push transport, and a simulator/emulator cannot be issued
  // a real device token -- both fail deep inside getExpoPushTokenAsync with an
  // opaque error, so they are turned away up front.
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'unsupported', detail: 'Push is not supported on web.' };
  }

  try {
    // Android requires a channel to exist BEFORE a notification arrives, or
    // the system files it under a default channel the app cannot style.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'VHub alerts',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: colors.primary,
      });
    }

    // Only prompt if not already decided. Re-prompting an explicit denial is
    // a no-op on both platforms (the OS will not show the dialog twice), so
    // asking again every launch would just burn a round trip.
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') {
      return { ok: false, reason: 'permission_denied' };
    }

    // The EAS project id is required by getExpoPushTokenAsync outside of Expo
    // Go. It lives in app.json under extra.eas.projectId; reading it from the
    // resolved config rather than hardcoding keeps the two from drifting.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      return { ok: false, reason: 'error', detail: 'No EAS projectId in app config.' };
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(token);
    lastRegisteredToken = token;
    return { ok: true, token };
  } catch (err) {
    return { ok: false, reason: 'error', detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Removes this device's token so a signed-out account stops receiving pushes
 * on a shared or handed-on phone.
 *
 * MUST be called BEFORE supabase.auth.signOut(). The delete is an ordinary
 * authenticated client write governed by push_tokens_delete_own
 * (`using (user_id = auth.uid())`) -- once the session is gone auth.uid() is
 * null, the policy matches no rows, and the delete silently removes nothing
 * while still reporting success.
 *
 * Deleting only THIS device's token, not every token for the user: signing
 * out on a phone must not stop notifications on the same account's tablet.
 */
export async function unregisterPushNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    let token = lastRegisteredToken;

    // Only ask Expo if this launch never registered -- e.g. the app was
    // reopened with a restored session, so the effect ran in an earlier
    // process. Permission may also have been revoked in OS settings since,
    // in which case there is no token to look up and nothing to delete.
    if (!token) {
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) return;
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    }

    // No user_id filter needed: push_tokens_delete_own narrows this to the
    // caller's own row. That matters because two accounts signed in on the
    // same device legitimately share a token value (the unique key is the
    // PAIR), and signing out of one must not silence the other.
    await supabase.from('push_tokens').delete().eq('expo_push_token', token);
    lastRegisteredToken = null;
  } catch {
    // Non-fatal by design: failing to clean up a token must never block a
    // sign-out. A stale token stops mattering once Expo reports it as
    // DeviceNotRegistered on the next dispatch.
  }
}
