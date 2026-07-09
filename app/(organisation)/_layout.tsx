import { Tabs } from 'expo-router';

export default function OrganisationTabsLayout() {
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
