import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  ListSkeleton,
  formatEventDate,
  formatEventTimeRange,
} from '@/components/ui';
import { FullApplicationSheet, MatchScoreBadge, WithdrawSheet } from '@/components/volunteer';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  useCancelApplication,
  useCreateApplication,
  useMyApplicationForOutreach,
  useOutreach,
} from '@/hooks';
import { useAuthStore } from '@/stores/authStore';
import type { ApplicationStatus } from '@/types/database';

const STATUS_MESSAGE: Record<ApplicationStatus, string> = {
  pending: "You've applied. The organisation is reviewing your application.",
  accepted: "You're in. This event is on your schedule.",
  rejected: 'You were not selected for this outreach.',
  waitlisted: "You're on the waitlist — the organisation will be in touch if a slot frees up.",
  cancelled: 'You withdrew from this outreach.',
};

export default function OutreachDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const outreachId = typeof id === 'string' ? id : undefined;

  const user = useAuthStore((state) => state.user);
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);
  const volunteerId = user?.id;

  const outreachQuery = useOutreach(outreachId);
  const myApplicationQuery = useMyApplicationForOutreach(volunteerId, outreachId);
  const createApplication = useCreateApplication();
  const cancelApplication = useCancelApplication();

  const [fullFormVisible, setFullFormVisible] = useState(false);
  const [withdrawVisible, setWithdrawVisible] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState(false);

  const outreach = outreachQuery.data;
  const application = myApplicationQuery.data ?? null;
  const isClinical = outreach?.role_type === 'clinical';
  const isVerified = volunteerProfile?.verification_status === 'verified';
  // CLAUDE.md's Phase 2 eligibility rule: an unverified volunteer may browse
  // everything and Quick Join support roles, but may not submit a full
  // application to a clinical outreach. applications_insert_own enforces this
  // server-side too — this branch is what turns that refusal into an
  // explanation and a way forward.
  const blockedByVerification = isClinical && !isVerified;

  const { matchingSkills, missingSkills } = useMemo(() => {
    const required = outreach?.required_skills ?? [];
    const mine = new Set(volunteerProfile?.skill_tags ?? []);
    return {
      matchingSkills: required.filter((skill) => mine.has(skill)),
      missingSkills: required.filter((skill) => !mine.has(skill)),
    };
  }, [outreach?.required_skills, volunteerProfile?.skill_tags]);

  function handleQuickJoin() {
    if (!outreachId || !volunteerId) return;
    createApplication.mutate({ outreachId, volunteerId, type: 'quick_join' });
  }

  function handleFullSubmit(motivation: string) {
    if (!outreachId || !volunteerId) return;
    createApplication.mutate(
      { outreachId, volunteerId, type: 'full', motivation },
      { onSuccess: () => setFullFormVisible(false) }
    );
  }

  function handleWithdraw(reason: string | null) {
    if (!application || !outreachId || !volunteerId) return;
    cancelApplication.mutate(
      { applicationId: application.id, volunteerId, outreachId, reason },
      { onSuccess: () => setWithdrawVisible(false) }
    );
  }

  if (outreachQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ListSkeleton rows={4} rowHeight={90} />
      </SafeAreaView>
    );
  }

  if (outreachQuery.isError || !outreach) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message={
              outreachQuery.error instanceof Error
                ? outreachQuery.error.message
                : 'This outreach could not be loaded.'
            }
            onRetry={() => outreachQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const timeRange = formatEventTimeRange(outreach.start_time, outreach.end_time);
  const slotsLeft = Math.max(0, outreach.slots_total - outreach.slots_filled);
  const isFull = slotsLeft === 0;
  const alreadyApplied = application !== null && application.status !== 'cancelled';
  const canWithdraw =
    application !== null &&
    (application.status === 'pending' ||
      application.status === 'accepted' ||
      application.status === 'waitlisted');
  const organisation = outreach.organisation;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Outreach Detail</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <MatchScoreBadge onDark />
          <Text style={styles.heroOrg} numberOfLines={1}>
            {organisation?.org_name?.toUpperCase() ?? 'ORGANISATION'}
          </Text>
          <Text style={styles.heroTitle}>{outreach.title}</Text>
        </View>

        <View style={styles.card}>
          <DetailRow icon="map-marker-outline">
            {[outreach.location_name, outreach.district, outreach.region].filter(Boolean).join(', ') ||
              'Location to be confirmed'}
          </DetailRow>
          <DetailRow icon="calendar-outline">
            {formatEventDate(outreach.date)}
            {timeRange ? ` · ${timeRange}` : ''}
          </DetailRow>
          <DetailRow icon="account-multiple-outline">
            {isFull ? 'All slots filled' : `${slotsLeft} of ${outreach.slots_total} slots open`}
          </DetailRow>
          {outreach.role_type ? (
            <DetailRow icon="stethoscope">
              {outreach.role_type === 'clinical' ? 'Clinical role' : 'Support role'}
            </DetailRow>
          ) : null}

          {organisation ? (
            <Pressable
              onPress={() => router.push(`/profile/organisation/${organisation.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`View ${organisation.org_name} profile`}
              style={styles.orgLink}
            >
              <Text style={styles.orgLinkText}>View organisation profile</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>

        {outreach.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About this event</Text>
            <Text style={styles.body}>{outreach.description}</Text>
          </View>
        ) : null}

        {(outreach.required_skills?.length ?? 0) > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your matching skills</Text>
            <View style={styles.chipRow}>
              {matchingSkills.map((skill) => (
                <View key={skill} style={[styles.chip, styles.chipMatched]}>
                  <MaterialCommunityIcons name="check-circle-outline" size={13} color={colors.success} />
                  <Text style={[styles.chipText, styles.chipTextMatched]}>{skill}</Text>
                </View>
              ))}
              {missingSkills.map((skill) => (
                <View key={skill} style={styles.chip}>
                  <Text style={styles.chipText}>{skill}</Text>
                </View>
              ))}
            </View>
            {matchingSkills.length === 0 ? (
              <Text style={styles.hint}>
                None of your saved skills match this outreach yet — you can still apply.
              </Text>
            ) : null}
          </View>
        ) : null}

        {alreadyApplied ? (
          <View style={styles.statusPanel}>
            <Badge
              label={application.type === 'quick_join' ? 'Quick Join' : 'Full Application'}
              tone="neutral"
            />
            <Text style={styles.statusText}>{STATUS_MESSAGE[application.status]}</Text>
          </View>
        ) : null}

        {blockedByVerification && !alreadyApplied ? (
          <View style={styles.gate}>
            <MaterialCommunityIcons name="shield-alert-outline" size={20} color={colors.warning} />
            <View style={styles.gateText}>
              <Text style={styles.gateTitle}>Verification required</Text>
              <Text style={styles.gateBody}>
                This is a clinical outreach, so you need a verified profile before you can apply.
                Support-role events are open to you now.
              </Text>
              {/*
                Deliberately NOT linking to (auth)/verify-identity. That screen
                is a STEP OF THE ONBOARDING WIZARD: it reads useOnboardingStore
                (which is reset() once onboarding finishes, so it is empty for
                anyone who already onboarded) and submits useCompleteOnboarding.
                Sending an onboarded volunteer there wiped their category,
                skills, specialties, availability, region and district, and the
                now-null category made useAuthGuard drag them back through the
                whole wizard. A standalone re-verification screen has to exist
                before this can navigate anywhere -- see docs/REPORT_NOTES.md.
              */}
              <Pressable
                onPress={() => setVerifyNotice(true)}
                accessibilityRole="button"
                accessibilityLabel="How to get verified"
                style={styles.gateAction}
              >
                <Text style={styles.gateActionText}>How do I get verified?</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {createApplication.isError && !fullFormVisible ? (
          <Text style={styles.error}>
            {createApplication.error instanceof Error
              ? createApplication.error.message
              : 'Could not submit your application.'}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {canWithdraw ? (
          <Button
            title="Withdraw application"
            variant="outline"
            onPress={() => setWithdrawVisible(true)}
            accessibilityLabel="Withdraw application"
          />
        ) : alreadyApplied ? (
          <Text style={styles.footerNote}>{STATUS_MESSAGE[application.status]}</Text>
        ) : outreach.status !== 'open' ? (
          <Text style={styles.footerNote}>This outreach is no longer accepting applications.</Text>
        ) : isFull ? (
          <Text style={styles.footerNote}>
            Every slot is filled. Check the feed for other outreaches.
          </Text>
        ) : (
          <View style={styles.actions}>
            {!isClinical ? (
              <Button
                title={createApplication.isPending ? 'Joining...' : 'Quick Join'}
                onPress={handleQuickJoin}
                disabled={createApplication.isPending}
                style={styles.actionButton}
                accessibilityLabel="Quick join this outreach"
              />
            ) : null}
            <Button
              title="Apply Now"
              variant={isClinical ? 'solid' : 'outline'}
              onPress={() => setFullFormVisible(true)}
              disabled={blockedByVerification || createApplication.isPending}
              style={styles.actionButton}
              accessibilityLabel="Open the full application form"
            />
          </View>
        )}
      </View>

      <ConfirmDialog
        visible={verifyNotice}
        icon="shield-alert-outline"
        title="Verification isn't open yet"
        message="Identity verification is reviewed by the V-HUB team and isn't available in the app yet. You can still browse every outreach and join support-role events in the meantime."
        confirmLabel="Got It"
        cancelLabel="Close"
        onConfirm={() => setVerifyNotice(false)}
        onCancel={() => setVerifyNotice(false)}
      />

      <FullApplicationSheet
        visible={fullFormVisible}
        outreachTitle={outreach.title}
        matchingSkills={matchingSkills}
        missingSkills={missingSkills}
        isPending={createApplication.isPending}
        errorMessage={
          createApplication.isError
            ? createApplication.error instanceof Error
              ? createApplication.error.message
              : 'Could not submit your application.'
            : undefined
        }
        onSubmit={handleFullSubmit}
        onDismiss={() => setFullFormVisible(false)}
      />

      <WithdrawSheet
        visible={withdrawVisible}
        outreachTitle={outreach.title}
        eventDate={outreach.date}
        eventStartTime={outreach.start_time}
        isPending={cancelApplication.isPending}
        errorMessage={
          cancelApplication.isError
            ? cancelApplication.error instanceof Error
              ? cancelApplication.error.message
              : 'Could not withdraw your application.'
            : undefined
        }
        onConfirm={handleWithdraw}
        onDismiss={() => setWithdrawVisible(false)}
      />
    </SafeAreaView>
  );
}

function DetailRow({
  icon,
  children,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.detailRow}>
      <MaterialCommunityIcons name={icon} size={17} color={colors.primary} />
      <Text style={styles.detailText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 16,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 22,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  hero: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroOrg: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.primary,
  },
  heroTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    lineHeight: 30,
    color: colors.white,
  },
  card: {
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  detailText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  orgLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
  },
  orgLinkText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  chipMatched: {
    backgroundColor: 'rgba(34, 197, 94, 0.10)',
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextMatched: {
    color: colors.success,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  statusPanel: {
    marginTop: spacing.xl,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  statusText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  gate: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
  },
  gateText: {
    flex: 1,
  },
  gateTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  gateBody: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },
  gateAction: {
    minHeight: 44,
    justifyContent: 'center',
  },
  gateActionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.base,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerNote: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
