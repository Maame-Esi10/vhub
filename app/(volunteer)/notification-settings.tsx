import { NotificationSettingsScreen } from '@/components/account/NotificationSettingsScreen';

/**
 * The volunteer's notification settings.
 *
 * A thin route over the shared screen, the same arrangement Account & Security
 * uses: the two roles receive different things and everything else about the
 * screen is identical, so the difference is a prop rather than a second file.
 */
export default function VolunteerNotificationSettings() {
  return (
    <NotificationSettingsScreen
      fallback="/(volunteer)/settings"
      inboxRoute="/(volunteer)/notifications?from=/(volunteer)/notification-settings"
      whatYouGet={[
        'An outreach that matches your profile is published near you.',
        'An organisation accepts, waitlists or turns down one of your applications.',
        'A place frees up and you are promoted from the waitlist.',
        'An outreach you are on is coming up, or has been called off.',
        'A decision is made about your identity documents or a dispute you raised.',
      ]}
    />
  );
}
