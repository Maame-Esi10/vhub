import * as SecureStore from 'expo-secure-store';
import type { Profile, VolunteerProfile } from '@/types/database';

/*
  THE LAST PROFILE THIS PHONE LOADED, so the app can open with no internet
  (owner-reported 2026-09-25: "Without internet it goes up to the welcome
  carousel").

  THE BUG THIS EXISTS FOR. On a cold start the session comes from SecureStore
  (no network needed) but the profile is fetched from Supabase. Offline that
  fetch fails, and useAuthGuard treated every failed first load as a failed
  sign-in: it signed the person out and sent them to welcome. So opening the
  app with no signal logged a signed-in user out, and the offline feed and
  banner (lib/offline.ts) could never be reached from a cold start.

  With this, a cold start that fails for lack of connection uses the profile
  saved at the last successful load, keeps the session, and refreshes when the
  connection returns.

  SECURESTORE, NOT ASYNCSTORAGE. The profile carries the user's own email and
  phone. lib/offline.ts deliberately keeps contact details out of unencrypted
  storage; SecureStore is encrypted, and this is cleared on sign-out.

  TWO KEYS, because SecureStore warns above 2048 bytes per value and a
  volunteer profile with a full bio, fifteen skills and a week of
  availability can approach that on its own.

  Every call swallows its own failure: a cache that cannot be read or written
  just means the old behaviour, never a crash.
*/

const PROFILE_KEY = 'vhub.cachedProfile.v1';
const VOLUNTEER_KEY = 'vhub.cachedVolunteerProfile.v1';

export async function saveProfileCache(profile: Profile, volunteerProfile: VolunteerProfile | null): Promise<void> {
  try {
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
    if (volunteerProfile) await SecureStore.setItemAsync(VOLUNTEER_KEY, JSON.stringify(volunteerProfile));
    else await SecureStore.deleteItemAsync(VOLUNTEER_KEY);
  } catch {
    // See the header: a failed write only loses the offline fallback.
  }
}

/** The saved profile, only if it belongs to this user. */
export async function loadProfileCache(
  userId: string
): Promise<{ profile: Profile; volunteerProfile: VolunteerProfile | null } | null> {
  try {
    const rawProfile = await SecureStore.getItemAsync(PROFILE_KEY);
    if (!rawProfile) return null;
    const profile = JSON.parse(rawProfile) as Profile;
    if (profile.id !== userId) return null;
    const rawVolunteer = await SecureStore.getItemAsync(VOLUNTEER_KEY);
    const volunteerProfile = rawVolunteer ? (JSON.parse(rawVolunteer) as VolunteerProfile) : null;
    return { profile, volunteerProfile: volunteerProfile?.id === userId ? volunteerProfile : null };
  } catch {
    return null;
  }
}

export async function clearProfileCache(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PROFILE_KEY);
    await SecureStore.deleteItemAsync(VOLUNTEER_KEY);
  } catch {
    // Nothing to do: the next save overwrites it, and a read checks the id.
  }
}
