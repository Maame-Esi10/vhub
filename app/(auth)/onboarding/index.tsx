import { Redirect } from 'expo-router';

/*
  THE ROLE COMES FIRST (owner, 2026-09-25). The wizard used to open on skills
  and ask for the role second, so a volunteer picked skills before VHub knew
  what they were qualified to do, and a first aider could tick work only a
  doctor does. Asking the role first is what lets the skills step show only
  the skills that role can claim (constants/skillEligibility.ts).
*/
export default function OnboardingEntry() {
  return <Redirect href="/(auth)/onboarding/category" />;
}
