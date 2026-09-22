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
import { useMyOrganisationProfile } from '@/hooks/useProfileEditor';
import { useAuthStore } from '@/stores/authStore';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

/**
 * Organisation Settings — the same structure as the volunteer Settings
 * screen (itself built from design-refs/Settings.png), with the rows that
 * apply to an organisation. See the volunteer screen's note for which rows
 * in that PNG were deliberately not built and why.
 */
/** What the Settings row says, per state. Short enough not to wrap on a narrow phone. */
const VERIFICATION_ROW_VALUE: Record<string, string> = {
  unverified: 'Not submitted',
  documents_submitted: 'Waiting on review',
  verified: 'Verified',
  rejected: 'Not approved, tap to fix',
  suspended: 'Suspended',
  banned: 'Removed',
};

export default function OrganisationSettings() {
  // The floating tab bar is absolute and reserves no space, so the last
  // element needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const orgQuery = useMyOrganisationProfile(user?.id);
  const org = orgQuery.data;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Settings" fallback="/(organisation)/profile" />
      <ScrollView contentContainerStyle={[styles.content, tabBarPadding]} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <Avatar
            name={org?.org_name ?? 'Organisation'}
            uri={profile?.avatar_url}
            size={88}
            verified={org?.verified === true}
          />
          <Text style={styles.name}>{org?.org_name ?? profile?.full_name ?? 'Organisation'}</Text>
          <Text style={styles.meta}>
            {profile?.email ?? 'No email on file'}
            {org ? ` · ${org.verified ? 'Verified' : 'Awaiting verification'}` : ''}
          </Text>
        </View>

        {/*
          Deliberately NOT here: "Edit Profile" and "How VHub works". Both
          live on the Profile tab. Settings holds app and account state only —
          duplicating them in two places made it unclear which was canonical.
        */}
        <SettingsGroupLabel>ACCOUNT</SettingsGroupLabel>
        {/*
          Credentials only — the sign-in email and password. Public contact
          details stay on Edit Profile: they answer "how do volunteers reach
          us", which is a different question with a different audience.
        */}
        {/* Short fixed label — see the volunteer twin for why not the email. */}
        {/*
          POINTS AT SETTINGS, NOT AT THE INBOX (owner, 2026-09-21). A row under
          PREFERENCES that opened a list of messages meant somebody looking for
          a preference found an inbox, and there was nowhere in the app to turn
          pushes off. The settings screen links on to the inbox, so nothing
          became harder to reach.
        */}
        <SettingsRow
          icon="bell-outline"
          label="Notifications"
          value="Push notifications on this device"
          onPress={() => router.push('/(organisation)/notification-settings')}
        />
        <SettingsRow
          icon="lock-outline"
          label="Account & Security"
          value="Login email & password"
          onPress={() => router.push('/(organisation)/account-security')}
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
          onPress={() => router.push('/(organisation)/account-security')}
        />
        {/*
          Read-only: `verified` is the trust badge volunteers judge outreaches
          by, so it is excluded from the organisation_profiles UPDATE grant and
          set only by a service-role review. Shown here so the state is
          visible without implying it is self-settable.
        */}
        {/*
          No longer read-only. `verified` is still not settable from here — it
          is a generated column now, derived from verification_state, and
          Postgres refuses a write to it outright. What this row opens is the
          SUBMISSION: the organisation sends its evidence, and an admin decides.
        */}
        <SettingsRow
          icon="shield-check-outline"
          label="Organisation Verification"
          value={VERIFICATION_ROW_VALUE[org?.verification_state ?? 'unverified']}
          onPress={() => router.push('/(organisation)/verification')}
        />

        <SettingsGroupLabel>ABOUT</SettingsGroupLabel>
        <SettingsRow
          icon="shield-lock-outline"
          label="Privacy Policy"
          value="What VHub knows, and what it never keeps"
          onPress={() => router.push('/policy?from=/(organisation)/settings')}
        />
        <SettingsRow
          icon="file-document-outline"
          label="Terms of Use"
          value="What you and organisations each promise"
          onPress={() => router.push('/policy?tab=terms&from=/(organisation)/settings')}
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
