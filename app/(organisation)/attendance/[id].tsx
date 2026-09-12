import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  EmptyState,
  ErrorState,
  ListSkeleton,
  ScreenHeader,
} from '@/components/ui';
import { AttendanceRow } from '@/components/organisation';
import { useOutreach } from '@/hooks/useOutreaches';
import { useOutreachApplications } from '@/hooks/useApplications';
import { useOutreachCommitments, useOutreachDays } from '@/hooks/useOutreachDays';
import {
  attendanceForDay,
  useOutreachAttendance,
  useResolveAttendance,
} from '@/hooks/useAttendance';
import { isPresent, needsAction } from '@/lib/attendance';
import { formatDayShort, formatDaySpan, todayIso } from '@/lib/outreachDays';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { ApplicationWithVolunteer } from '@/hooks/useApplications';
import { humanError, humanErrorOrNull } from '@/lib/errorMessage';

/**
 * Post-event attendance (section 3, owner decision 2026-08-05).
 *
 * EXCEPTION-BASED, which is the whole design. Everyone on the accepted roster
 * counts as present until the organiser says otherwise — an absence is always
 * an explicit human judgement, never an inference from silence. A volunteer
 * whose phone was flat, who could not get signal, or who simply never saw the
 * QR is not a no-show, and treating them as one would turn a device problem
 * into a -15 V-Score penalty.
 *
 * So the work here scales with the number of ABSENCES rather than the number
 * of volunteers: a fully attended twenty-person event needs no taps at all.
 *
 * ONE DAY AT A TIME. Attendance is recorded per day, so this screen resolves
 * one day and shows the day strip only when there is more than one — a one-day
 * outreach looks and behaves exactly as it always did. Two things follow from
 * the multi-day model and are not incidental:
 *
 *   - The roster for a day is the people who COMMITTED to that day, not every
 *     accepted volunteer. A student who offered four Saturdays of a month-long
 *     campaign must never appear on the other 22 days as somebody to mark
 *     absent; they did not promise those days and are not missing from them.
 *   - An unresolved day simply does not count. There is no obligation to work
 *     through every day, and leaving one untouched costs no volunteer anything.
 *
 * This inverts design-refs/Mark Attendance.png, which is opt-in ("Mark
 * Present" on every row). The layout is that design's; the semantics are the
 * later decision's. See components/organisation/AttendanceRow.tsx.
 *
 * NOTE: no native modules are imported here, directly or transitively — this
 * screen needs neither the camera nor GPS, and must stay openable on any
 * build. Keep it that way (hooks/useCheckInScan.ts is the module to avoid).
 */

type Row =
  | { kind: 'header'; key: string; label: string; hint: string }
  | { kind: 'volunteer'; key: string; application: ApplicationWithVolunteer };

export default function OrganisationAttendance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const outreachQuery = useOutreach(id);
  const applicationsQuery = useOutreachApplications(id);
  const daysQuery = useOutreachDays(id);
  const commitmentsQuery = useOutreachCommitments(id);
  const attendanceQuery = useOutreachAttendance(id);
  const resolve = useResolveAttendance();

  const days = useMemo(() => daysQuery.data ?? [], [daysQuery.data]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

  /**
   * Opens on TODAY when the event is running today, and on the last day
   * otherwise.
   *
   * Both defaults answer the same question — which day is the organiser most
   * likely holding this phone for? During the event it is today; afterwards it
   * is the day that just finished, since attendance is filed as the event ends.
   * Keyed on the outreach id, not on "have we chosen yet": these screens stay
   * mounted between events, so a plain first-run guard would leave the previous
   * event's day selected on the next one.
   */
  useEffect(() => {
    if (days.length === 0) return;
    // Only choose when the current selection is not a day of THIS outreach —
    // which covers both the first render and arriving from another event. A
    // plain "set it every time days changes" would snap the organiser back to
    // today every time the query refetched, mid-way through marking day two.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds from the day rows and deliberately keeps a selection the organiser has already made
    setSelectedDayId((current) => {
      if (current && days.some((day) => day.id === current)) return current;
      const runningToday = days.find((day) => day.day === todayIso());
      return runningToday?.id ?? days[days.length - 1]?.id ?? null;
    });
  }, [days]);

  const selectedDay = days.find((day) => day.id === selectedDayId) ?? days[0] ?? null;

  const attendanceForSelectedDay = useMemo(
    () => attendanceForDay(attendanceQuery.data ?? {}, selectedDay?.id),
    [attendanceQuery.data, selectedDay?.id]
  );

  const commitments = useMemo(() => commitmentsQuery.data ?? {}, [commitmentsQuery.data]);

  /**
   * Only ACCEPTED applicants who COMMITTED to this day are on the roster.
   *
   * Someone pending, waitlisted or rejected was never expected at the event, so
   * marking them absent would be meaningless — and the check-in endpoint
   * refuses their scan for the same reason. Someone who never offered this
   * particular day is in the same position for that day alone.
   *
   * An application with no commitment rows recorded is treated as committed to
   * every day. That is the honest reading of every application made before
   * commitments existed, and of a quick join nobody was asked to choose on.
   */
  const roster = useMemo(
    () =>
      (applicationsQuery.data ?? []).filter((application) => {
        if (application.status !== 'accepted') return false;
        if (!selectedDay) return true;
        const committed = commitments[application.id];
        if (!committed || committed.length === 0) return true;
        return committed.includes(selectedDay.id);
      }),
    [applicationsQuery.data, commitments, selectedDay]
  );

  const { rows, presentCount, absentCount, checkedInCount } = useMemo(() => {
    // Two groups: the people the organiser still has to make a call on (never
    // scanned, or scanned somewhere that contradicts the venue), and everyone
    // whose attendance is already settled. Putting the exceptions first is
    // what makes this screen a short job rather than a list to read through.
    const outstanding: ApplicationWithVolunteer[] = [];
    const settled: ApplicationWithVolunteer[] = [];
    let present = 0;
    let absent = 0;
    let checkedIn = 0;

    for (const application of roster) {
      const attendance = attendanceForSelectedDay[application.volunteer_id];
      if (isPresent(attendance)) present += 1;
      else absent += 1;
      if (attendance?.checked_in_at) checkedIn += 1;
      if (needsAction(attendance)) outstanding.push(application);
      else settled.push(application);
    }

    const out: Row[] = [];
    if (outstanding.length > 0) {
      out.push({
        kind: 'header',
        key: 'header-outstanding',
        label: `Needs a look (${outstanding.length})`,
        hint: 'Nobody here scanned, or their scan did not match the venue. They still count as present unless you say otherwise.',
      });
      for (const application of outstanding) {
        out.push({ kind: 'volunteer', key: application.id, application });
      }
    }
    if (settled.length > 0) {
      out.push({
        kind: 'header',
        key: 'header-settled',
        label: `Settled (${settled.length})`,
        hint: 'Checked in by scan, or already decided by you. Change any of them if you saw different.',
      });
      for (const application of settled) {
        out.push({ kind: 'volunteer', key: application.id, application });
      }
    }

    return { rows: out, presentCount: present, absentCount: absent, checkedInCount: checkedIn };
  }, [roster, attendanceForSelectedDay]);

  const isLoading =
    outreachQuery.isLoading ||
    applicationsQuery.isLoading ||
    daysQuery.isLoading ||
    attendanceQuery.isLoading;
  const isError = outreachQuery.isError || applicationsQuery.isError || attendanceQuery.isError;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Mark attendance" fallback={`/(organisation)/outreach/${id}`} />
        <ListSkeleton rows={5} rowHeight={72} />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Mark attendance" fallback={`/(organisation)/outreach/${id}`} />
        <View style={styles.centerFill}>
          <ErrorState
            message={
              humanErrorOrNull(outreachQuery.error) ??
              (humanError(applicationsQuery.error)) ??
              (humanError(attendanceQuery.error, 'Please try again.'))
            }
            onRetry={() => {
              void outreachQuery.refetch();
              void applicationsQuery.refetch();
              void daysQuery.refetch();
              void attendanceQuery.refetch();
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const multiDay = days.length > 1;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Mark attendance" fallback={`/(organisation)/outreach/${id}`} />

      <View style={styles.summary}>
        <Text style={styles.title} numberOfLines={2}>
          {outreachQuery.data?.title ?? 'Outreach'}
        </Text>
        <Text style={styles.meta}>
          {formatDaySpan(days.map((day) => day.day)) || outreachQuery.data?.date}
        </Text>
        <Text style={styles.explainer}>
          Everyone is counted present. Only flag the people who did not turn up.
        </Text>
      </View>

      {/*
        The day strip appears only when there is more than one day. A one-day
        outreach has nothing to choose between, and a strip of one would be a
        control that does nothing.
      */}
      {multiDay ? (
        <View style={styles.daySection}>
          <Text style={styles.dayLabel}>Which day</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayStrip}
          >
            {days.map((day, index) => {
              const active = day.id === selectedDay?.id;
              return (
                <Pressable
                  key={day.id}
                  onPress={() => setSelectedDayId(day.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Day ${index + 1}, ${formatDayShort(day.day)}`}
                  style={[styles.dayChip, active && styles.dayChipActive]}
                >
                  <Text style={[styles.dayChipIndex, active && styles.dayChipTextActive]}>
                    Day {index + 1}
                  </Text>
                  <Text style={[styles.dayChipDate, active && styles.dayChipTextActive]}>
                    {formatDayShort(day.day)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.dayHint}>
            Only volunteers who committed to this day are listed. Days you never look at simply
            do not count.
          </Text>
        </View>
      ) : null}

      {resolve.isError ? <Text style={styles.errorText}>{humanError(resolve.error)}</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>{item.label}</Text>
                <Text style={styles.sectionHint}>{item.hint}</Text>
              </View>
            );
          }

          const { application } = item;
          const volunteer = application.volunteer;
          return (
            <AttendanceRow
              name={volunteer?.profile?.full_name ?? 'Volunteer'}
              avatarUrl={volunteer?.profile?.avatar_url ?? null}
              category={volunteer?.category ?? null}
              attendance={attendanceForSelectedDay[application.volunteer_id]}
              isPending={
                resolve.isPending && resolve.variables?.volunteerId === application.volunteer_id
              }
              onToggle={() => {
                if (!id || !selectedDay) return;
                const attendance = attendanceForSelectedDay[application.volunteer_id];
                resolve.mutate({
                  outreachId: id,
                  volunteerId: application.volunteer_id,
                  // Always sent, even for a one-day outreach where the server
                  // could work it out: the screen already knows which day it is
                  // showing, and letting the server infer it is one more place
                  // the two could disagree.
                  outreachDayId: selectedDay.id,
                  status: isPresent(attendance) ? 'absent' : 'present',
                });
              }}
            />
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="account-group-outline"
            title={multiDay ? 'Nobody committed to this day' : 'Nobody accepted yet'}
            message={
              multiDay
                ? 'No accepted volunteer offered this day. Check another day, or accept more people.'
                : 'Attendance appears here once you have accepted volunteers for this outreach.'
            }
          />
        }
      />

      {roster.length > 0 ? (
        <View style={styles.footer}>
          <View style={styles.footerCounts}>
            <Text style={styles.footerPrimary}>
              {presentCount} present
              {absentCount > 0 ? ` · ${absentCount} absent` : ''}
            </Text>
            <Text style={styles.footerSecondary}>
              {checkedInCount} of {roster.length} scanned in
              {multiDay && selectedDay ? ` · ${formatDayShort(selectedDay.day)}` : ''}
            </Text>
          </View>
          {/*
            "Done", not "Submit": every tap above has already been saved
            through /api/checkin. A submit button would imply the roster is
            sitting unsaved, and an organiser who backed out without pressing
            it would reasonably think their absences had been lost.
          */}
          <Button
            title="Done"
            variant="solid"
            onPress={() => router.replace(`/(organisation)/outreach/${id}`)}
            style={styles.footerButton}
          />
        </View>
      ) : null}
    </SafeAreaView>
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
  summary: {
    paddingHorizontal: spacing.xl,
    gap: 2,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  explainer: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  // A section of its own with real space around it, not a strip wedged against
  // the summary above and the list below.
  daySection: {
    marginTop: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  dayLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
    paddingHorizontal: spacing.xl,
  },
  dayStrip: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
  },
  dayChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 2,
    minWidth: 96,
  },
  dayChipActive: {
    backgroundColor: colors.navy,
  },
  dayChipIndex: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: colors.textSecondary,
  },
  dayChipDate: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  dayChipTextActive: {
    color: colors.white,
  },
  dayHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
    paddingBottom: spacing.lg,
  },
  sectionHeader: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    gap: 2,
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  sectionHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  footerCounts: {
    flex: 1,
  },
  footerPrimary: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  footerSecondary: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  footerButton: {
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
});
