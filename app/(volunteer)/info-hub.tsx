import { useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlanceGrid, RoleTypeExplainer, ScreenHeader } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { LAYER1_WEIGHTS } from '@/lib/matching/layer1';
import { NEW_VOLUNTEER_V_SCORE, V_SCORE_BANDS, V_SCORE_PENALTIES } from '@/lib/vscore';
import { useAuthStore } from '@/stores/authStore';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

// Collapsing a section without this is an instant jump on Android.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Info Hub — the plain-language explanation of the two numbers VHub shows
 * volunteers: their match score on each outreach, and their V-Score.
 *
 * Every figure here is read from the same constants the engine actually uses
 * (`LAYER1_WEIGHTS`, `V_SCORE_BANDS`, `V_SCORE_PENALTIES`) rather than typed
 * into the copy. If the spec ever changes, this screen cannot silently go
 * stale and start explaining a scoring system the app no longer runs.
 */
export default function InfoHub() {
  // The floating tab bar is absolute and reserves no space, so the last
  // element needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/*
        This screen is pushed from the profile tab and covers the tab bar, so
        without a back control there is no way off it at all.
      */}
      <ScreenHeader title="Info Hub" fallback="/(volunteer)/profile" />
      <ScrollView contentContainerStyle={[styles.content, tabBarPadding]}>
        <Text style={styles.title}>How VHub works</Text>
        <Text style={styles.intro}>
          Four things decide what you see and who picks you. None of them is a judgement of you as a
          person.
        </Text>

        {/*
          THE MAP, BEFORE THE DETAIL. The sections below are collapsed, which
          made this screen a table of contents written as furniture: you had to
          open things to find out whether it answered your question, so somebody
          unsure what they wanted opened nothing and left.
        */}
        <GlanceGrid
          items={[
            { icon: 'target', term: 'Match score', meaning: 'How well an event fits you, out of 100' },
            { icon: 'shield-check-outline', term: 'V-Score', meaning: 'How dependable you have been' },
            { icon: 'stethoscope', term: 'Clinical work', meaning: 'Hands-on care. Needs verification' },
            { icon: 'account-group-outline', term: 'Support work', meaning: 'Runs the event. Open to all' },
          ]}
        />

        {/*
          THE DISTINCTION MOST OFTEN GOT WRONG, so it opens first and is drawn
          rather than written. Both words had only ever appeared beside
          verification, which taught everyone that clinical means verified and
          support means unverified.
        */}
        <Section
          icon="compare-horizontal"
          title="Clinical or support?"
          subtitle="What the work is, not who may do it"
          defaultOpen
        >
          <RoleTypeExplainer audience="volunteer" />
        </Section>

        <Section
          icon="target"
          title="Your match score"
          subtitle="Shown on every outreach in your feed"
          defaultOpen
        >
          <Text style={styles.body}>
            When you open your feed, every open outreach is scored out of 100 for how well it fits
            you specifically. The highest scores appear first, so the events worth your time are at
            the top rather than buried.
          </Text>
          <Text style={styles.body}>
            Five things go into it, and each is worth a fixed number of points:
          </Text>

          <WeightRow
            label="Skills"
            weight={LAYER1_WEIGHTS.skills}
            detail="How much of what the event needs you already have listed on your profile."
          />
          <WeightRow
            label="Profession"
            weight={LAYER1_WEIGHTS.category}
            detail="Full points if the role asks for your profession, half if it asks for a closely related one. A nurse counts partly towards a midwife role, for example."
          />
          <WeightRow
            label="Location"
            weight={LAYER1_WEIGHTS.location}
            detail="Full points in your own district, half anywhere else in your region."
          />
          <WeightRow
            label="Availability"
            weight={LAYER1_WEIGHTS.availability}
            detail="Full points when the event falls in a slot you marked free. Over several days you are scored on how many you can make, with full points at half or more."
          />
          <WeightRow
            label="Experience"
            weight={LAYER1_WEIGHTS.experience}
            detail="Your experience level, from beginner through to experienced."
          />

          <View style={styles.callout}>
            <MaterialCommunityIcons name="creation" size={16} color={colors.primary} />
            <Text style={styles.calloutText}>
              Skills are also compared for meaning, not just spelling. If you wrote “blood draw” and
              an event asks for “venipuncture”, that still counts as a match. When that comparison
              isn&apos;t available, VHub falls back to exact wording, so your feed is always ranked,
              never blank.
            </Text>
          </View>

          <Text style={styles.body}>
            Tap the match percentage on any outreach card to see your own breakdown for that event.
            A low score usually points at something fixable: a skill you haven&apos;t added yet, or
            an availability slot you left unticked.
          </Text>
        </Section>

        <Section
          icon="shield-check-outline"
          title="Your V-Score"
          subtitle={
            typeof volunteerProfile?.v_score === 'number'
              ? `Yours is ${Math.round(volunteerProfile.v_score)} right now`
              : 'Your reliability record'
          }
        >
          <Text style={styles.body}>
            Your V-Score is a 0 to 100 measure of how dependable you are once you&apos;ve committed to an
            event. Organisations see it when they review your application, so it is the main thing
            that builds trust before anyone has met you.
          </Text>
          <Text style={styles.body}>
            Everyone starts at {NEW_VOLUNTEER_V_SCORE}. After each event you work, the organisation
            reviews you on whether you showed up, how reliable you were, and for clinical roles,
            the quality of your clinical work. That result is blended in gently: your new score keeps
            70% of your existing record and 30% of the latest event, so one bad day never wipes out
            months of good work, and one great day doesn&apos;t hide a poor track record.
          </Text>

          <Text style={styles.subheading}>The bands</Text>
          {V_SCORE_BANDS.map((band) => (
            <BandRow key={band.band} band={band.band} min={band.min} />
          ))}

          <Text style={styles.subheading}>What costs you points</Text>
          <PenaltyRow
            label="Not showing up"
            points={V_SCORE_PENALTIES.no_show}
            detail="Accepting a place and then not arriving. This is the one that hurts. An organisation planned staffing around you."
          />
          <PenaltyRow
            label="Withdrawing late"
            points={V_SCORE_PENALTIES.late_cancellation}
            detail="Pulling out within 24 hours of the start, when there is little time to find cover."
          />
          <PenaltyRow
            label="Withdrawing in good time"
            points={V_SCORE_PENALTIES.on_time_cancellation}
            detail="Pulling out more than 24 hours ahead. Small, deliberately. Plans change, and telling someone early is the responsible thing to do."
          />

          <View style={styles.callout}>
            <MaterialCommunityIcons name="lightbulb-on-outline" size={16} color={colors.primary} />
            <Text style={styles.calloutText}>
              If you can&apos;t make an event, withdraw as early as you can. It costs you far less than
              a no-show, and it gives the organisation time to offer your place to someone on the
              waitlist.
            </Text>
          </View>
        </Section>

        <Section icon="account-check-outline" title="Verification" subtitle="What it unlocks">
          <Text style={styles.body}>
            You can browse every outreach and join support roles without verifying your identity.
            Clinical roles are different: they need a verified profile before you can submit a full
            application, because the organisation is accountable for who provides care on the day.
          </Text>
          <Text style={styles.body}>
            Verification doesn&apos;t change your match score or your V-Score. It only decides which
            roles you are eligible to apply for.
          </Text>
        </Section>

        <Section icon="lock-outline" title="Your data" subtitle="Who can see what">
          <Text style={styles.body}>
            Your phone number and email are only visible to an organisation once you have actually
            applied to one of their outreaches. Before that, they can see the same public profile any
            other volunteer can: your name, profession, skills, region and V-Score.
          </Text>
          <Text style={styles.body}>
            Scores are calculated on VHub&apos;s servers, never on your phone, and neither you nor an
            organisation can edit a V-Score directly.
          </Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

interface SectionProps {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ icon, title, subtitle, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen((value) => !value);
        }}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
      >
        <View style={styles.sectionIcon}>
          <MaterialCommunityIcons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={colors.textSecondary}
        />
      </Pressable>

      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function WeightRow({ label, weight, detail }: { label: string; weight: number; detail: string }) {
  return (
    <View style={styles.weightRow}>
      <View style={styles.weightPill}>
        <Text style={styles.weightPillText}>{weight}</Text>
      </View>
      <View style={styles.weightText}>
        <Text style={styles.weightLabel}>{label}</Text>
        <Text style={styles.weightDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function BandRow({ band, min }: { band: string; min: number }) {
  return (
    <View style={styles.bandRow}>
      <Text style={styles.bandName}>{band}</Text>
      <Text style={styles.bandRange}>{min === 0 ? 'below 40' : `${min} and above`}</Text>
    </View>
  );
}

function PenaltyRow({ label, points, detail }: { label: string; points: number; detail: string }) {
  return (
    <View style={styles.weightRow}>
      <View style={[styles.weightPill, styles.penaltyPill]}>
        <Text style={[styles.weightPillText, styles.penaltyPillText]}>{points}</Text>
      </View>
      <View style={styles.weightText}>
        <Text style={styles.weightLabel}>{label}</Text>
        <Text style={styles.weightDetail}>{detail}</Text>
      </View>
    </View>
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
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textPrimary,
    marginTop: spacing.base,
  },
  intro: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  section: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
  },
  pressed: {
    opacity: 0.8,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionBody: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  subheading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  weightRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  weightPill: {
    minWidth: 36,
    height: 26,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
  },
  weightPillText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: colors.primary,
  },
  penaltyPill: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  penaltyPillText: {
    color: colors.danger,
  },
  weightText: {
    flex: 1,
  },
  weightLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  weightDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // Wraps instead of clipping when the row outgrows its width at a large
    // system font size. rowGap only applies between wrapped lines, so a row
    // that still fits on one is unaffected.
    flexWrap: 'wrap',
    rowGap: 4,
    alignItems: 'center',

    // alignItems centres children within their line; alignContent places
    // the line itself, and defaults to flex-start. Without it a wrapping row
    // pins its single line to the TOP of the box.
    alignContent: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bandName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  bandRange: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  callout: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  calloutText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
});
