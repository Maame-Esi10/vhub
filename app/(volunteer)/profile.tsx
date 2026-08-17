import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { VScoreBadge } from '@/components/ui';
import { VOLUNTEER_CATEGORIES } from '@/constants/categories';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';

export default function VolunteerProfile() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);

  const categoryLabel = volunteerProfile?.category
    ? (VOLUNTEER_CATEGORIES.find((c) => c.value === volunteerProfile.category)?.label ?? null)
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Profile</Text>
        <Pressable
          onPress={() => router.push('/(volunteer)/settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={12}
          style={({ pressed }) => [styles.gearButton, pressed && styles.gearPressed]}
        >
          <MaterialCommunityIcons name="cog-outline" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.name}>{profile?.full_name ?? 'Volunteer'}</Text>
        {profile?.email ? <Text style={styles.email}>{profile.email}</Text> : null}
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Volunteer</Text>
          </View>
          {categoryLabel ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{categoryLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {typeof volunteerProfile?.v_score === 'number' ? (
        <Pressable
          style={({ pressed }) => [styles.vScoreCard, pressed && styles.vScoreCardPressed]}
          onPress={() => router.push('/(volunteer)/info-hub')}
          accessibilityRole="button"
          accessibilityLabel="Your V-Score. Learn how it is calculated."
        >
          <VScoreBadge score={volunteerProfile.v_score} />
          <View style={styles.vScoreText}>
            <Text style={styles.vScoreTitle}>Your V-Score</Text>
            <Text style={styles.vScoreBody}>
              {volunteerProfile.events_attended === 1
                ? 'Based on 1 event so far.'
                : `Based on ${volunteerProfile.events_attended} events so far.`}{' '}
              Tap to see how it&apos;s worked out.
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textSecondary} />
        </Pressable>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.rowCard, pressed && styles.rowCardPressed]}
        onPress={() => router.push('/(volunteer)/feedback')}
        accessibilityRole="button"
        accessibilityLabel="See the feedback organisations have given you"
      >
        <MaterialCommunityIcons name="message-star-outline" size={22} color={colors.primary} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>My Feedback</Text>
          <Text style={styles.rowBody}>
            Everything organisations have said about your work, in full, including their notes.
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textSecondary} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.rowCard, pressed && styles.rowCardPressed]}
        onPress={() => router.push('/(volunteer)/edit-profile')}
        accessibilityRole="button"
        accessibilityLabel="Edit your professional profile"
      >
        <MaterialCommunityIcons name="account-edit-outline" size={22} color={colors.primary} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Edit Profile</Text>
          <Text style={styles.rowBody}>
            Update your details, expertise and weekly availability.
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textSecondary} />
      </Pressable>

      {/*
        Sign Out lives in Settings (the gear above), not here — it is account
        state, and having it on both screens made neither look canonical.
        Info Hub is reached from the V-Score card above, which is the natural
        question ("how was this worked out?") rather than a second row to the
        same place.
      */}
      <View style={styles.spacer} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    // Sign Out is the last thing in this column and was sitting flush against
    // the bottom of the content area, leaving it visually pinched against the
    // tab bar / gesture area. The tab bar itself now carries the device inset
    // (see useTabBarScreenOptions); this is the breathing room above it.
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
  vScoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginTop: spacing.base,
  },
  vScoreCardPressed: {
    opacity: 0.8,
  },
  vScoreText: {
    flex: 1,
  },
  vScoreTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  vScoreBody: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
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
