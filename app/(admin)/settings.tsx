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
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Settings" fallback="/(admin)/overview" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Admin access is not something the app can give or take away. There is no invite, no promotion
            screen and no admin option at sign-up — the role is set directly on the database, which is what
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
