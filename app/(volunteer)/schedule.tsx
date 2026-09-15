import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { humanError } from '@/lib/errorMessage';
import { Text } from '@/components/ui/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Avatar,
  EmptyState,
  ErrorState,
  ListSkeleton,
  formatEventDate,
  formatEventTime,
  hasEventEnded,
  msUntilEvent,
} from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  useApplicationDaysForMany,
  useOrganisationLogos,
  useOutreachDaysForMany,
  useVolunteerApplications,
} from '@/hooks';
import { describeCommitment, formatDaySpan, isAnyDayToday, lastDay } from '@/lib/outreachDays';
import type { VolunteerApplication } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';
import { tabBarClearance } from '@/components/ui/tabBarOptions';

/** One flattened list so a single FlatList can render date-grouped sections. */
type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'pastToggle'; key: string }
  | { kind: 'event'; key: string; application: VolunteerApplication; isPast?: boolean };

export default function Schedule() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const volunteerId = useAuthStore((state) => state.user)?.id;

  const applicationsQuery = useVolunteerApplications(volunteerId);
  const applications = useMemo(() => applicationsQuery.data ?? [], [applicationsQuery.data]);

  /**
   * Accepted and NOT YET OVER, soonest first. `useVolunteerApplications`
   * returns newest-application-first, which is the wrong order for a diary,
   * so this re-sorts by event start rather than by when the volunteer applied.
   *
   * The test is `hasEventEnded`, not `isUpcomingEvent`. The latter flips the
   * moment the start time passes, so an event vanished from the volunteer's
   * schedule while they were standing in it — which is exactly when they need
   * it, since that is when they check in. Reported during testing: an
   * application showing as accepted was missing from Schedule entirely because
   * the event had already begun.
   */
  const accepted = useMemo(
    () =>
      applications.filter(
        (application) => application.status === 'accepted' && application.outreach !== null
      ),
    [applications]
  );

  /*
    THE DAYS OF EVERY EVENT ON THE SCHEDULE, IN ONE QUERY.

    `outreaches.date` is only the FIRST day, and judging "is it over?" on it
    would finish a four-day campaign on the evening of day one -- dropping it
    off this screen, and taking the check-in action with it, while the volunteer
    was still standing in it. That is the same failure the `hasEventEnded`
    comment above describes, one level up.

    An outreach missing from the map falls back to its own date, which is
    correct for the one-day event most of them are and is what shows while the
    query is in flight.
  */
  const scheduleDays = useOutreachDaysForMany(
    useMemo(
      () =>
        accepted
          .map((application) => application.outreach?.id)
          .filter((id): id is string => !!id),
      [accepted]
    )
  );

  const dayStringsFor = useCallback(
    (outreachId: string, fallbackDate: string): string[] =>
      scheduleDays.data?.[outreachId]?.map((day) => day.day) ?? [fallbackDate],
    [scheduleDays.data]
  );

  /*
    WHICH OF THOSE DAYS THIS VOLUNTEER ACTUALLY PROMISED.

    The span alone would overstate the commitment: a student who signed up for
    the two Saturdays of a three-week campaign should not read "Oct 3 - Oct 24"
    on their own diary and think they are due every day in between. Batched over
    every accepted application for the same reason as the days above.
  */
  const scheduleCommitments = useApplicationDaysForMany(
    useMemo(() => accepted.map((application) => application.id), [accepted])
  );

  const { upcoming, past } = useMemo(() => {
    const ahead: VolunteerApplication[] = [];
    const done: VolunteerApplication[] = [];

    for (const application of accepted) {
      const outreach = application.outreach;
      if (!outreach) continue;
      // Judged on the LAST day, not the first.
      const finalDay = lastDay(dayStringsFor(outreach.id, outreach.date)) ?? outreach.date;
      if (hasEventEnded(finalDay, outreach.end_time)) done.push(application);
      else ahead.push(application);
    }

    const startOf = (application: VolunteerApplication) =>
      application.outreach
        ? (msUntilEvent(application.outreach.date, application.outreach.start_time) ??
          Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;

    // Soonest first ahead of us; most recent first behind us. A diary counts
    // forwards and a history counts backwards.
    ahead.sort((a, b) => startOf(a) - startOf(b));
    done.sort((a, b) => startOf(b) - startOf(a));

    return { upcoming: ahead, past: done };
  }, [accepted, dayStringsFor]);

  // One lookup for every organisation on the schedule — see useOrganisationLogos
  // for why the logo cannot come from the outreach embed.
  const organisationLogos = useOrganisationLogos(
    accepted.map((application) => application.outreach?.organisation?.id)
  );

  const [showPast, setShowPast] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastDate: string | null = null;

    for (const application of upcoming) {
      const outreach = application.outreach;
      if (!outreach) continue;
      if (outreach.date !== lastDate) {
        out.push({
          kind: 'header',
          key: `header-${outreach.date}`,
          label: formatEventDate(outreach.date),
        });
        lastDate = outreach.date;
      }
      out.push({ kind: 'event', key: application.id, application });
    }

    // Past events live behind a toggle rather than in the diary itself. An
    // accepted application is a commitment and should stay visible — the
    // volunteer earned it, and it is what their V-Score is built from — but a
    // list that grows forever pushes the next event off the screen, which is
    // the one thing this tab exists to show.
    if (past.length > 0) {
      out.push({ kind: 'pastToggle', key: 'past-toggle' });
      if (showPast) {
        lastDate = null;
        for (const application of past) {
          const outreach = application.outreach;
          if (!outreach) continue;
          if (outreach.date !== lastDate) {
            out.push({
              kind: 'header',
              key: `past-header-${outreach.date}`,
              label: formatEventDate(outreach.date),
            });
            lastDate = outreach.date;
          }
          out.push({ kind: 'event', key: `past-${application.id}`, application, isPast: true });
        }
      }
    }

    return out;
  }, [upcoming, past, showPast]);

  if (applicationsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>My Schedule</Text>
        <ListSkeleton rows={3} rowHeight={72} />
      </SafeAreaView>
    );
  }

  if (applicationsQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message={
              humanError(applicationsQuery.error, 'Please try again.')
            }
            onRetry={() => applicationsQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>My Schedule</Text>
      <Text style={styles.subtitle}>
        {upcoming.length === 0
          ? 'Confirmed outreaches appear here'
          : `${upcoming.length} confirmed ${upcoming.length === 1 ? 'event' : 'events'} ahead`}
      </Text>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: tabBarClearance(insets.bottom) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={applicationsQuery.isRefetching}
            onRefresh={() => applicationsQuery.refetch()}
          />
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return (
              <View style={styles.dateHeaderRow}>
                <View style={styles.dateRule} />
                <Text style={styles.dateHeader}>{item.label}</Text>
              </View>
            );
          }

          if (item.kind === 'pastToggle') {
            return (
              <Pressable
                onPress={() => setShowPast((shown) => !shown)}
                accessibilityRole="button"
                accessibilityLabel={showPast ? 'Hide past outreaches' : 'Show past outreaches'}
                accessibilityState={{ expanded: showPast }}
                style={({ pressed }) => [styles.pastToggle, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons
                  name={showPast ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textSecondary}
                />
                <Text style={styles.pastToggleLabel}>
                  {showPast ? 'Hide past' : `Past (${past.length})`}
                </Text>
              </Pressable>
            );
          }

          const outreach = item.application.outreach;
          if (!outreach) return null;
          const startLabel = formatEventTime(outreach.start_time) ?? 'All day';
          const endLabel = formatEventTime(outreach.end_time);
          const place = [outreach.location_name, outreach.district].filter(Boolean).join(', ');

          /*
            THE SPAN, AND WHAT THIS VOLUNTEER OWES OF IT.

            The date group header above says when the event STARTS, which is the
            right way to group a diary but says nothing about how long the event
            runs. A four-day campaign sat under "Mon, Oct 12" looking exactly
            like the one-day clinic beneath it.

            Shown only when there is more than one day: on a single-day event
            the header has already said everything, and repeating it would be
            noise on the screen a volunteer checks most often.
          */
          const eventDays = dayStringsFor(outreach.id, outreach.date);
          const committed = scheduleCommitments.data?.[item.application.id];
          const spanLabel = eventDays.length > 1 ? formatDaySpan(eventDays) : null;
          const commitmentLabel =
            eventDays.length > 1 && committed && committed.length > 0
              ? describeCommitment(committed.length, eventDays.length)
              : null;

          // A finished event is never "today" for the purpose of checking in —
          // the scan action must not reappear on it after the fact.
          // ANY day of the event, not just the first: day three of a campaign
          // is as much "today" as day one, and the check-in action belongs on
          // every one of them.
          const isToday =
            !item.isPast && isAnyDayToday(dayStringsFor(outreach.id, outreach.date));

          /*
            A CANCELLED EVENT STAYS ON THE SCHEDULE, MARKED.

            The application is still `accepted` and deliberately so: writing
            `cancelled` onto it would mean the volunteer withdrew, and on short
            notice would stamp a LATE withdrawal and cost them V-Score points
            for their organiser's decision. So the event's own status is what
            says it is off, and it has to say so HERE — silently dropping the
            card would leave someone turning up to a cancelled clinic.
          */
          const isCancelled = outreach.status === 'cancelled';

          return (
            <View style={styles.eventBlock}>
              {/*
                Card, not a single-line row. The row packed time, a dot, title,
                organisation, venue and district onto one 60pt line, so the
                title and the venue both truncated to nothing readable
                ("Check in Test Outrea...", "La D..."). The facts are the same
                facts; they are simply given their own lines.

                Structure and tokens are lifted from the Outreach Detail card:
                surfaceSubtle tint, hairline border, radius.lg, and the fixed
                20pt icon rail with a label/value hierarchy. Depth comes from
                that internal structure, not from a shadow — nothing in this
                codebase is raised.
              */}
              <Pressable
                onPress={() => router.push(`/(volunteer)/outreach/${outreach.id}?from=/(volunteer)/schedule`)}
                accessibilityRole="button"
                accessibilityLabel={`${outreach.title} at ${startLabel}`}
                style={({ pressed }) => [
                  styles.eventCard,
                  isToday && !isCancelled && styles.eventCardToday,
                  item.isPast && styles.eventCardPast,
                  isCancelled && styles.eventCardCancelled,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.eventTopRow}>
                  <View style={styles.eventDot} />
                  <Text style={styles.eventTime}>
                    {startLabel}
                    {endLabel ? ` - ${endLabel}` : ''}
                  </Text>
                  {isCancelled ? (
                    <View style={styles.cancelledPill}>
                      <Text style={styles.cancelledPillText}>CANCELLED</Text>
                    </View>
                  ) : isToday ? (
                    <View style={styles.todayPill}>
                      <Text style={styles.todayPillText}>TODAY</Text>
                    </View>
                  ) : null}
                  <View style={styles.eventTopSpacer} />
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
                </View>

                {/* Two lines, not one: outreach titles are sentences, not labels. */}
                <Text style={[styles.eventTitle, isCancelled && styles.eventTitleCancelled]} numberOfLines={2}>
                  {outreach.title}
                </Text>

                {isCancelled ? (
                  <Text style={styles.cancelledLine}>
                    The organisation cancelled this event. You do not need to attend.
                  </Text>
                ) : null}

                {spanLabel ? (
                  <View style={styles.detailRow}>
                    <View style={styles.detailIconColumn}>
                      <MaterialCommunityIcons
                        name="calendar-range"
                        size={15}
                        color={colors.textSecondary}
                        style={styles.detailIcon}
                      />
                    </View>
                    <Text style={styles.detailText} numberOfLines={2}>
                      {spanLabel}
                      {commitmentLabel ? ` · you are on ${commitmentLabel.toLowerCase()}` : ''}
                    </Text>
                  </View>
                ) : null}

                {outreach.organisation?.org_name ? (
                  <View style={styles.detailRow}>
                    <View style={styles.detailIconColumn}>
                      {/*
                        The organisation's logo where the generic building icon
                        used to be. It falls back to initials when there is no
                        logo, so the rail is the same width either way and the
                        rows below stay aligned.
                      */}
                      <Avatar
                        name={outreach.organisation.org_name}
                        uri={organisationLogos.data?.[outreach.organisation.id]}
                        size={18}
                      />
                    </View>
                    <Text style={styles.detailText} numberOfLines={2}>
                      {outreach.organisation.org_name}
                    </Text>
                  </View>
                ) : null}

                {place ? (
                  <View style={styles.detailRow}>
                    <View style={styles.detailIconColumn}>
                      <MaterialCommunityIcons
                        name="map-marker-outline"
                        size={15}
                        color={colors.textSecondary}
                        style={styles.detailIcon}
                      />
                    </View>
                    <Text style={styles.detailText} numberOfLines={2}>
                      {place}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              {/*
                Attached to the event it belongs to, and shown only on the day.
                It used to be one standalone row at the top of the screen,
                which left a volunteer with several confirmed events unable to
                tell what they were checking in to — the button named no event,
                because it belonged to none of them. That association is kept.

                What changed is the spacing. It was pulled UP into the card by a
                negative margin and indented 70pt, so it collided with the card
                above and read as a torn-off fragment of it rather than as an
                action. It now sits below the card with real separation, at the
                card's own width, and names the event it belongs to.
              */}
              {isToday ? (
                <Pressable
                  onPress={() => router.push('/(volunteer)/scan')}
                  accessibilityRole="button"
                  accessibilityLabel={`Scan check-in code for ${outreach.title}`}
                  style={({ pressed }) => [styles.scanRow, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons name="qrcode-scan" size={18} color={colors.white} />
                  <Text style={styles.scanLabel}>Scan check-in code</Text>
                </Pressable>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="calendar-blank-outline"
            title="Nothing scheduled yet"
            message="Once an organisation accepts one of your applications, the event shows up here with its date and time."
            actionLabel="Find an outreach"
            onAction={() => router.push('/(volunteer)/feed')}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.textPrimary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    paddingHorizontal: spacing.xl,
    marginTop: 2,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    // Real separation from the card above, and the card's own width. The old
    // rule pulled it up by -spacing.xs and indented it 70pt, which made it
    // touch the card and read as a fragment of it. Grouping now comes from
    // proximity and from naming the event, not from collision.
    marginTop: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.navy,
  },
  scanLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.white,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  dateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  dateRule: {
    width: 24,
    height: 1,
    backgroundColor: colors.border,
  },
  dateHeader: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  /** One event and the actions that belong to it. */
  eventBlock: {
    marginBottom: spacing.base,
  },
  // Outreach Detail's card, to the token: surfaceSubtle tint, hairline border,
  // radius.lg, spacing.base padding, and `gap` alone between rows so the space
  // between any two facts is one number.
  eventCard: {
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  /** Today's event gets a border so it stands out from the rest of the diary. */
  eventCardToday: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  /** Past events recede rather than disappear — still readable, clearly done. */
  eventCardPast: {
    opacity: 0.85,
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  eventTopSpacer: {
    flex: 1,
  },
  cancelledPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
  cancelledPillText: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.white,
  },
  eventCardCancelled: {
    borderColor: colors.danger,
  },
  eventTitleCancelled: {
    textDecorationLine: 'line-through',
  },
  cancelledLine: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  todayPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  todayPillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.white,
  },
  // The icon rail from Outreach Detail: a fixed 20pt column centring each
  // glyph, so every icon shares a left edge regardless of its advance width.
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  detailIconColumn: {
    width: 20,
    alignItems: 'center',
  },
  detailIcon: {
    lineHeight: 18,
  },
  detailText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  pastToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.base,
  },
  pastToggleLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.85,
  },
  eventTime: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  // 16pt with a real line height and two lines to run into — the title is the
  // one thing on this card that has to be readable at a glance, and at 14pt on
  // a single truncating line it was the one thing that was not.
  eventTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    lineHeight: 21,
    color: colors.textPrimary,
  },
});
