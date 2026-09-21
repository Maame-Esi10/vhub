import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import {
  registerForPushNotifications,
  unregisterPushNotifications,
} from '@/lib/push';

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export interface PushPreferenceState {
  /** False on web, where there is no device to push to. */
  supported: boolean;
  permission: PushPermission;
  /** Whether THIS device currently has a token registered for this account. */
  enabled: boolean;
}

export const pushPreferenceKey = (userId: string) => ['push-preference', userId] as const;

/**
 * Whether this device is currently set up to receive VHub pushes.
 *
 * WHY THE SWITCH IS A TOKEN AND NOT A PREFERENCE COLUMN (owner asked for the
 * better option, 2026-09-21).
 *
 * The obvious design is a row of per-type toggles -- matches, application
 * decisions, reminders -- stored against the profile. That needs a column, and
 * the schema is gated; more importantly it needs EVERY dispatch site in the
 * API to consult it, which is six endpoints and two cron passes, and a
 * preference that half the senders ignore is worse than no preference at all,
 * because it is a promise the app visibly breaks.
 *
 * `push_tokens` is already the switch. Every dispatch site, without exception,
 * looks a user's tokens up and sends to what it finds; a user with no row for
 * this device gets no push, and that is true today with no new code. So the
 * master switch is honest, complete, and enforceable at the only place that
 * matters -- and per-type toggles can be added later on top of it without
 * anything here changing.
 *
 * THE IN-APP INBOX IS DELIBERATELY UNAFFECTED. `notifyUsers` writes the
 * notifications row whether or not a token exists, which is the whole reason
 * somebody who declined the OS prompt can still see their decisions. Turning
 * pushes off silences the phone, never the record.
 */
async function readPushState(): Promise<PushPreferenceState> {
  if (Platform.OS === 'web') {
    return { supported: false, permission: 'denied', enabled: false };
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    // No permission means no token can exist, so there is nothing to look up.
    return {
      supported: true,
      permission: status === 'denied' ? 'denied' : 'undetermined',
      enabled: false,
    };
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    return { supported: false, permission: 'granted', enabled: false };
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  /*
    No `user_id` filter: `push_tokens_select_own` already narrows this to the
    caller's rows. That matters because two accounts signed in on one device
    legitimately share a token VALUE -- the unique key is the pair -- so
    filtering on the token alone still answers "is this device registered for
    ME", and adding a user_id filter would only duplicate what RLS does.
  */
  const { data, error } = await supabase
    .from('push_tokens')
    .select('expo_push_token')
    .eq('expo_push_token', token)
    .limit(1);

  if (error) {
    throw new Error(error.message || 'Could not read your notification settings.');
  }

  return { supported: true, permission: 'granted', enabled: (data ?? []).length > 0 };
}

export function usePushPreference() {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: pushPreferenceKey(userId ?? 'anonymous'),
    enabled: !!userId,
    queryFn: readPushState,
    // Asking Expo for a token is a real round trip, and the answer only
    // changes when the person changes it here or in OS settings.
    staleTime: 30_000,
  });
}

export type SetPushResult =
  | { ok: true; enabled: boolean }
  | { ok: false; reason: 'permission_denied' | 'unsupported' | 'error'; detail?: string };

/**
 * Turns pushes on or off for this device.
 *
 * Returns a RESULT rather than throwing on a refused permission, because a
 * person declining the OS prompt is an ordinary choice and not an error the
 * screen has to recover from. The screen tells them the switch could not go on
 * and why, which is the one thing the OS prompt itself does not do once it has
 * been dismissed.
 */
export function useSetPushEnabled() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);

  return useMutation({
    mutationFn: async (next: boolean): Promise<SetPushResult> => {
      if (!next) {
        await unregisterPushNotifications();
        return { ok: true, enabled: false };
      }

      const result = await registerForPushNotifications();
      if (!result.ok) return { ok: false, reason: result.reason, detail: result.detail };
      return { ok: true, enabled: true };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pushPreferenceKey(userId ?? 'anonymous') });
    },
  });
}
