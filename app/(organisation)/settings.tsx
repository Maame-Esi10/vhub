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
import { useMyOrganisationProfile } from '@/hooks/useProfileEditor';
import { useAuthStore } from '@/stores/authStore';

/**
 * Organisation Settings — the same structure as the volunteer Settings
 * screen (itself built from design-refs/Settings.png), with the rows that
 * apply to an organisation. See the volunteer screen's note for which rows
 * in that PNG were deliberately not built and why.
 */
export default function OrganisationSettings() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const orgQuery = useMyOrganisationProfile(user?.id);
  const org = orgQuery.data;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <Avatar name={org?.org_name ?? 'Organisation'} uri={profile?.avatar_url} size={88} />
          <Text style={styles.name}>{org?.org_name ?? profile?.full_name ?? 'Organisation'}</Text>
          <Text style={styles.meta}>
            {profile?.email ?? 'No email on file'}
            {org ? ` · ${org.verified ? 'Verified' : 'Awaiting verification'}` : ''}
          </Text>
        </View>

        <SettingsGroupLabel>ACCOUNT</SettingsGroupLabel>
        <SettingsRow
          icon="account-edit-outline"
          label="Edit Profile"
          onPress={() => router.push('/(organisation)/edit-profile')}
        />

        <SettingsGroupLabel>SUPPORT</SettingsGroupLabel>
        <SettingsRow
          icon="help-circle-outline"
          label="How V-HUB works"
          onPress={() => router.push('/(organisation)/info-hub')}
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
