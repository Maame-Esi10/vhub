import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ErrorState, ListSkeleton, ScreenHeader } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { usePlatformStats, type MonthlyNoShows } from '@/hooks';

/**
 * The platform, in numbers.
 *
 * MOBILE-APPROPRIATE, per the brief: a few large legible figures on scrollable
 * cards, not a dashboard squeezed onto a phone. Each card answers one question
 * and says what the question IS, because a number with no question attached is
 * decoration.
 *
 * The no-show trend is drawn as bars made of plain Views. A charting library
 * would be a new dependency — gated in this project — for six numbers, and six
 * bars scaled to the largest is a chart already.
 */
export default function AdminStats() {
  const stats = usePlatformStats();

  if (stats.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Statistics" fallback="/(admin)/overview" />
        <View style={styles.stateWrap}>
          <ListSkeleton rows={4} rowHeight={96} />
        </View>
      </SafeAreaView>
    );
  }

  if (stats.isError || !stats.data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Statistics" fallback="/(admin)/overview" />
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              stats.error instanceof Error ? stats.error.message : 'Could not load the statistics.'
            }
            onRetry={() => stats.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const data = stats.data;
  const waiting = data.backlog.credentials + data.backlog.organisations + data.backlog.disputes;
  const fillPercent = data.fillRate
    ? Math.round((data.fillRate.filled / data.fillRate.total) * 100)
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Statistics" fallback="/(admin)/overview" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={stats.isRefetching} onRefresh={() => stats.refetch()} />
        }
      >
        {/*
          The backlog leads because it is the only number on this screen about
          the admin's own conduct rather than the platform's. Everything else
          can wait; somebody waiting on a decision cannot.
        */}
        <Card
          icon="inbox-arrow-down-outline"
          question="Is anybody waiting on me?"
          value={String(waiting)}
          unit={waiting === 1 ? 'decision waiting' : 'decisions waiting'}
          tone={waiting > 0 ? 'attention' : 'calm'}
        >
          <Text style={styles.detail}>
            {data.backlog.credentials} credential
            {data.backlog.credentials === 1 ? '' : 's'} · {data.backlog.organisations} organisation
            {data.backlog.organisations === 1 ? '' : 's'} · {data.backlog.disputes} dispute
            {data.backlog.disputes === 1 ? '' : 's'}
          </Text>
        </Card>

        <Card
          icon="target"
          question="Does the matching work?"
          value={fillPercent === null ? '—' : `${fillPercent}%`}
          unit="of places filled"
          tone="calm"
        >
          <Text style={styles.detail}>
            {data.fillRate
              ? `${data.fillRate.filled} of ${data.fillRate.total} places across every event that has recruited. Drafts and cancelled events are not counted — an empty draft is not a matching failure.`
              : 'No outreach has offered a place yet, so there is nothing to measure.'}
          </Text>
        </Card>

        <Card
          icon="account-clock-outline"
          question="Does accountability work?"
          value={String(data.noShowTrend.at(-1)?.noShows ?? 0)}
          unit="no-shows this month"
          tone="calm"
        >
          <NoShowBars trend={data.noShowTrend} />
          <Text style={styles.detail}>
            No-shows recorded per month over the last six. The direction matters more than any single
            month — a count on its own says nothing about whether the deterrent is working.
          </Text>
        </Card>

        <Card
          icon="account-group-outline"
          question="Who is on the platform?"
          value={String(data.volunteers + data.organisations)}
          unit="accounts"
          tone="calm"
        >
          <Text style={styles.detail}>
            {data.volunteers} volunteer{data.volunteers === 1 ? '' : 's'} ({data.verifiedVolunteers}{' '}
            verified) · {data.organisations} organisation
            {data.organisations === 1 ? '' : 's'} ({data.verifiedOrganisations} verified)
          </Text>
        </Card>

        <Card
          icon="calendar-multiple"
          question="What is happening?"
          value={String(Object.values(data.outreachesByStatus).reduce((sum, n) => sum + n, 0))}
          unit="outreaches in total"
          tone="calm"
        >
          <View style={styles.statusList}>
            {Object.entries(data.outreachesByStatus)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([status, count]) => (
                <View key={status} style={styles.statusRow}>
                  <Text style={styles.statusLabel}>{status}</Text>
                  <Text style={styles.statusCount}>{count}</Text>
                </View>
              ))}
            {Object.keys(data.outreachesByStatus).length === 0 ? (
              <Text style={styles.detail}>No outreach has been created yet.</Text>
            ) : null}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Six bars, scaled to the busiest month. A library for this would be a dependency for six numbers. */
function NoShowBars({ trend }: { trend: MonthlyNoShows[] }) {
  const peak = Math.max(1, ...trend.map((month) => month.noShows));

  return (
    <View style={styles.chart}>
      {trend.map((month) => (
        <View key={month.month} style={styles.chartColumn}>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.bar,
                {
                  // A month with none still shows a hairline, so an empty month
                  // reads as "none" rather than as missing data.
                  height: month.noShows === 0 ? 2 : `${(month.noShows / peak) * 100}%`,
                  backgroundColor: month.noShows === 0 ? colors.border : colors.primary,
                },
              ]}
            />
          </View>
          <Text style={styles.chartLabel}>{month.month.slice(5)}</Text>
          <Text style={styles.chartValue}>{month.noShows}</Text>
        </View>
      ))}
    </View>
  );
}

function Card({
  icon,
  question,
  value,
  unit,
  tone,
  children,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  question: string;
  value: string;
  unit: string;
  tone: 'calm' | 'attention';
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.card, tone === 'attention' && styles.cardAttention]}>
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={tone === 'attention' ? colors.warning : colors.primary}
        />
        <Text style={styles.question}>{question}</Text>
      </View>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  stateWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    gap: spacing.md,
  },
  cardAttention: { borderColor: colors.warning },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  question: { flex: 1, fontFamily: fontFamily.medium, fontSize: 13, color: colors.textSecondary },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  value: { fontFamily: fontFamily.bold, fontSize: 34, color: colors.textPrimary },
  unit: { flex: 1, fontFamily: fontFamily.regular, fontSize: 14, color: colors.textSecondary },
  detail: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  statusList: { gap: spacing.sm },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statusLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  statusCount: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.textPrimary },
  chart: { flexDirection: 'row', gap: spacing.sm, height: 110, alignItems: 'flex-end' },
  chartColumn: { flex: 1, alignItems: 'center', gap: spacing.xs },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: radius.sm, minHeight: 2 },
  chartLabel: { fontFamily: fontFamily.regular, fontSize: 11, color: colors.textSecondary },
  chartValue: { fontFamily: fontFamily.semiBold, fontSize: 12, color: colors.textPrimary },
});
