import { AccountSecurityScreen } from '@/components/account/AccountSecurityScreen';

/**
 * Volunteer route for Account & Security.
 *
 * A thin wrapper over the shared screen: credentials behave identically for
 * both roles, so only the header fallback differs. Two routes rather than one
 * shared path because `fallback` must land inside THIS tab group — sending a
 * volunteer to an organisation route on back would drop them out of their own
 * navigator.
 */
export default function VolunteerAccountSecurity() {
  return <AccountSecurityScreen fallback="/(volunteer)/settings" />;
}
