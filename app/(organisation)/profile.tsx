import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';

export default function OrganisationProfile() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Profile</Text>
        <Pressable
          onPress={() => router.push('/(organisation)/settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={12}
          style={({ pressed }) => [styles.gearButton, pressed && styles.gearPressed]}
        >
          <MaterialCommunityIcons name="cog-outline" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/*
        THE LOGO BELONGS ON THE SCREEN THAT IS ABOUT WHO YOU ARE.

        This card had no image at all — not a broken one, an absent one — so
        the organisation's own Profile tab was the only identity surface in
        the app that never showed the logo it had uploaded. Settings, one tap
        away, always did.

        Initials come from the same `full_name` rendered beside them, so the
        fallback can never show different letters from the name on the card.
      */}
      <View style={styles.card}>
        <Avatar name={profile?.full_name ?? 'Organisation'} uri={profile?.avatar_url} size={56} />
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={2}>
            {profile?.full_name ?? 'Organisation'}
          </Text>
          {profile?.email ? (
            <Text style={styles.email} numberOfLines={1}>
              {profile.email}
            </Text>
          ) : null}
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Organisation</Text>
            </View>
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

      <Pressable
        style={({ pressed }) => [styles.rowCard, pressed && styles.rowCardPressed]}
        onPress={() => router.push('/(organisation)/info-hub')}
        accessibilityRole="button"
        accessibilityLabel="How V-HUB works"
      >
        <MaterialCommunityIcons name="help-circle-outline" size={22} color={colors.primary} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>How V-HUB works</Text>
          <Text style={styles.rowBody}>
            Matching, applications, V-Score and post-event reviews explained.
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textSecondary} />
      </Pressable>

      {/* Sign Out lives in Settings (the gear above), not here. */}
      <View style={styles.spacer} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    // See the volunteer profile screen: keeps Sign Out clear of the tab bar.
    paddingBottom: spacing.base,
  },
  header: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textPrimary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.base,
    marginBottom: spacing.xl,
  },
  gearButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearPressed: {
    opacity: 0.7,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    // Real space between the logo and the text it labels, rather than the two
    // sitting flush against each other.
    gap: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  identityText: {
    // Takes the remaining width so a long organisation name wraps inside the
    // card instead of pushing the badge off its edge.
    flex: 1,
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
