import { Redirect } from 'expo-router';

export default function OnboardingEntry() {
  return <Redirect href="/(auth)/onboarding/skills" />;
}
