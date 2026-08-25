import { AccountSecurityScreen } from '@/components/account/AccountSecurityScreen';

/** Admin route for Account & Security. See the volunteer twin for why this is split. */
export default function AdminAccountSecurity() {
  return <AccountSecurityScreen fallback="/(admin)/settings" />;
}
