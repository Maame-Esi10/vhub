import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { VScoreBadge } from '@/components/ui';
import { VOLUNTEER_CATEGORIES } from '@/constants/categories';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { getVScoreBand } from '@/lib/vscore';
import { useAuthStore } from '@/stores/authStore';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface ProfileActionProps {
  icon: IconName;
  title: string;
  body: string;
  accessibilityLabel: string;
  onPress: () => void;
}

/**
 * One of the two actions under the score card.
 *
 * REDESIGNED 2026-09-11. These were thin outlined rows carrying a bare icon, a
 * title and two lines of grey body copy — the same visual weight as a
 * paragraph, so the two places a volunteer actually goes from this screen read
 * as footnotes. They now use the row language the rest of the app already
 * uses: a filled icon tile in the coral tint, a filled surface rather than an
 * outline, real internal padding, and a chevron in its own fixed column.
 *
 * The icon tile is deliberately NOT scaled with the system font: it holds a
 * glyph, not words, and growing it at a large font size only pushes the text
 * it labels into a narrower column.
 */
function ProfileAction({ icon, title, body, accessibilityLabel, onPress }: ProfileActionProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.actionIconTile}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionBody}>{body}</Text>
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={22}
        color={colors.textSecondary}
        style={styles.actionChevron}
      />
    </Pressable>
  );
}

export default function VolunteerProfile() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);

  const categoryLabel = volunteerProfile?.category
    ? (VOLUNTEER_CATEGORIES.find((c) => c.value === volunteerProfile.category)?.label ?? null)
    : null;

  const score = typeof volunteerProfile?.v_score === 'number' ? volunteerProfile.v_score : null;
  const eventsAttended = volunteerProfile?.events_attended ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/*
        THE WHOLE SCREEN SCROLLS, AND IT DID NOT BEFORE.

        This was a plain flex column — header, cards, then a `flex: 1` spacer.
        At the default font size everything happened to fit, so the absence of
        a scroll view was invisible. At a large font size the cards grow, the
        column runs off the bottom of the phone, and the content underneath is
        simply unreachable: there is nothing to scroll.

        It also produced a symptom that looked like a navigation bug rather
        than a layout one. A drag that scrolls nothing is still a press as far
        as the view under the finger is concerned, so swiping up on this screen
        opened My Feedback. Inside a scroll view the drag is claimed by the
        scroller before a Pressable can call it a tap, which is what makes that
        stop happening.
      */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.header}>Profile</Text>
          <Pressable
            onPress={() => router.push('/(volunteer)/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={12}
            style={({ pressed }) => [styles.gearButton, pressed && styles.pressed]}
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

        {score !== null ? (
          /*
            REDESIGNED 2026-09-11. This was a thin outlined row — badge, two
            lines of grey text, chevron — which gave a volunteer's single most
            important number the same weight as a link to a help page.

            It is now the screen's feature card: a filled panel, the band named
            in its own colour by VScoreBadge, and a track showing where the
            score sits on the 0-100 scale the bands are cut from. The track is
            the part that adds information rather than decoration — "78" means
            little on its own; "78, and this is how far along that is" means
            something at a glance, and it is the honest shape for a number that
            is derived from a whole history rather than set directly.
          */
          <Pressable
            style={({ pressed }) => [styles.scoreCard, pressed && styles.pressed]}
            onPress={() => router.push('/(volunteer)/info-hub')}
            accessibilityRole="button"
            accessibilityLabel={`Your V-Score is ${Math.round(score)}, ${getVScoreBand(score)}. Learn how it is calculated.`}
          >
            <View style={styles.scoreHeader}>
              <VScoreBadge score={score} />
              <View style={styles.scoreHeaderText}>
                <Text style={styles.scoreTitle}>Your V-Score</Text>
                <Text style={styles.scoreBody}>
                  {eventsAttended === 1
                    ? 'Based on 1 event so far.'
                    : `Based on ${eventsAttended} events so far.`}
                </Text>
              </View>
            </View>

            <View style={styles.scoreTrack}>
              <View style={[styles.scoreFill, { width: `${Math.max(2, Math.min(100, score))}%` }]} />
            </View>
            <View style={styles.scoreScale}>
              <Text style={styles.scoreScaleEnd}>0</Text>
              <Text style={styles.scoreScaleEnd}>100</Text>
            </View>

            <View style={styles.scoreFooter}>
              <MaterialCommunityIcons name="information-outline" size={16} color={colors.primary} />
              <Text style={styles.scoreFooterText}>See how this is worked out</Text>
            </View>
          </Pressable>
        ) : null}

        <ProfileAction
          icon="message-star-outline"
          title="My Feedback"
          body="Everything organisations have said about your work, in full, including their notes."
          accessibilityLabel="See the feedback organisations have given you"
          onPress={() => router.push('/(volunteer)/feedback')}
        />

        <ProfileAction
          icon="account-edit-outline"
          title="Edit Profile"
          body="Update your details, expertise and weekly availability."
          accessibilityLabel="Edit your professional profile"
          onPress={() => router.push('/(volunteer)/edit-profile')}
        />

        {/*
          Sign Out lives in Settings (the gear above), not here — it is account
          state, and having it on both screens made neither look canonical.
          Info Hub is reached from the V-Score card above, which is the natural
          question ("how was this worked out?") rather than a second row to the
          same place.
        */}
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
    // The tab bar carries the device inset itself (see useTabBarScreenOptions);
    // this is the breathing room above it, and it is generous enough that the
    // last card never ends up under the bar at a large font size.
    paddingBottom: spacing.xxl,
  },
  pressed: {
    opacity: 0.75,
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
    gap: spacing.base,
    marginTop: spacing.base,
    marginBottom: spacing.xl,
  },
  gearButton: {
    width: 40,
    height: 40,
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
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

  // ---- V-Score feature card --------------------------------------------
  scoreCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    // Wrap, so the text drops under the ring at a large font size rather than
    // being squeezed into a column narrower than the words in it.
    flexWrap: 'wrap',
    gap: spacing.base,
  },
  scoreHeaderText: {
    flexGrow: 1,
    flexShrink: 1,
    // A basis rather than 0: below this the text would rather start a new line
    // than keep narrowing, which is what flexWrap needs to be told.
    flexBasis: 140,
  },
  scoreTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  scoreBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },
  scoreTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.lg,
  },
  scoreFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  scoreScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  scoreScaleEnd: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  scoreFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  scoreFooterText: {
    flexShrink: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
  },

  // ---- The two actions --------------------------------------------------
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.base,
  },
  actionIconTile: {
    width: 44,
    height: 44,
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    gap: 2,
  },
  actionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  actionBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  // An icon is a Text node underneath, so without this it is a shrinkable flex
  // item and the arrow clips to a sliver when the row is tight.
  actionChevron: {
    flexGrow: 0,
    flexShrink: 0,
    width: 22,
  },
});
