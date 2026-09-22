import { AccountSecurityScreen } from '@/components/account/AccountSecurityScreen';

/** Organisation route for Account & Security. See the volunteer twin for why this is split. */
export default function OrganisationAccountSecurity() {
  return <AccountSecurityScreen fallback="/(organisation)/profile" />;
}
