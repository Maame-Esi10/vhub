import {
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Avatar,
  ScreenHeader,
  SettingsGroupLabel,
  SettingsRow,
  SignOutButton,
} from '@/components/ui';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { getVScoreBand } from '@/lib/vscore';
import { useAuthStore } from '@/stores/authStore';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

/**
 * Volunteer Settings, per design-refs/Settings.png: avatar + identity block,
 * grouped rows, destructive sign-out at the bottom.
 *
 * Two rows in that PNG remain deliberately NOT built, because VHub has no
 * such features and a row that goes nowhere is worse than no row:
 *   - "Linked Accounts" — there is no OAuth/social linking; auth is
 *     email+password through Supabase only.
 *   - "Language" (showing "English") — the app is not internationalised, so
 *     the control would have exactly one option.
 * "Account & Security" now exists and opens the shared screen that changes
 * both the login email and the password; 2FA is still not offered.
 * The PNG's "Premium Member" subtitle was likewise dropped: VHub has no
 * paid tier. The V-Score band shown in its place is a real status this
 * volunteer actually has.
 */
export default function VolunteerSettings() {
  // The floating tab bar is absolute and reserves no space, so the last
  // element needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);

  const band =
    typeof volunteerProfile?.v_score === 'number' ? getVScoreBand(volunteerProfile.v_score) : null;

  const verificationLabel =
    volunteerProfile?.verification_status === 'verified'
      ? 'Verified'
      : volunteerProfile?.verification_status === 'documents_pending'
        ? 'In review'
        : 'Not verified';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Settings" fallback="/(volunteer)/profile" />
      <ScrollView contentContainerStyle={[styles.content, tabBarPadding]} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <Avatar name={profile?.full_name ?? 'Volunteer'} uri={profile?.avatar_url} size={88} />
          <Text style={styles.name}>{profile?.full_name ?? 'Volunteer'}</Text>
          <Text style={styles.meta}>
            {profile?.email ?? 'No email on file'}
            {band ? ` · ${band} volunteer` : ''}
          </Text>
        </View>

        {/*
          Deliberately NOT here: "Edit Profile" and "How VHub works". Both
          live on the Profile tab. Settings holds app and account state only —
          duplicating them in two places made it unclear which was canonical.
        */}
        <SettingsGroupLabel>ACCOUNT</SettingsGroupLabel>
        {/*
          Points at app/(volunteer)/verify-identity.tsx, NOT the (auth) screen
          of the same name. The (auth) one is a step of the onboarding wizard
          and submits useOnboardingStore, which is empty outside that flow —
          linking there would blank a volunteer's saved category, skills,
          specialties and availability. The volunteer-group screen shares no
          submit path with the wizard and writes only declaration_signed.
        */}
        <SettingsRow
          icon="shield-check-outline"
          label="Identity Verification"
          value={verificationLabel}
          onPress={() => router.push('/(volunteer)/verify-identity')}
        />
        {/*
          Credentials only — the sign-in email and password. Contact details
          stay on Edit Profile; they answer a different question, for a
          different audience.
        */}
        {/*
          A fixed short label, not the email address: the row's value column
          is sized to its content, so a real address crowded the title out.
          The address is shown on the screen this opens, where it has room.
        */}
        <SettingsRow
          icon="lock-outline"
          label="Account & Security"
          value="Login email & password"
          onPress={() => router.push('/(volunteer)/account-security')}
        />
        {/*
          A SECOND DOOR TO THE SAME SCREEN (owner, 2026-09-21: "Where is
          delete account? I cannot find it").

          It was never missing. It is the last block on Account & Security,
          under the heading CLOSING YOUR ACCOUNT, below the login email and
          the password form -- so finding it meant knowing that closing an
          account is filed as a security matter, and scrolling past two forms
          to reach it. Neither is obvious, and somebody looking for it is not
          in a mood to hunt.

          The row says what it does in the words a person actually looks for.
          It is deliberately NOT called "Delete": closure anonymises the
          person and revokes the login while keeping the record of work, and
          calling that a deletion would be a promise the app does not keep.
          The value line says what really happens, so the row is findable
          without being untrue.
        */}
        <SettingsRow
          icon="account-remove-outline"
          label="Close Account"
          value="Remove your details and leave VHub"
          onPress={() => router.push('/(volunteer)/account-security')}
        />

        <SettingsGroupLabel>PREFERENCES</SettingsGroupLabel>
        {/*
          POINTS AT SETTINGS, NOT AT THE INBOX (owner, 2026-09-21: "the
          Notifications row opens the notifications page. It should open
          notification settings").

          A row under a PREFERENCES heading that opened a list of messages was
          the bug: somebody looking for a preference found an inbox, and there
          was nowhere in the app to turn pushes off at all. The settings screen
          links on to the inbox, so nothing became harder to reach.
        */}
        <SettingsRow
          icon="bell-outline"
          label="Notifications"
          value="Push notifications on this device"
          onPress={() => router.push('/(volunteer)/notification-settings')}
        />

        <SettingsGroupLabel>ABOUT</SettingsGroupLabel>
        <SettingsRow
          icon="shield-lock-outline"
          label="Privacy Policy"
          value="What VHub knows, and what it never keeps"
          onPress={() => router.push('/policy')}
        />
        <SettingsRow
          icon="file-document-outline"
          label="Terms of Use"
          value="What you and organisations each promise"
          onPress={() => router.push('/policy?tab=terms')}
        />

        <View style={styles.signOutBlock}>
          <SignOutButton />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  identity: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  name: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  signOutBlock: {
    marginTop: spacing.xl,
  },
});
