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
export default function OrganisationTabsLayout() {
  const { user, profile } = useAuthStore();

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (profile && profile.role !== 'organisation') {
    return <Redirect href="/(volunteer)/feed" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="create-outreach" options={{ title: 'Create' }} />
      <Tabs.Screen name="applicants" options={{ title: 'Applicants' }} />
      <Tabs.Screen name="reviews" options={{ title: 'Reviews' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
