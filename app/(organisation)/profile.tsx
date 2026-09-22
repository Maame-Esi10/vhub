import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Avatar, SettingsGroupLabel, SettingsRow, SignOutButton } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useMyOrganisationProfile } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

/** What the verification row says, per state. */
const VERIFICATION_ROW_VALUE: Record<string, string> = {
  unverified: 'Not submitted',
  documents_submitted: 'Waiting on review',
  verified: 'Verified',
  rejected: 'Not approved, tap to fix',
  suspended: 'Suspended',
  banned: 'Removed',
};

/**
 * Profile AND Settings, on one screen. The organisation twin of the volunteer
 * merge, done in the same pass and for the same reason (owner, 2026-09-22:
 * "the separated is kind of a mess").
 *
 * The split was worse here than on the volunteer side, because the two screens
 * disagreed about what an organisation IS: Profile showed the name from
 * `profiles.full_name`, Settings showed it from
 * `organisation_profiles.org_name`, and those are different columns that can
 * legitimately hold different strings. One identity header now reads one of
 * them, and `org_name` wins because it is the name volunteers see on an
 * outreach.
 *
 * THERE IS NO V-SCORE HERE, and the screen says so by its shape rather than by
 * leaving a hole where the volunteer's card sits. An organisation has no score:
 * `event_reviews` runs one way only, and whether organisations should be rated
 * in return is an open question recorded in docs/REPORT_NOTES.md. What takes
 * that position instead is verification, which is the organisation's equivalent
 * standing and the thing volunteers actually judge an outreach by.
 */
export default function OrganisationProfile() {
  // The floating tab bar is absolute and reserves no space, so the last element
  // needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const org = useMyOrganisationProfile(profile?.id).data;

  const displayName = org?.org_name ?? profile?.full_name ?? 'Organisation';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/*
        THE WHOLE SCREEN SCROLLS. At a large system font size a plain flex
        column runs off the bottom with nothing to scroll, and a drag that
        scrolls nothing is still a press to the view under the finger, so
        reaching for the bottom opens whichever row is under the thumb.
      */}
      <ScrollView
        contentContainerStyle={[styles.content, tabBarPadding]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.header}>Profile</Text>

        <View style={styles.identity}>
          <Avatar
            name={displayName}
            uri={profile?.avatar_url}
            size={64}
            verified={org?.verified === true}
          />
          <View style={styles.identityText}>
            <Text style={styles.name} numberOfLines={2}>
              {displayName}
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
          {org?.org_type ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{org.org_type}</Text>
            </View>
          ) : null}
        </View>

        <SettingsGroupLabel>YOUR ORGANISATION</SettingsGroupLabel>
        <SettingsRow
          icon="account-edit-outline"
          label="Edit Profile"
          value="Logo, description, contact details and location"
          onPress={() =>
            router.push({
              pathname: '/(organisation)/edit-profile',
              params: { from: '/(organisation)/profile' },
            })
          }
        />
        {/*
          `verified` is a STORED GENERATED COLUMN derived from
          verification_state, so Postgres refuses a write to it outright and
          nothing here could set it even by mistake. What this row opens is the
          SUBMISSION: the organisation sends its evidence and an admin decides.
        */}
        <SettingsRow
          icon="shield-check-outline"
          label="Organisation Verification"
          value={VERIFICATION_ROW_VALUE[org?.verification_state ?? 'unverified']}
          onPress={() =>
            router.push({
              pathname: '/(organisation)/verification',
              params: { from: '/(organisation)/profile' },
            })
          }
        />

        <SettingsGroupLabel>ACCOUNT</SettingsGroupLabel>
        {/* Short fixed label, not the address: the screen this opens has room for it. */}
        <SettingsRow
          icon="lock-outline"
          label="Account & Security"
          value="Login email and password"
          onPress={() => router.push('/(organisation)/account-security')}
        />
        {/*
          A SECOND DOOR TO THE SAME SCREEN (owner, 2026-09-21: "where is delete
          account? I cannot find it"). Deliberately NOT called "Delete":
          closure anonymises and revokes while keeping the record of work, and
          calling that a deletion would be a promise the app does not keep.
        */}
        <SettingsRow
          icon="account-remove-outline"
          label="Close Account"
          value="Remove your details and leave VHub"
          onPress={() => router.push('/(organisation)/account-security')}
        />
        {/*
          POINTS AT SETTINGS, NOT AT THE INBOX (owner, 2026-09-21). A row under
          a preferences heading that opened a list of messages was the bug.
        */}
        <SettingsRow
          icon="bell-outline"
          label="Notifications"
          value="Push notifications on this device"
          onPress={() => router.push('/(organisation)/notification-settings')}
        />

        <SettingsGroupLabel>ABOUT</SettingsGroupLabel>
        <SettingsRow
          icon="information-outline"
          label="How VHub works"
          value="Matching, the V-Score, and what verification is for"
          onPress={() =>
            router.push({
              pathname: '/(organisation)/info-hub',
              params: { from: '/(organisation)/profile' },
            })
          }
        />
        <SettingsRow
          icon="shield-lock-outline"
          label="Privacy Policy"
          value="What VHub knows, and what it never keeps"
          onPress={() => router.push('/policy?from=/(organisation)/profile')}
        />
        <SettingsRow
          icon="file-document-outline"
          label="Terms of Use"
          value="What you and organisations each promise"
          onPress={() => router.push('/policy?tab=terms&from=/(organisation)/profile')}
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
  header: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textPrimary,
    marginTop: spacing.base,
    marginBottom: spacing.xl,
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
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
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
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
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
  signOutBlock: {
    marginTop: spacing.xl,
  },
});
