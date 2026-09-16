import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar, SettingsRow } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { tabBarClearance } from '@/components/ui/tabBarOptions';

export default function OrganisationProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/*
        THE WHOLE SCREEN SCROLLS, AND IT DID NOT BEFORE. Same defect as the
        volunteer Profile tab and the same cause: a plain flex column with a
        `flex: 1` spacer at the bottom, which fits at the default font size and
        runs off the phone at a large one with nothing to scroll. A drag that
        scrolls nothing still reads as a press to the card under the finger, so
        trying to reach the bottom opened whichever row was beneath the thumb.
      */}
      <ScrollView contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarClearance(insets.bottom) },
        ]} showsVerticalScrollIndicator={false}>
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
      {/*
        THE SAME IDENTITY HEADER AS THE VOLUNTEER SIDE (owner, 2026-09-16).
        This was a bordered card with the badges tucked inside it; the
        volunteer's is a plain row with the badges underneath. Two designs for
        the same thing on the two Profile screens, and no reason for either.

        The volunteer's shape won because it is the better one: an avatar-led
        row needs no container to read as a header, and putting the badges on
        their own line stops the name column being squeezed by them.
      */}
      <View style={styles.identity}>
        <Avatar name={profile?.full_name ?? 'Organisation'} uri={profile?.avatar_url} size={64} />
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={2}>
            {profile?.full_name ?? 'Organisation'}
          </Text>
          {profile?.email ? (
            <Text style={styles.email} numberOfLines={1}>
              {profile.email}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Organisation</Text>
        </View>
      </View>

      {/*
        SETTINGS ROWS, the standard across the app now. These were bespoke
        two-line cards that existed only here, so the organisation side carried
        a different treatment from the volunteer side for identical controls.
        The supporting sentences went with them: a row that says "Edit Profile"
        beside a pencil does not need a sentence explaining that it edits the
        profile.
      */}
      <View style={styles.actions}>
        <SettingsRow
          icon="account-edit-outline"
          label="Edit Profile"
          onPress={() => router.push('/(organisation)/edit-profile')}
        />
        <SettingsRow
          icon="help-circle-outline"
          label="How VHub works"
          onPress={() =>
            router.push({
              pathname: '/(organisation)/info-hub',
              params: { from: '/(organisation)/profile' },
            })
          }
        />
      </View>

      {/* Sign Out lives in Settings (the gear above), not here. */}
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
    // The tab bar carries the device inset itself; this is the room above it,
    // generous enough that the last card clears the bar at a large font size.
    paddingBottom: spacing.xxl,
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
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    // alignItems centres children within their line; alignContent places the
    // line itself and defaults to flex-start, so a wrapping row pins to the top.
    alignContent: 'center',
    flexWrap: 'wrap',
    rowGap: spacing.md,
    gap: spacing.base,
  },
  actions: {
    marginTop: spacing.xl,
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
});
