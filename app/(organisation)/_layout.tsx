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
export default function OrganisationTabsLayout() {
  const { user, profile } = useAuthStore();
  // Called before the guards below: hooks must run unconditionally, and both
  // branches below can return early.
  const screenOptions = useTabBarScreenOptions();

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  // Sent to THEIR OWN home, read from the role, rather than to the one
  // other group that used to be the only alternative. With three roles
  // "not organisation" no longer identifies a destination, and guessing wrong
  // lands the user in a group whose guard sends them straight back.
  if (profile && profile.role !== 'organisation') {
    return <Redirect href={ROLE_HOME[profile.role]} />;
  }

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="dashboard"
        options={{
          // "Home", not "Dashboard": the shorter word fits the five-tab bar
          // without truncating, and matches the HOME label on this tab in
          // design-refs/Organization Dashboard.png. Route stays dashboard.tsx.
          title: 'Home',
          tabBarIcon: tabBarIcon('view-dashboard', 'view-dashboard-outline'),
        }}
      />
      <Tabs.Screen
        name="create-outreach"
        options={{ title: 'Create', tabBarIcon: tabBarIcon('plus-circle', 'plus-circle-outline') }}
      />
      <Tabs.Screen
        name="applicants"
        options={{
          title: 'Applicants',
          tabBarIcon: tabBarIcon('account-group', 'account-group-outline'),
        }}
      />
      <Tabs.Screen
        name="reviews"
        options={{ title: 'Reviews', tabBarIcon: tabBarIcon('star', 'star-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: tabBarIcon('account-circle', 'account-circle-outline'),
        }}
      />

      {/*
        Pushed from the profile tab rather than selected from the bar — every
        route file in this group becomes a tab unless it opts out.
      */}
      <Tabs.Screen name="edit-profile" options={{ href: null }} />
      <Tabs.Screen name="outreach/[id]" options={{ href: null }} />
      <Tabs.Screen name="edit-outreach/[id]" options={{ href: null }} />
      <Tabs.Screen name="checkin/[id]" options={{ href: null }} />
      <Tabs.Screen name="attendance/[id]" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="verification" options={{ href: null }} />
      <Tabs.Screen name="info-hub" options={{ href: null }} />
      <Tabs.Screen name="account-security" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}
