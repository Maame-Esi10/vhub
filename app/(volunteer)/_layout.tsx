import { Redirect, Tabs } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

/**
 * Defense-in-depth guard: useAuthGuard (app/_layout.tsx) redirects on role
 * mismatch too, but it does so in a useEffect that fires *after* this route
 * has already mounted, so a wrong-role user briefly sees this tab group. By
 * the time this layout renders, the root layout's splash gate has already
 * waited on `loading`, so authStore's user/profile are populated — this is a
 * synchronous read of that already-loaded state, not a re-fetch or a
 * duplicate of useAuthGuard's fuller redirect/onboarding logic.
 */
export default function VolunteerTabsLayout() {
  const { user, profile } = useAuthStore();

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (profile && profile.role !== 'volunteer') {
    return <Redirect href="/(organisation)/dashboard" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="applications" options={{ title: 'Applications' }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />

      {/*
        Every route file in this group becomes a tab unless it opts out, so
        these need href: null — they are pushed from within the four real
        tabs, not selected from the bar. outreach/[id] in particular would
        otherwise show up as a tab with no id to render.
      */}
      <Tabs.Screen name="outreach/[id]" options={{ href: null }} />
      <Tabs.Screen name="info-hub" options={{ href: null }} />
      <Tabs.Screen name="map" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
    </Tabs>
  );
}
