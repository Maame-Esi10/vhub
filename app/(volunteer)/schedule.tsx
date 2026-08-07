import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  formatEventDate,
  formatEventTime,
  hasEventEnded,
  isEventToday,
  msUntilEvent,
} from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useVolunteerApplications } from '@/hooks';
import type { VolunteerApplication } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';

/** One flattened list so a single FlatList can render date-grouped sections. */
type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'event'; key: string; application: VolunteerApplication };

export default function Schedule() {
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
  const upcoming = useMemo(
    () =>
      applications
        .filter(
          (application) =>
            application.status === 'accepted' &&
            application.outreach !== null &&
            !hasEventEnded(application.outreach.date, application.outreach.end_time)
        )
        .sort((a, b) => {
          const aStart = a.outreach ? msUntilEvent(a.outreach.date, a.outreach.start_time) : null;
          const bStart = b.outreach ? msUntilEvent(b.outreach.date, b.outreach.start_time) : null;
          return (aStart ?? Number.MAX_SAFE_INTEGER) - (bStart ?? Number.MAX_SAFE_INTEGER);
        }),
    [applications]
  );

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

    return out;
  }, [upcoming]);

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
              applicationsQuery.error instanceof Error
                ? applicationsQuery.error.message
                : 'Please try again.'
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
        contentContainerStyle={styles.listContent}
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

          const outreach = item.application.outreach;
          if (!outreach) return null;
          const startLabel = formatEventTime(outreach.start_time) ?? 'All day';

          const isToday = isEventToday(outreach.date);

          return (
            <View>
              <Pressable
                onPress={() => router.push(`/(volunteer)/outreach/${outreach.id}?from=/(volunteer)/schedule`)}
                accessibilityRole="button"
                accessibilityLabel={`${outreach.title} at ${startLabel}`}
                style={({ pressed }) => [
                  styles.eventRow,
                  isToday && styles.eventRowToday,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.eventTime}>{startLabel}</Text>
                <View style={styles.eventDot} />
                <View style={styles.eventText}>
                  <Text style={styles.eventTitle} numberOfLines={1}>
                    {outreach.title}
                  </Text>
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {[outreach.organisation?.org_name, outreach.location_name, outreach.district]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
              </Pressable>

              {/*
                Attached to the event it belongs to, and shown only on the day.
                It used to be one standalone row at the top of the screen,
                which left a volunteer with several confirmed events unable to
                tell what they were checking in to — the button named no event,
                because it belonged to none of them.
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
    minHeight: 44,
    // Pulled up under its event row and indented past the time column, so it
    // reads as belonging to that event rather than as a separate item.
    marginTop: -spacing.xs,
    marginLeft: 70,
    marginBottom: spacing.sm,
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
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 60,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  /** Today's event gets a border so it stands out from the rest of the diary. */
  eventRowToday: {
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.xs,
  },
  pressed: {
    opacity: 0.85,
  },
  eventTime: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.textPrimary,
    minWidth: 62,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  eventText: {
    flex: 1,
  },
  eventTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  eventMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
