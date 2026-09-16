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
        options={{ title: 'Home', tabBarIcon: tabBarIcon('shield-checkmark', 'shield-checkmark-outline') }}
      />
      <Tabs.Screen
        name="organisations"
        options={{
          title: 'Orgs',
          tabBarIcon: tabBarIcon('business', 'business-outline'),
        }}
      />
      <Tabs.Screen
        name="credentials"
        options={{
          // 'Creds', not 'Credentials': eleven characters is the longest label on any
          // of the three bars and it set the floor for how short the pill could be.
          title: 'Creds',
          tabBarIcon: tabBarIcon('id-card', 'id-card-outline'),
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: 'People',
          tabBarIcon: tabBarIcon('people', 'people-outline'),
        }}
      />
      <Tabs.Screen
        name="disputes"
        options={{ title: 'Disputes', tabBarIcon: tabBarIcon('git-compare', 'git-compare-outline') }}
      />

      {/*
        Pushed from the Home tab rather than selected from the bar — every
        route file in this group becomes a tab unless it opts out.
      */}
      {/*
        Activity is pushed from Home rather than holding a place on the bar.
        Five is what the other two groups use and what fits without truncating,
        and the four queues are what an admin opens the app to do — the log is
        what they consult afterwards.
      */}
      <Tabs.Screen name="activity" options={{ href: null }} />
      <Tabs.Screen name="stats" options={{ href: null }} />
      <Tabs.Screen name="deductions" options={{ href: null }} />
      <Tabs.Screen name="sources" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="account-security" options={{ href: null }} />
      <Tabs.Screen name="organisation/[id]" options={{ href: null }} />
    </Tabs>
  );
}
