import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';

export default function OnboardingComplete() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const firstName = profile?.full_name?.trim().split(' ')[0] || 'volunteer';

  function goToFeed() {
    router.replace('/(volunteer)/feed');
  }

  function goToProfile() {
    router.replace('/(volunteer)/profile');
  }

  function handleShare() {
    Share.share({
      message: "I just joined V-HUB to volunteer at medical outreaches across Ghana. Join me!",
    }).catch(() => {
      // no-op: share sheet dismissal/failure isn't actionable here
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Pressable onPress={goToFeed} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close">
          <MaterialCommunityIcons name="close" size={18} color={colors.white} />
        </Pressable>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>V-HUB COMMUNITY</Text>
        </View>
        <View style={styles.heroSpacer} />
        <Text style={styles.heroTitle}>You're Ready!</Text>
        <Text style={styles.heroSubtitle}>
          Welcome to the team, <Text style={styles.heroName}>{firstName}!</Text>
        </Text>
        <Text style={styles.heroCaption}>Your profile is active.</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.bodyText}>
          You're now part of a collective mission to transform healthcare through volunteerism.
        </Text>

        <Button
          title="Find Your First Opportunity"
          variant="solid"
          onPress={goToFeed}
          style={styles.primaryButton}
        />

        <View style={styles.secondaryRow}>
          <Button
            title="View Profile"
            variant="outline"
            onPress={goToProfile}
            style={styles.viewProfileButton}
          />
          <Pressable onPress={handleShare} style={styles.shareButton} accessibilityRole="button" accessibilityLabel="Share">
            <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerTrack}>
            <View style={styles.footerFill} />
          </View>
          <Text style={styles.footerText}>START YOUR IMPACT</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    minHeight: 320,
    backgroundColor: colors.heroBackground,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    justifyContent: 'flex-end',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.xl,
    left: spacing.xl,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  heroBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.white,
  },
  heroSpacer: {
    flex: 1,
  },
  heroTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: colors.white,
  },
  heroSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.white,
    marginTop: spacing.sm,
  },
  heroName: {
    color: colors.primary,
    fontFamily: fontFamily.semiBold,
  },
  heroCaption: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: spacing.xs,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  bodyText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  primaryButton: {
    width: '100%',
    marginBottom: spacing.sm,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  viewProfileButton: {
    flex: 1,
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    alignItems: 'center',
    marginTop: 'auto',
    paddingBottom: spacing.xl,
  },
  footerTrack: {
    width: 120,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  footerFill: {
    width: '20%',
    height: '100%',
    backgroundColor: colors.primary,
  },
  footerText: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.textSecondary,
  },
});
