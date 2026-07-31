import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SignOutButton } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';

export default function OrganisationProfile() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.header}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.name}>{profile?.full_name ?? 'Organisation'}</Text>
        {profile?.email ? <Text style={styles.email}>{profile.email}</Text> : null}
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Organisation</Text>
          </View>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.rowCard, pressed && styles.rowCardPressed]}
        onPress={() => router.push('/(organisation)/edit-profile')}
        accessibilityRole="button"
        accessibilityLabel="Edit your organisation profile"
      >
        <MaterialCommunityIcons name="account-edit-outline" size={22} color={colors.primary} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Edit Profile</Text>
          <Text style={styles.rowBody}>
            Update your organisation details, location and description.
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textSecondary} />
      </Pressable>

      <View style={styles.spacer} />

      <SignOutButton />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  header: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textPrimary,
    marginTop: spacing.base,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  name: {
    fontFamily: fontFamily.semiBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  email: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  badge: {
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.primary,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginTop: spacing.base,
  },
  rowCardPressed: {
    opacity: 0.8,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowBody: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
  spacer: {
    flex: 1,
  },
});
