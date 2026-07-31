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
 * Three rows in that PNG were deliberately NOT built, because V-HUB has no
 * such features and a row that goes nowhere is worse than no row:
 *   - "Linked Accounts" — there is no OAuth/social linking; auth is
 *     email+password through Supabase only.
 *   - "Language" (showing "English") — the app is not internationalised, so
 *     the control would have exactly one option.
 *   - "Account Security" — there is no password-change or 2FA flow yet.
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
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <Avatar name={profile?.full_name ?? 'Volunteer'} uri={profile?.avatar_url} size={88} />
          <Text style={styles.name}>{profile?.full_name ?? 'Volunteer'}</Text>
          <Text style={styles.meta}>
            {profile?.email ?? 'No email on file'}
            {band ? ` · ${band} volunteer` : ''}
          </Text>
        </View>

        <SettingsGroupLabel>ACCOUNT</SettingsGroupLabel>
        <SettingsRow
          icon="account-edit-outline"
          label="Edit Profile"
          onPress={() => router.push('/(volunteer)/edit-profile')}
        />
        {/*
          Read-only on purpose. The only identity-verification screen that
          exists is app/(auth)/verify-identity.tsx, which is a step of the
          onboarding wizard: it reads useOnboardingStore (empty outside that
          flow) and submits useCompleteOnboarding, so linking here would let
          a volunteer overwrite their saved category, skills, specialties and
          availability with blanks. A standalone re-verification flow needs
          to exist before this row can become tappable.
        */}
        <SettingsRow
          icon="shield-check-outline"
          label="Identity Verification"
          value={verificationLabel}
        />

        <SettingsGroupLabel>PREFERENCES</SettingsGroupLabel>
        <SettingsRow
          icon="bell-outline"
          label="Notifications"
          onPress={() => router.push('/(volunteer)/notifications')}
        />

        <SettingsGroupLabel>SUPPORT</SettingsGroupLabel>
        <SettingsRow
          icon="help-circle-outline"
          label="How V-HUB works"
          onPress={() => router.push('/(volunteer)/info-hub')}
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
