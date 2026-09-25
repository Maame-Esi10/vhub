import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { focusManager, onlineManager, type Query } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

/**
 * Connectivity awareness and cache persistence.
 *
 * Two separate jobs that together make up "offline handling":
 *
 *   1. Telling React Query whether the device is online, so a query PAUSES
 *      instead of firing into a dead socket and landing every data screen on
 *      its error state. Without this, React Native's default assumption is
 *      "always online" and going through a tunnel looks identical to a broken
 *      backend.
 *   2. Writing the query cache to disk, so what the user already loaded
 *      survives the app being killed. In-memory caching alone means a cold
 *      start with no signal shows nothing at all -- which for a volunteer
 *      standing outside an outreach venue is exactly when the schedule
 *      matters most.
 */

/**
 * Bridges NetInfo into React Query's online manager.
 *
 * `isInternetReachable` is null while NetInfo is still probing, and treating
 * that as offline would flash the offline banner on every cold start. Only an
 * explicit `false` counts as unreachable -- connected-but-captive-portal, the
 * case that distinction exists for, still resolves to false once probed.
 *
 * Called once at module scope from app/_layout.tsx.
 */
export function configureOnlineManager(): void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    })
  );
}

/**
 * Tells React Query when the app comes back to the front, so stale queries
 * refetch then (owner-reported 2026-09-25: an approval "only reflects after the
 * org or volunteer signs out and in"). React Query's refetch-on-focus is wired
 * to the browser's window focus by default, which does not exist in React
 * Native, so without this nothing ever refetched on return to the app.
 *
 * Called once at module scope from app/_layout.tsx, next to
 * configureOnlineManager.
 */
export function configureFocusManager(): void {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => subscription.remove();
  });
}

/** Subscribes a component to connectivity changes. */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(() => onlineManager.isOnline());

  useEffect(() => onlineManager.subscribe(setOnline), []);

  return online;
}

/**
 * Query key prefixes written to disk. An ALLOWLIST, deliberately, not a list of
 * exclusions: a denylist silently starts persisting whatever query someone adds
 * next, and the cost of getting that wrong here is writing other people's
 * personal data to unencrypted storage.
 *
 * What is missing matters more than what is here:
 *
 *   * `applications` -> useOutreachApplications embeds each applicant's phone
 *     and email so an organisation can contact them. That is THIRD-PARTY PII
 *     held on the organisation's device. AsyncStorage is not encrypted and is
 *     not cleared on sign-out, so persisting it would leave a roster of
 *     volunteers' contact details on a phone whose owner may no longer have
 *     any right to them. It stays in memory only.
 *   * `profile-editor` -> the user's own contact details. Own data rather than
 *     someone else's, but it is a form's backing store, worthless offline, and
 *     the same storage caveat applies.
 *
 * Note this is unrelated to Hard Rule 5 (auth tokens live in SecureStore, never
 * AsyncStorage) -- no token passes through the query cache. This is about the
 * data the tokens fetch.
 */
const PERSISTED_QUERY_PREFIXES: readonly string[] = [
  'outreaches', // feed + detail: what to show when the app opens with no signal
  'notifications', // the user's own notification history
  'public-profiles', // non-PII discovery views (no phone, no email by design)
];

export function shouldPersistQuery(query: Query): boolean {
  const root = query.queryKey[0];
  return typeof root === 'string' && PERSISTED_QUERY_PREFIXES.includes(root);
}

/**
 * `vhub-query-cache` is versioned by the `buster` passed at hydration rather
 * than the key, so a schema change invalidates the old cache instead of
 * orphaning it under a stale key forever.
 */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'vhub-query-cache',
  throttleTime: 2_000,
});

/**
 * Bumped whenever a persisted query's SHAPE changes. Hydrating a cache written
 * by an older build would otherwise feed stale-shaped objects into components
 * expecting the new fields -- a crash offline, where it cannot be refetched.
 */
export const QUERY_CACHE_BUSTER = 'v1';

/** How long a persisted cache stays usable before being discarded. */
export const QUERY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
