import { StyleSheet } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ROLE_HOME } from '@/lib/roleRoutes';
import { useAuthStore } from '@/stores/authStore';
import { useTabBarScreenOptions, tabBarIcon } from '@/components/ui/tabBarOptions';
import { useCredentialQueue, useDisputeQueue, useVerificationQueue } from '@/hooks';
import { colors } from '@/constants/theme';

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

  /*
    THE COUNTS BELONG ON THE TABS THEMSELVES (owner, 2026-09-21: "there are
    some on the navbar, why are on the home screen??").

    The home screen had grown three rows -- Organisations, Credentials,
    Disputes -- each showing a pending count and each linking to a tab that was
    already sitting on the bar underneath it. That is a second navigation layer
    for destinations that needed none, and it is the duplication being
    reported.

    The only thing those rows carried that the bar could not was the NUMBER, so
    the number moves to the bar and the rows go. A badge is also strictly
    better than a card: it is visible from every screen in the group rather
    than only from Home, which is what an admin actually wants from "is
    anybody waiting on me".

    Hooks run before the early returns below, because hooks must run
    unconditionally. Each is `enabled: role === 'admin'` internally, so a
    non-admin reaching this file fetches nothing.
  */
  const organisations = useVerificationQueue();
  const credentials = useCredentialQueue();
  const disputes = useDisputeQueue();

  /** Undefined hides the badge; zero would render an empty circle. */
  const badge = (count: number | undefined) => (count && count > 0 ? count : undefined);

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (profile && profile.role !== 'admin') {
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
          name="overview"
          options={{ title: 'Home', tabBarIcon: tabBarIcon('shield-checkmark', 'shield-checkmark-outline') }}
        />
        <Tabs.Screen
          name="organisations"
          options={{
            title: 'Orgs',
            tabBarIcon: tabBarIcon('business', 'business-outline'),
            tabBarBadge: badge(organisations.data?.length),
            tabBarBadgeStyle: styles.badge,
          }}
        />
        <Tabs.Screen
          name="credentials"
          options={{
            // 'Creds', not 'Credentials': eleven characters is the longest label on any
            // of the three bars and it set the floor for how short the pill could be.
            title: 'Creds',
            tabBarIcon: tabBarIcon('id-card', 'id-card-outline'),
            tabBarBadge: badge(credentials.data?.length),
            tabBarBadgeStyle: styles.badge,
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
          options={{
            title: 'Disputes',
            tabBarIcon: tabBarIcon('git-compare', 'git-compare-outline'),
            tabBarBadge: badge(disputes.data?.length),
            tabBarBadgeStyle: styles.badge,
          }}
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
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.primary,
    color: colors.white,
    fontSize: 10,
  },
});
