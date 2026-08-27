import { ScrollView, StyleSheet, Text, View } from 'react-native';
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

/**
 * Volunteer Settings, per design-refs/Settings.png: avatar + identity block,
 * grouped rows, destructive sign-out at the bottom.
 *
 * Two rows in that PNG remain deliberately NOT built, because V-HUB has no
 * such features and a row that goes nowhere is worse than no row:
 *   - "Linked Accounts" — there is no OAuth/social linking; auth is
 *     email+password through Supabase only.
 *   - "Language" (showing "English") — the app is not internationalised, so
 *     the control would have exactly one option.
 * "Account & Security" now exists and opens the shared screen that changes
 * both the login email and the password; 2FA is still not offered.
 * The PNG's "Premium Member" subtitle was likewise dropped: V-HUB has no
 * paid tier. The V-Score band shown in its place is a real status this
 * volunteer actually has.
 */
export default function VolunteerSettings() {
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <Avatar name={profile?.full_name ?? 'Volunteer'} uri={profile?.avatar_url} size={88} />
          <Text style={styles.name}>{profile?.full_name ?? 'Volunteer'}</Text>
          <Text style={styles.meta}>
            {profile?.email ?? 'No email on file'}
            {band ? ` · ${band} volunteer` : ''}
          </Text>
        </View>

        {/*
          Deliberately NOT here: "Edit Profile" and "How V-HUB works". Both
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

        <SettingsGroupLabel>PREFERENCES</SettingsGroupLabel>
        <SettingsRow
          icon="bell-outline"
          label="Notifications"
          onPress={() => router.push('/(volunteer)/notifications')}
        />

        <SettingsGroupLabel>ABOUT</SettingsGroupLabel>
        <SettingsRow
          icon="shield-lock-outline"
          label="Privacy Policy"
          value="What V-HUB knows, and what it never keeps"
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
