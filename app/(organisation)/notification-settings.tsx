import { NotificationSettingsScreen } from '@/components/account/NotificationSettingsScreen';

/** The organisation's notification settings. See the volunteer file. */
export default function OrganisationNotificationSettings() {
  return (
    <NotificationSettingsScreen
      fallback="/(organisation)/settings"
      inboxRoute="/(organisation)/notifications?from=/(organisation)/notification-settings"
      whatYouGet={[
        'A volunteer applies to one of your outreaches.',
        'One of your outreaches is short of volunteers as the date approaches.',
        'An outreach of yours is coming up.',
        'A decision is made about your organisation verification.',
      ]}
    />
  );
}
