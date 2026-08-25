import { Redirect, Tabs } from 'expo-router';
import { ROLE_HOME } from '@/lib/roleRoutes';
import { useAuthStore } from '@/stores/authStore';
import { useTabBarScreenOptions, tabBarIcon } from '@/components/ui/tabBarOptions';

/**
 * The admin tab group.
 *
 * NO DESIGN EXISTS FOR THIS. design-refs/ has no admin screens — the Figma
 * work covered the volunteer and organisation sides only. So nothing here
 * invents a new visual language: it reuses the same tab bar, the same tokens,
 * the same card and settings-row treatments as the other two groups.
 *
 * Each queue adds its own tab as it is built, rather than an empty one being
 * shipped ahead of the feature. Home and Activity came with package A;
 * Organisations came with package C.
 *
 * Defence-in-depth guard, identical in intent to the other two layouts:
 * useAuthGuard redirects on role mismatch too, but in a useEffect that fires
 * after this route has already mounted, so a wrong-role user would briefly
 * see the group. This is a synchronous read of already-loaded auth state.
 */
export default function AdminTabsLayout() {
  const { user, profile } = useAuthStore();
  // Called before the guards below: hooks must run unconditionally, and both
  // branches below can return early.
  const screenOptions = useTabBarScreenOptions();

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (profile && profile.role !== 'admin') {
    return <Redirect href={ROLE_HOME[profile.role]} />;
  }

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="overview"
        options={{ title: 'Home', tabBarIcon: tabBarIcon('shield-account', 'shield-account-outline') }}
      />
      <Tabs.Screen
        name="organisations"
        options={{
          title: 'Orgs',
          tabBarIcon: tabBarIcon('office-building', 'office-building-outline'),
        }}
      />
      <Tabs.Screen
        name="credentials"
        options={{
          title: 'Credentials',
          tabBarIcon: tabBarIcon('card-account-details', 'card-account-details-outline'),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{ title: 'Activity', tabBarIcon: tabBarIcon('history', 'history') }}
      />

      {/*
        Pushed from the Home tab rather than selected from the bar — every
        route file in this group becomes a tab unless it opts out.
      */}
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="account-security" options={{ href: null }} />
      <Tabs.Screen name="organisation/[id]" options={{ href: null }} />
    </Tabs>
  );
}
