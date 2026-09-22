import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Avatar, SettingsGroupLabel, SettingsRow, SignOutButton } from '@/components/ui';
import { VScoreCard } from '@/components/volunteer';
import { VOLUNTEER_CATEGORIES } from '@/constants/categories';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

/**
 * Profile AND Settings, on one screen.
 *
 * MERGED 2026-09-22 (owner: "a major change, I want the profile and settings to
 * be one... the separated is kind of a mess"). She is right, and the mess had a
 * specific shape: the two screens held the same identity header twice, at two
 * different sizes, and the split between them was never defensible. Identity
 * Verification is arguably profile; Edit Profile is arguably settings; My
 * Feedback is neither. Every row needed an argument about which of two screens
 * it belonged on, and those arguments are recorded in the git history because
 * several of them were had more than once.
 *
 * THE ORDER IS HERS AND IT IS THE RIGHT ONE: who you are, then your number,
 * then everything you can change. It reads as one page about this volunteer
 * rather than as a profile with a settings screen hidden behind a gear in the
 * corner, which is what it was.
 *
 * WHAT WENT: the gear button, because there is nowhere for it to go; the second
 * identity block, because one is enough; and the 88px avatar that used to head
 * Settings, because it duplicated the 64px one here.
 *
 * WHAT STAYED IN ITS OWN SCREEN: Edit Profile, Account & Security, Identity
 * Verification, notification settings, the policy and My Feedback. Merging two
 * screens that held only rows is not an argument for inlining the forms those
 * rows lead to.
 */
export default function VolunteerProfile() {
  // The floating tab bar is absolute and reserves no space, so the last element
  // needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);

  const categoryLabel = volunteerProfile?.category
    ? (VOLUNTEER_CATEGORIES.find((c) => c.value === volunteerProfile.category)?.label ?? null)
    : null;

  const score = typeof volunteerProfile?.v_score === 'number' ? volunteerProfile.v_score : null;
  const eventsAttended = volunteerProfile?.events_attended ?? 0;

  const verificationLabel =
    volunteerProfile?.verification_status === 'verified'
      ? 'Verified'
      : volunteerProfile?.verification_status === 'documents_pending'
        ? 'In review'
        : 'Not verified';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/*
        THE WHOLE SCREEN SCROLLS, and it must: this page is now roughly twice
        as long as either screen it replaces, and at a large system font size a
        plain flex column would run off the bottom with nothing to scroll. A
        drag that scrolls nothing is still a press to the view under the finger,
        so reaching for the bottom would open whichever row was under the thumb.
      */}
      <ScrollView
        contentContainerStyle={[styles.content, tabBarPadding]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.header}>Profile</Text>

        {/*
          THE IDENTITY HEADER. An avatar-led row needs no container to read as a
          header, and the photo and two text lines sit side by side rather than
          stacked, so it costs nothing in height. The tick is drawn only for
          'verified', never for 'documents_pending', which is a wait rather than
          a decision.
        */}
        <View style={styles.identity}>
          <Avatar
            name={profile?.full_name ?? 'Volunteer'}
            uri={profile?.avatar_url}
            size={64}
            verified={volunteerProfile?.verification_status === 'verified'}
          />
          <View style={styles.identityText}>
            <Text style={styles.name}>{profile?.full_name ?? 'Volunteer'}</Text>
            {profile?.email ? (
              <Text style={styles.email} numberOfLines={1}>
                {profile.email}
              </Text>
            ) : null}
          </View>
        </View>

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

        {score !== null ? (
          <VScoreCard
            score={score}
            eventsAttended={eventsAttended}
            onPress={() =>
              router.push({
                pathname: '/(volunteer)/info-hub',
                params: { from: '/(volunteer)/profile' },
              })
            }
          />
        ) : null}

        <SettingsGroupLabel>YOUR PROFILE</SettingsGroupLabel>
        {/*
          EDIT PROFILE LEADS, and not merely as a preference: it is the only
          control on this screen that changes a volunteer's outcomes, because
          skills, specialties and availability are three of the five matching
          components. My Feedback is a record of what has already happened.
          Active above passive.
        */}
        <SettingsRow
          icon="account-edit-outline"
          label="Edit Profile"
          value="Skills, specialties, availability and contact details"
          onPress={() =>
            router.push({
              pathname: '/(volunteer)/edit-profile',
              params: { from: '/(volunteer)/profile' },
            })
          }
        />
        {/*
          `star-box-outline`, not `message-star-outline`: the old glyph was a
          speech bubble, which reads as messages the volunteer can reply to.
          Feedback here is a record written about them that they can only read.
        */}
        <SettingsRow
          icon="star-box-outline"
          label="My Feedback"
          value="Reviews organisations have written, and any deductions"
          onPress={() =>
            router.push({
              pathname: '/(volunteer)/feedback',
              params: { from: '/(volunteer)/profile' },
            })
          }
        />
        {/*
          Points at app/(volunteer)/verify-identity.tsx, NOT the (auth) screen of
          the same name. That one is a step of the onboarding wizard and submits
          useOnboardingStore, which is empty outside the wizard -- linking there
          would blank a volunteer's saved category, skills, specialties and
          availability.
        */}
        <SettingsRow
          icon="shield-check-outline"
          label="Identity Verification"
          value={verificationLabel}
          onPress={() =>
            router.push({
              pathname: '/(volunteer)/verify-identity',
              params: { from: '/(volunteer)/profile' },
            })
          }
        />

        <SettingsGroupLabel>ACCOUNT</SettingsGroupLabel>
        {/*
          A fixed short label, not the email address: the address is shown on
          the screen this opens, where it has room.
        */}
        <SettingsRow
          icon="lock-outline"
          label="Account & Security"
          value="Login email and password"
          onPress={() => router.push('/(volunteer)/account-security')}
        />
        {/*
          A SECOND DOOR TO THE SAME SCREEN (owner, 2026-09-21: "where is delete
          account? I cannot find it"). It was never missing -- it is the last
          block on Account & Security, so finding it meant knowing that closing
          an account is filed as a security matter and scrolling past two forms.

          Deliberately NOT called "Delete": closure anonymises the person and
          revokes the login while keeping the record of work, and calling that a
          deletion would be a promise the app does not keep. The value line says
          what really happens, so the row is findable without being untrue.
        */}
        <SettingsRow
          icon="account-remove-outline"
          label="Close Account"
          value="Remove your details and leave VHub"
          onPress={() => router.push('/(volunteer)/account-security')}
        />
        {/*
          POINTS AT SETTINGS, NOT AT THE INBOX (owner, 2026-09-21). A row under
          a preferences heading that opened a list of messages was the bug.
        */}
        <SettingsRow
          icon="bell-outline"
          label="Notifications"
          value="Push notifications on this device"
          onPress={() => router.push('/(volunteer)/notification-settings')}
        />

        <SettingsGroupLabel>ABOUT</SettingsGroupLabel>
        <SettingsRow
          icon="information-outline"
          label="How VHub works"
          value="Matching, the V-Score, and what verification is for"
          onPress={() =>
            router.push({
              pathname: '/(volunteer)/info-hub',
              params: { from: '/(volunteer)/profile' },
            })
          }
        />
        <SettingsRow
          icon="shield-lock-outline"
          label="Privacy Policy"
          value="What VHub knows, and what it never keeps"
          onPress={() => router.push('/policy?from=/(volunteer)/profile')}
        />
        <SettingsRow
          icon="file-document-outline"
          label="Terms of Use"
          value="What you and organisations each promise"
          onPress={() => router.push('/policy?tab=terms&from=/(volunteer)/profile')}
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
    // Takes the room left by the avatar and wraps within it, rather than
    // pushing the row wider than the screen at a large system font size.
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
    // Wraps rather than overflowing: two category chips at a large font size
    // are wider than a phone, and a chip half off the screen reads as damage.
    flexWrap: 'wrap',
    gap: spacing.sm,
    // Sits WITH the identity header, so it keeps the tighter within-section gap.
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
