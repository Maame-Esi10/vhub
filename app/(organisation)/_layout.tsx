import { Redirect, Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ROLE_HOME } from '@/lib/roleRoutes';
import { useAuthStore } from '@/stores/authStore';
import { CreateTabIcon, useTabBarScreenOptions, tabBarIcon } from '@/components/ui/tabBarOptions';

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
    <>
      {/*
        THE STATUS BAR IS RE-ASSERTED ON ENTERING THE GROUP (owner-reported,
        2026-09-22: "the app has covered my phone's status bar... my time and
        battery").

        The app is edge-to-edge, which Expo SDK 57 defaults to and Android 15
        enforces, so VHub genuinely draws BEHIND the status bar and the clock
        and battery are painted on top of whatever is there. That part is
        correct and is not what went wrong. What went wrong is the COLOUR of
        those icons: at white-on-white they are invisible, which looks exactly
        like the bar being covered, and pulling the shade down reveals them
        because the shade brings its own dark ground with it.

        `expo-status-bar` is last-writer-wins with no restore. The root sets
        the app default, but any screen that overrides it -- welcome, whose
        hero is near-black and which correctly asks for light icons -- leaves
        that override in place for every screen afterwards, because the root's
        own component never re-runs. Declaring it here means arriving in this
        group always sets the icons back to dark, which is right for every
        screen in it.
      */}
      <StatusBar style="dark" />
      <Tabs screenOptions={screenOptions}>
        <Tabs.Screen
          name="dashboard"
          options={{
            // "Home", not "Dashboard": the shorter word fits the five-tab bar
            // without truncating, and matches the HOME label on this tab in
            // design-refs/Organization Dashboard.png. Route stays dashboard.tsx.
            title: 'Home',
            tabBarIcon: tabBarIcon('grid', 'grid-outline'),
          }}
        />
        <Tabs.Screen
          name="create-outreach"
          options={{
            title: 'Create',
            // A filled coral disc, not another outline glyph. This is the one
            // tab that is an action rather than a destination, and it is the
            // action the whole organisation side exists for.
            tabBarIcon: CreateTabIcon,
          }}
        />
        <Tabs.Screen
          name="applicants"
          options={{
            title: 'Applicants',
            tabBarIcon: tabBarIcon('people', 'people-outline'),
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
            tabBarIcon: tabBarIcon('person-circle', 'person-circle-outline'),
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
        <Tabs.Screen name="verification" options={{ href: null }} />
        <Tabs.Screen name="info-hub" options={{ href: null }} />
        <Tabs.Screen name="account-security" options={{ href: null }} />
        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
      </Tabs>
    </>
  );
}
