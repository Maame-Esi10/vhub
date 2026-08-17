import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  EmptyState,
  ErrorState,
  ListSkeleton,
  ScreenHeader,
  formatEventDate,
} from '@/components/ui';
import { AttendanceRow } from '@/components/organisation';
import { useOutreach } from '@/hooks/useOutreaches';
import { useOutreachApplications } from '@/hooks/useApplications';
import { useOutreachAttendance, useResolveAttendance } from '@/hooks/useAttendance';
import { isPresent, needsAction } from '@/lib/attendance';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { ApplicationWithVolunteer } from '@/hooks/useApplications';
import type { Attendance } from '@/types/database';

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
  const attendanceQuery = useOutreachAttendance(id);
  const resolve = useResolveAttendance();

  const attendanceByVolunteer = useMemo(
    () => attendanceQuery.data ?? ({} as Record<string, Attendance>),
    [attendanceQuery.data]
  );

  /**
   * Only ACCEPTED applicants are on the roster. Someone pending, waitlisted or
   * rejected was never expected at the event, so marking them absent would be
   * meaningless — and the check-in endpoint refuses their scan for the same
   * reason.
   */
  const roster = useMemo(
    () => (applicationsQuery.data ?? []).filter((application) => application.status === 'accepted'),
    [applicationsQuery.data]
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
      const attendance = attendanceByVolunteer[application.volunteer_id];
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
  }, [roster, attendanceByVolunteer]);

  const isLoading =
    outreachQuery.isLoading || applicationsQuery.isLoading || attendanceQuery.isLoading;
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
              outreachQuery.error?.message ??
              (applicationsQuery.error instanceof Error
                ? applicationsQuery.error.message
                : undefined) ??
              (attendanceQuery.error instanceof Error
                ? attendanceQuery.error.message
                : 'Please try again.')
            }
            onRetry={() => {
              void outreachQuery.refetch();
              void applicationsQuery.refetch();
              void attendanceQuery.refetch();
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Mark attendance" fallback={`/(organisation)/outreach/${id}`} />

      <View style={styles.summary}>
        <Text style={styles.title} numberOfLines={2}>
          {outreachQuery.data?.title ?? 'Outreach'}
        </Text>
        {outreachQuery.data ? (
          <Text style={styles.meta}>{formatEventDate(outreachQuery.data.date)}</Text>
        ) : null}
        <Text style={styles.explainer}>
          Everyone is counted present. Only flag the people who did not turn up.
        </Text>
      </View>

      {resolve.isError ? (
        <Text style={styles.errorText}>{resolve.error.message}</Text>
      ) : null}

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
              attendance={attendanceByVolunteer[application.volunteer_id]}
              isPending={
                resolve.isPending && resolve.variables?.volunteerId === application.volunteer_id
              }
              onToggle={() => {
                if (!id) return;
                const attendance = attendanceByVolunteer[application.volunteer_id];
                resolve.mutate({
                  outreachId: id,
                  volunteerId: application.volunteer_id,
                  status: isPresent(attendance) ? 'absent' : 'present',
                });
              }}
            />
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="account-group-outline"
            title="Nobody accepted yet"
            message="Attendance appears here once you have accepted volunteers for this outreach."
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
