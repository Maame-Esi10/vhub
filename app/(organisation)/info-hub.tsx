import {
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InfoBandRow,
  InfoBody,
  InfoCallout,
  InfoSection,
  InfoTopics,
  InfoSubheading,
  InfoWeightRow,
  ScreenHeader, RoleTypeExplainer } from '@/components/ui';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { LAYER1_WEIGHTS } from '@/lib/matching/layer1';
import { NEW_VOLUNTEER_V_SCORE, V_SCORE_BANDS } from '@/lib/vscore';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

/**
 * Organisation Info Hub — the same explanation the volunteer hub gives, told
 * from the other side of the match: what the ranking on your applicant list
 * means, what a V-Score does and does not tell you, and how your post-event
 * review feeds back into it.
 *
 * NOTE: design-refs/ has no organisation Info Hub — `Info Hub.png` is the
 * volunteer screen. This is built from that screen's components
 * (components/ui/InfoSection.tsx, shared by both) so the two cannot drift.
 *
 * As on the volunteer side, every figure is read from the constants the
 * engine actually uses (`LAYER1_WEIGHTS`, `V_SCORE_BANDS`) rather than typed
 * into the copy, so this screen cannot silently start explaining a scoring
 * system the app no longer runs.
 */
export default function OrganisationInfoHub() {
  // The floating tab bar is absolute and reserves no space, so the last
  // element needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Info Hub" fallback="/(organisation)/profile" />
      <ScrollView contentContainerStyle={[styles.content, tabBarPadding]}>
        <Text style={styles.title}>How VHub works</Text>
        <Text style={styles.intro}>
          VHub ranks the volunteers who apply. Here is what the numbers mean, so you can weigh them
          against your own judgement.
        </Text>

        {/*
          THE MAP, BEFORE THE DETAIL. Every section below is collapsed, so
          without this the screen is a table of contents written as furniture.
        */}
        {/*
          THE GLANCE GRID IS GONE (owner, 2026-09-16: "the four boxes at the
          top are followed by explanations... each explanation should sit under
          its own box").

          That split was the grid's own fault. It named four concepts in two
          words each and the sections below then explained them -- in a
          different order, several screens apart, so the reader had to carry
          four terms down the page and match them up. A map is only worth
          having when the territory is far away; here every section header IS
          the term, and its body IS the explanation, directly underneath.

          It also removes the second card design from a screen that was
          supposed to have one.
        */}
        {/*
          ONE TOPIC OPEN AT A TIME, CHOSEN FROM A RAIL. See InfoTopics:
          five collapsed cards meant the screen somebody opens to have
          something explained opened with no explanation on it.
        */}
        <InfoTopics>
        <InfoSection
          icon="compare-horizontal"
          title="Clinical or support?"
          subtitle="Choose by what the work is"
        >
          <RoleTypeExplainer audience="organisation" />
        </InfoSection>

        <InfoSection
          icon="target"
          title="How volunteers are matched"
          subtitle="The score beside every applicant"
        >
          <InfoBody>
            Every volunteer who applies is scored out of 100 for how well they fit that specific
            outreach. Your applicant list is ordered by it, so the strongest fits are at the top
            rather than whoever happened to apply first.
          </InfoBody>
          <InfoBody>
            Five things go into it, each worth a fixed number of points:
          </InfoBody>

          <InfoWeightRow
            label="Skills"
            value={LAYER1_WEIGHTS.skills}
            detail="How much the volunteer's skills overlap with the skills you listed on the outreach."
          />
          <InfoWeightRow
            label="Category"
            value={LAYER1_WEIGHTS.category}
            detail="Whether their profession matches the category you asked for. A related profession scores half."
          />
          <InfoWeightRow
            label="Location"
            value={LAYER1_WEIGHTS.location}
            detail="Same district as the outreach scores full; same region scores half."
          />
          <InfoWeightRow
            label="Availability"
            value={LAYER1_WEIGHTS.availability}
            detail="Whether they marked themselves free on the day and time your outreach runs."
          />
          <InfoWeightRow
            label="Experience"
            value={LAYER1_WEIGHTS.experience}
            detail="Their self-declared experience level: experienced, intermediate or beginner."
          />

          <InfoCallout icon="lightbulb-outline">
            The clearer your outreach listing, the better the ranking. Vague or empty required
            skills give the scorer nothing to match on, which flattens the ranking and pushes the
            work back onto you.
          </InfoCallout>

          <InfoSubheading>Why two volunteers can word the same skill differently</InfoSubheading>
          <InfoBody>
            VHub also checks whether differently-worded skills mean the same thing, so &quot;venipuncture&quot;
            and &quot;blood draw&quot; both count, and a good candidate is not missed on vocabulary alone.
            If that check is ever unavailable, matching quietly falls back to exact skill overlap
            and keeps working; it never blocks an application.
          </InfoBody>
        </InfoSection>

        <InfoSection
          icon="file-document-outline"
          title="Quick Join and Full Applications"
          subtitle="The two ways volunteers apply"
        >
          <InfoBody>
            <Text style={styles.strong}>Quick Join</Text> is a one-tap application. It suits
            support-role outreaches where you mainly need hands and reliability.
          </InfoBody>
          <InfoBody>
            <Text style={styles.strong}>Full Application</Text> asks the volunteer for more detail
            about why they fit. Use it when you need to read something about the person before
            deciding.
          </InfoBody>

          <InfoSubheading>The verification gate</InfoSubheading>
          <InfoBody>
            If you mark an outreach as a <Text style={styles.strong}>clinical</Text> role, only
            volunteers who have completed identity verification can submit a Full Application to
            it. Support-role outreaches never require verification. This is enforced by the
            database, not just the app. An unverified volunteer cannot get into a clinical
            outreach by any route.
          </InfoBody>
          <InfoCallout>
            Marking a genuinely clinical outreach as support-role to widen your applicant pool
            removes that protection. Set the role type to what the work actually is.
          </InfoCallout>
        </InfoSection>

        <InfoSection
          icon="shield-check-outline"
          title="Reading a volunteer's V-Score"
          subtitle="What it does and doesn't tell you"
        >
          <InfoBody>
            Every volunteer carries a V-Score out of 100. It is a reliability signal built from
            what they have actually done on past outreaches: attendance, and the reliability and
            clinical ratings organisations gave them afterwards.
          </InfoBody>
          <InfoBody>
            Everyone starts at {NEW_VOLUNTEER_V_SCORE}. A new volunteer with no history is not a
            risky one. They simply have no record yet.
          </InfoBody>

          <InfoSubheading>The bands</InfoSubheading>
          {V_SCORE_BANDS.map((entry) => (
            <InfoBandRow
              key={entry.band}
              label={entry.band}
              value={entry.min === 0 ? 'below 40' : `${entry.min} and above`}
            />
          ))}

          <InfoCallout icon="alert-outline">
            A V-Score measures showing up and following through. It is not a measure of clinical
            competence, and it should never be the only thing you decide on. Read the profile and
            the application too.
          </InfoCallout>
        </InfoSection>

        <InfoSection
          icon="star-outline"
          title="Your post-event reviews"
          subtitle="How your rating moves a volunteer's score"
        >
          <InfoBody>
            After an outreach finishes, you review each volunteer who was accepted: whether they
            attended, and a 1 to 5 rating for reliability and (for clinical roles) clinical work.
          </InfoBody>
          <InfoBody>
            That review is what moves their V-Score. The new score is mostly their existing history
            with your review blended in, so one event nudges a score rather than replacing it. A
            single bad day doesn&apos;t destroy a good record, and one good day doesn&apos;t erase a poor
            one.
          </InfoBody>
          <InfoCallout icon="scale-balance">
            Your reviews affect a real person&apos;s standing across the whole platform. Rate the work
            you actually saw. Marking someone absent who attended carries the heaviest penalty in
            the system.
          </InfoCallout>
        </InfoSection>
        </InfoTopics>
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
  strong: {
    fontFamily: fontFamily.semiBold,
    color: colors.textPrimary,
  },
});
