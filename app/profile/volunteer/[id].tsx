import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar, Badge, ErrorState, ListSkeleton, VScoreBadge } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { EXPERIENCE_LEVELS, VOLUNTEER_CATEGORIES } from '@/constants/categories';
import { usePublicVolunteerProfile, useUpdateApplicationStatus } from '@/hooks';
import type { OrganisationApplicationDecision } from '@/hooks';
import { getVScoreBand } from '@/lib/vscore';
import type { VerificationStatus } from '@/types/database';

const VERIFICATION_TONE: Record<VerificationStatus, BadgeTone> = {
  verified: 'success',
  documents_pending: 'warning',
  unverified: 'neutral',
};

const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  verified: 'Verified',
  documents_pending: 'Documents pending',
  unverified: 'Unverified',
};

const DAY_LABEL: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** Turns an availability token like "sat_evening" into "Sat evening". */
function formatAvailabilitySlot(token: string): string {
  const [day, slot] = token.split('_');
  const dayLabel = day ? (DAY_LABEL[day] ?? day) : token;
  return slot ? `${dayLabel} ${slot}` : dayLabel;
}

/**
 * Public volunteer profile (design-refs/Volunteer Public Profile.png).
 *
 * Reads the `public_volunteer_profiles` view, not the base tables — see
 * usePublicVolunteerProfile. Two Figma elements are deliberately absent:
 * "Message" / "Call Now" (there is no messaging feature, and phone/email are
 * excluded from the view on purpose), and the "Recent High-Impact" event
 * history (event_reviews is row-scoped to the org and the volunteer
 * themselves, so a browsing third party cannot see it — the events-attended
 * total is shown instead).
 */
export default function PublicVolunteerProfile() {
  const router = useRouter();
  // applicationId/outreachId arrive only when an organisation opens this
  // screen from its applicant list. Their presence is what turns the
  // read-only profile into a decision screen — a volunteer browsing another
  // volunteer never has them, so the action bar simply never renders.
  const { id, applicationId, outreachId } = useLocalSearchParams<{
    id: string;
    applicationId?: string;
    outreachId?: string;
  }>();
  const volunteerId = typeof id === 'string' ? id : undefined;

  const profileQuery = usePublicVolunteerProfile(volunteerId);
  const updateStatus = useUpdateApplicationStatus();

  // Mirrors the Accept / Waitlist / Reject actions on the applicant list
  // card. The design (design-refs/Applicant Vetting.png) puts them on the
  // card for fast triage; having them here too means an organisation that
  // wants to read the whole profile first doesn't have to navigate back to
  // act on what it just read.
  const canDecide = !!applicationId && !!outreachId;

  function decide(status: OrganisationApplicationDecision) {
    if (!applicationId || !outreachId) return;
    updateStatus.mutate(
      { applicationId, outreachId, status },
      { onSuccess: () => router.back() }
    );
  }
  const volunteer = profileQuery.data;

  if (profileQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ListSkeleton rows={3} rowHeight={120} />
      </SafeAreaView>
    );
  }

  if (profileQuery.isError || !volunteer) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message={
              profileQuery.error instanceof Error
                ? profileQuery.error.message
                : 'This profile could not be loaded.'
            }
            onRetry={() => profileQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const categoryLabel = VOLUNTEER_CATEGORIES.find((c) => c.value === volunteer.category)?.label;
  const experienceLabel = EXPERIENCE_LEVELS.find(
    (e) => e.value === volunteer.experience_level
  )?.label;
  const skills = volunteer.skill_tags ?? [];
  const specialties = volunteer.specialties ?? [];
  const availability = volunteer.availability_slots ?? [];
  const location = [volunteer.district, volunteer.region].filter(Boolean).join(', ');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>QUICK OVERVIEW</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.identityRow}>
            <Avatar name={volunteer.full_name} uri={volunteer.avatar_url} size={64} />
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={2}>
                {volunteer.full_name}
              </Text>
              {categoryLabel ? <Text style={styles.category}>{categoryLabel}</Text> : null}
              <View style={styles.badgeRow}>
                <Badge
                  label={VERIFICATION_LABEL[volunteer.verification_status]}
                  tone={VERIFICATION_TONE[volunteer.verification_status]}
                  icon={volunteer.verification_status === 'verified' ? 'shield-check' : undefined}
                />
                {experienceLabel ? <Badge label={experienceLabel} tone="navy" /> : null}
              </View>
            </View>
            <VScoreBadge score={volunteer.v_score} />
          </View>

          {volunteer.bio ? <Text style={styles.bio}>{volunteer.bio}</Text> : null}
        </View>

        <View style={styles.tileRow}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>V-SCORE BAND</Text>
            <Text style={styles.tileValue}>{getVScoreBand(volunteer.v_score)}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>EVENTS ATTENDED</Text>
            <Text style={styles.tileValue}>{volunteer.events_attended}</Text>
          </View>
        </View>

        {location ? (
          <View style={styles.tileRow}>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>LOCATION</Text>
              <Text style={styles.tileValue} numberOfLines={2}>
                {location}
              </Text>
            </View>
          </View>
        ) : null}

        <Section title="Skills" empty="No skills listed yet.">
          {skills.map((skill) => (
            <View key={skill} style={styles.chip}>
              <Text style={styles.chipText}>{skill}</Text>
            </View>
          ))}
        </Section>

        <Section title="Specialties" empty="No specialties listed yet.">
          {specialties.map((specialty) => (
            <View key={specialty} style={styles.chip}>
              <Text style={styles.chipText}>{specialty}</Text>
            </View>
          ))}
        </Section>

        <Section title="Availability" empty="No availability set yet.">
          {availability.map((slot) => (
            <View key={slot} style={styles.chip}>
              <Text style={styles.chipText}>{formatAvailabilitySlot(slot)}</Text>
            </View>
          ))}
        </Section>
      </ScrollView>

      {canDecide ? (
        <View style={styles.decisionBar}>
          {updateStatus.isError ? (
            <Text style={styles.decisionError}>
              {updateStatus.error instanceof Error
                ? updateStatus.error.message
                : 'Could not update this application.'}
            </Text>
          ) : null}
          <View style={styles.decisionRow}>
            <Pressable
              onPress={() => decide('accepted')}
              disabled={updateStatus.isPending}
              accessibilityRole="button"
              accessibilityLabel="Accept this applicant"
              style={({ pressed }) => [
                styles.decisionButton,
                styles.acceptButton,
                pressed && styles.decisionPressed,
                updateStatus.isPending && styles.decisionDisabled,
              ]}
            >
              <Text style={styles.acceptLabel}>Accept</Text>
            </Pressable>
            <Pressable
              onPress={() => decide('waitlisted')}
              disabled={updateStatus.isPending}
              accessibilityRole="button"
              accessibilityLabel="Waitlist this applicant"
              style={({ pressed }) => [
                styles.decisionButton,
                styles.neutralButton,
                pressed && styles.decisionPressed,
                updateStatus.isPending && styles.decisionDisabled,
              ]}
            >
              <Text style={styles.neutralLabel}>Waitlist</Text>
            </Pressable>
            <Pressable
              onPress={() => decide('rejected')}
              disabled={updateStatus.isPending}
              accessibilityRole="button"
              accessibilityLabel="Reject this applicant"
              style={({ pressed }) => [
                styles.decisionButton,
                styles.neutralButton,
                pressed && styles.decisionPressed,
                updateStatus.isPending && styles.decisionDisabled,
              ]}
            >
              <Text style={styles.rejectLabel}>Reject</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children.length > 0 ? (
        <View style={styles.chipRow}>{children}</View>
      ) : (
        <Text style={styles.sectionEmpty}>{empty}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  decisionBar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.base,
    backgroundColor: colors.background,
  },
  decisionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  decisionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  acceptButton: {
    backgroundColor: colors.primary,
  },
  neutralButton: {
    backgroundColor: colors.surface,
  },
  acceptLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.white,
  },
  neutralLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textSecondary,
  },
  rejectLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.danger,
  },
  decisionPressed: {
    opacity: 0.8,
  },
  decisionDisabled: {
    opacity: 0.5,
  },
  decisionError: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 22,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  card: {
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamily.bold,
    fontSize: 19,
    color: colors.textPrimary,
  },
  category: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  bio: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: spacing.base,
  },
  tileRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  tile: {
    flex: 1,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  tileLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.textSecondary,
  },
  tileValue: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sectionEmpty: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textPrimary,
  },
});
