import { Redirect, Tabs } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { tabBarScreenOptions, tabBarIcon } from '@/components/ui/tabBarOptions';

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

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (profile && profile.role !== 'organisation') {
    return <Redirect href="/(volunteer)/feed" />;
  }

  return (
    <Tabs screenOptions={tabBarScreenOptions}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
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
    </Tabs>
  );
}
