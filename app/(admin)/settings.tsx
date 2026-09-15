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
  Badge,
  ScreenHeader,
  SettingsGroupLabel,
  SettingsRow,
  SignOutButton,
} from '@/components/ui';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useMutation } from '@tanstack/react-query';
import { checkMailHealth } from '@/lib/api-client';
import { humanError } from '@/lib/errorMessage';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

/**
 * Admin settings. Same structure as the volunteer and organisation settings
 * screens — identity block, grouped rows, destructive sign-out at the bottom —
 * because there is no admin design and inventing a third layout for a screen
 * that does the same job would only make the app read as three apps.
 *
 * Short by design. An admin has no profile to edit, no verification state of
 * their own and no notification preferences yet; the only account state that
 * exists for them is the login email and password, which is the shared
 * Account & Security screen every role uses.
 */
export default function AdminSettings() {
  // The floating tab bar is absolute and reserves no space, so the last
  // element needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);

  /*
    THE MAIL DIAGNOSTIC, REACHABLE FROM INSIDE THE APP.

    It also answers to CRON_SECRET from a terminal (see the endpoint), because
    a diagnostic that can only be run from inside the app is no use when the
    thing being diagnosed is why somebody cannot register. Both doors exist on
    purpose; this is the one that does not need a secret pasted anywhere.
  */
  const mailHealth = useMutation({ mutationFn: () => checkMailHealth() });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Settings" fallback="/(admin)/overview" />
      <ScrollView contentContainerStyle={[styles.content, tabBarPadding]} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <Avatar name={profile?.full_name ?? 'Admin'} uri={profile?.avatar_url} size={88} />
          <Text style={styles.name}>{profile?.full_name ?? 'Admin'}</Text>
          <Text style={styles.meta}>{profile?.email ?? 'No email on file'}</Text>
          <Badge label="Platform admin" icon="shield-account-outline" style={styles.roleBadge} />
        </View>

        <SettingsGroupLabel>ACCOUNT</SettingsGroupLabel>
        <SettingsRow
          icon="lock-outline"
          label="Account & Security"
          value="Login email & password"
          onPress={() => router.push('/(admin)/account-security')}
        />
        {/*
          Read-only, and it is worth saying why on the screen rather than only
          in a comment: the role cannot be changed from inside the app by
          anybody, including the admin holding it. It is granted by a statement
          run against the database and nowhere else.
        */}
        <SettingsRow icon="shield-key-outline" label="Role" value="Granted in the database" />

        <SettingsGroupLabel>DIAGNOSTICS</SettingsGroupLabel>
        <SettingsRow
          icon="email-check-outline"
          label="Check email delivery"
          value={
            mailHealth.isPending
              ? 'Checking...'
              : mailHealth.isSuccess
                ? 'Credential is valid'
                : mailHealth.isError
                  ? 'Failed'
                  : 'Tap to test'
          }
          onPress={() => mailHealth.mutate()}
        />
        <View style={styles.note}>
          <Text style={styles.noteText}>
            {mailHealth.isSuccess
              ? 'The Gmail app password is valid and V-HUB can authenticate to send mail. If Supabase still cannot send a confirmation email, the fault is in its own SMTP settings rather than the password.'
              : mailHealth.isError
                ? humanError(
                    mailHealth.error,
                    'The check could not be completed. Try again in a moment.'
                  )
                : 'Signs in to the mail account without sending anything, so it costs no quota and reaches no inbox. Use it when a confirmation or decision email has not arrived: it separates a revoked app password from a Supabase SMTP setting, which the errors themselves cannot.'}
          </Text>
        </View>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Admin access is not something the app can give or take away. There is no invite, no promotion
            screen and no admin option at sign-up. The role is set directly on the database, which is what
            stops anyone granting it to themselves.
          </Text>
        </View>

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
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  identity: { alignItems: 'center', paddingVertical: spacing.lg },
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
  roleBadge: { marginTop: spacing.md },
  note: { marginTop: spacing.xl },
  noteText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  signOutBlock: { marginTop: spacing.xl },
});
