import { Redirect, Tabs } from 'expo-router';
import { ROLE_HOME } from '@/lib/roleRoutes';
import { useAuthStore } from '@/stores/authStore';
import { useTabBarScreenOptions, tabBarIcon } from '@/components/ui/tabBarOptions';

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
  // Called before the guards below: hooks must run unconditionally, and both
  // branches below can return early.
  const screenOptions = useTabBarScreenOptions();

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  // Sent to THEIR OWN home, read from the role, rather than to the one
  // other group that used to be the only alternative. With three roles
  // "not volunteer" no longer identifies a destination, and guessing wrong
  // lands the user in a group whose guard sends them straight back.
  if (profile && profile.role !== 'volunteer') {
    return <Redirect href={ROLE_HOME[profile.role]} />;
  }

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="feed"
        // Label is "Home", not "Feed": more relatable, and it matches the
        // HOME label on this tab in design-refs/Volunteer Home Feed.png. The
        // route stays feed.tsx — renaming the file would change the URL and
        // every router.push('/(volunteer)/feed') call site for no gain.
        options={{ title: 'Home', tabBarIcon: tabBarIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: 'Applications',
          tabBarIcon: tabBarIcon('document-text', 'document-text-outline'),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: tabBarIcon('calendar', 'calendar-outline'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: tabBarIcon('person-circle', 'person-circle-outline'),
        }}
      />

      {/*
        Every route file in this group becomes a tab unless it opts out, so
        these need href: null — they are pushed from within the four real
        tabs, not selected from the bar. outreach/[id] in particular would
        otherwise show up as a tab with no id to render.
      */}
      <Tabs.Screen name="edit-profile" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="outreach/[id]" options={{ href: null }} />
      <Tabs.Screen name="info-hub" options={{ href: null }} />
      <Tabs.Screen name="map" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="scan" options={{ href: null }} />
      <Tabs.Screen name="feedback" options={{ href: null }} />
      <Tabs.Screen name="account-security" options={{ href: null }} />
      <Tabs.Screen name="verify-identity" options={{ href: null }} />
      <Tabs.Screen name="credential-guidelines" options={{ href: null }} />
    </Tabs>
  );
}
