import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Avatar,
  Badge,
  ErrorState,
  FlyerBackground,
  ListSkeleton,
  daysUntilEvent,
  formatEventDate,
  formatEventTimeRange,
  hasEventEnded,
  isUpcomingEvent,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useOutreach, useOutreachApplications } from '@/hooks';
import { isUnderSubscribed, placesRemaining } from '@/lib/underSubscription';
import { useAuthStore } from '@/stores/authStore';
import type { OutreachStatus } from '@/types/database';

const STATUS_TONE: Record<OutreachStatus, BadgeTone> = {
  draft: 'neutral',
  open: 'success',
  closed: 'warning',
  completed: 'navy',
};

const STATUS_LABEL: Record<OutreachStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
  completed: 'Completed',
};

/**
 * The organisation's management screen for ONE outreach — the event's home.
 *
 * WHY THIS SCREEN EXISTS. Check-in and Mark attendance had been living on
 * Applicant Vetting, which is the wrong place: that screen is for deciding who
 * gets a place, and those two are event-DAY actions. A different job at a
 * different moment. They had no correct home because the organisation had no
 * per-outreach screen at all — the dashboard card jumped straight to the
 * applicant list — so they kept being wedged wherever there was room.
 *
 * This is that home. Everything about one event in one place: what it is, how
 * the roster stands, the way through to its applicants, and the two event-day
 * actions. They stay here and stop migrating.
 */
export default function OrganisationOutreachDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const organisationId = useAuthStore((s) => s.user)?.id;

  const outreachQuery = useOutreach(id);
  const outreach = outreachQuery.data;

  const applicationsQuery = useOutreachApplications(id);
  const applications = useMemo(() => applicationsQuery.data ?? [], [applicationsQuery.data]);

  // Only the pending count survives here, as the Applicants row's subtitle. The
  // full per-status tally moved to Applicant Vetting with the rest of the
  // decision surface — see the Roster comment below.
  const pendingCount = useMemo(
    () => applications.filter((a) => a.status === 'pending').length,
    [applications]
  );

  const acceptedVolunteers = useMemo(
    () => applications.filter((a) => a.status === 'accepted'),
    [applications]
  );

  if (outreachQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ListSkeleton rows={4} rowHeight={100} />
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

  // Someone else's outreach has no management surface at all.
  if (outreach.organisation_id !== organisationId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message="You can only manage outreaches your organisation created."
            onRetry={() => router.replace('/(organisation)/dashboard')}
          />
        </View>
      </SafeAreaView>
    );
  }

  const timeRange = formatEventTimeRange(outreach.start_time, outreach.end_time);
  const place = [outreach.location_name, outreach.district, outreach.region].filter(Boolean).join(', ');
  const daysOut = daysUntilEvent(outreach.date);
  const eventOver = hasEventEnded(outreach.date, outreach.end_time);
  const started = !isUpcomingEvent(outreach.date, outreach.start_time);
  const isDraft = outreach.status === 'draft';

  const short =
    daysOut !== null &&
    daysOut >= 0 &&
    isUnderSubscribed({
      status: outreach.status,
      slotsFilled: outreach.slots_filled,
      slotsTotal: outreach.slots_total,
    });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace('/(organisation)/dashboard')}
          accessibilityRole="button"
          accessibilityLabel="Back to dashboard"
          hitSlop={8}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Manage event</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <FlyerBackground uri={outreach.flyer_url} style={styles.hero}>
          <View style={styles.heroContent}>
            <Badge label={STATUS_LABEL[outreach.status]} tone={STATUS_TONE[outreach.status]} />
            <Text style={styles.heroTitle}>{outreach.title}</Text>
          </View>
        </FlyerBackground>

        {/* ---------- When and where ---------- */}
        <View style={styles.card}>
          <DetailRow icon="calendar" label="DATE">
            {formatEventDate(outreach.date)}
            {timeRange ? ` · ${timeRange}` : ''}
          </DetailRow>
          {place ? (
            <DetailRow icon="map-marker-outline" label="LOCATION">
              {place}
            </DetailRow>
          ) : null}
          {daysOut !== null && !eventOver ? (
            <DetailRow icon="clock-outline" label="COUNTDOWN">
              {daysOut === 0 ? 'Today' : daysOut === 1 ? 'Tomorrow' : `In ${daysOut} days`}
            </DetailRow>
          ) : null}
        </View>

        {/* ---------- Roster ----------

            THE SUMMARY ONLY. How full the event is, who is confirmed, and
            whether it is short. Everything that is an input to a DECISION —
            per-role slot progress, pending and waitlisted counts, skill
            coverage, the batch accept button — lives on Applicant Vetting,
            because that is the screen where the organiser acts on it.

            The Pending/Accepted/Waitlisted tally that used to sit here was
            removed for two reasons. It duplicated Applicant Vetting's roster
            card, so the two would drift; and in multi-role mode it was a
            single blended total across every role, which is actively
            misleading — "4 pending" reads as progress when it is four nurses
            and no doctors, and this screen has no way to break that down
            without becoming the applicant screen. The one figure that IS
            actionable from an overview, how many are waiting for a decision,
            is on the Applicants row below: on the link that resolves it.

            The two screens now also read different sources, so they cannot
            disagree. This bar comes from the trigger-maintained
            slots_filled/slots_total columns; Applicant Vetting derives its
            per-role figures from the applications themselves.
        */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Roster</Text>
            <Text style={styles.cardMeta}>
              {outreach.slots_filled} of {outreach.slots_total} filled
            </Text>
          </View>

          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${outreach.slots_total > 0 ? Math.min(100, (outreach.slots_filled / outreach.slots_total) * 100) : 0}%`,
                },
              ]}
            />
          </View>

          {/*
            Under-subscription, stated and nothing more. No suggestion to
            reduce slots or move the date — see lib/underSubscription.ts.
          */}
          {short ? (
            <View style={styles.shortfall}>
              <MaterialCommunityIcons name="account-alert-outline" size={15} color={colors.warning} />
              <Text style={styles.shortfallText}>
                {placesRemaining({
                  slotsFilled: outreach.slots_filled,
                  slotsTotal: outreach.slots_total,
                })}{' '}
                still to fill.
              </Text>
            </View>
          ) : null}

          {acceptedVolunteers.length > 0 ? (
            <View style={styles.avatarRow}>
              {acceptedVolunteers.slice(0, 6).map((application) => (
                <Avatar
                  key={application.id}
                  name={application.volunteer?.profile?.full_name ?? 'Volunteer'}
                  uri={application.volunteer?.profile?.avatar_url}
                  size={32}
                />
              ))}
              {acceptedVolunteers.length > 6 ? (
                <Text style={styles.avatarOverflow}>+{acceptedVolunteers.length - 6}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* ---------- Actions ---------- */}
        <Text style={styles.sectionLabel}>ACTIONS</Text>

        <ActionRow
          icon="account-multiple-outline"
          title="Applicants"
          meta={
            pendingCount > 0
              ? `${pendingCount} waiting for a decision`
              : 'Review and decide who gets a place'
          }
          onPress={() =>
            router.push({ pathname: '/(organisation)/applicants', params: { outreachId: outreach.id } })
          }
        />

        {/*
          Offered on EVERY status, past events included. A finished outreach is
          still worth correcting — and until editing existed a flyer could only
          be attached at creation, so every outreach posted before flyers
          shipped was stuck on the navy fallback band with no way to fix it.
        */}
        <ActionRow
          icon="pencil-outline"
          title="Edit event details"
          meta="Change the title, time, place, flyer or who you need."
          onPress={() => router.push(`/(organisation)/edit-outreach/${outreach.id}`)}
        />

        {/*
          The check-in QR's permanent home. Hidden for drafts: an unpublished
          outreach has no accepted volunteers, so nobody could scan it.
        */}
        {!isDraft ? (
          <ActionRow
            icon="qrcode"
            title="Show check-in code"
            meta="Display this at the venue for volunteers to scan."
            onPress={() => router.push(`/(organisation)/checkin/${outreach.id}`)}
          />
        ) : null}

        {/*
          Only once the event has actually started. Before that there is
          nothing to mark, and offering it early invites an organiser to
          "confirm" a roster for an event nobody has attended yet.
        */}
        {!isDraft && started ? (
          <ActionRow
            icon="clipboard-check-outline"
            title="Mark attendance"
            meta="Everyone counts as present — flag only the no-shows."
            onPress={() => router.push(`/(organisation)/attendance/${outreach.id}`)}
          />
        ) : null}

        {outreach.description ? (
          <>
            <Text style={styles.sectionLabel}>DESCRIPTION</Text>
            <View style={styles.card}>
              <Text style={styles.description}>{outreach.description}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIconColumn}>
        <MaterialCommunityIcons name={icon} size={16} color={colors.textSecondary} />
      </View>
      <View style={styles.detailTextBlock}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailText}>{children}</Text>
      </View>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  meta,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  meta: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={colors.primary} />
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionMeta}>{meta}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
    </Pressable>
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
  // Sections are separated by one gap rule rather than per-child margins, so
  // nothing ends up jammed flush against its neighbour.
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.base,
  },
  hero: {
    borderRadius: radius.lg,
    minHeight: 150,
    justifyContent: 'flex-end',
  },
  heroContent: {
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  heroTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.white,
  },
  card: {
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.base,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  cardMeta: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  shortfall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  shortfallText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  avatarOverflow: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  detailIconColumn: {
    width: 20,
    alignItems: 'center',
  },
  detailTextBlock: {
    flex: 1,
  },
  detailLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    lineHeight: 16,
    letterSpacing: 0.8,
    color: colors.textSecondary,
  },
  detailText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  pressed: {
    opacity: 0.85,
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  actionMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  description: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textPrimary,
  },
});
