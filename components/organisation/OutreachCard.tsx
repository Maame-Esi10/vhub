import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Badge, FlyerBackground, daysUntilEvent, formatEventDate, formatEventTimeRange } from '@/components/ui';
import { dayShortfallSummary, hasHiddenDayShortfall, type DayCoverage } from '@/lib/dayCoverage';
import { formatDayShort, formatDaySpan } from '@/lib/outreachDays';
import { UNDER_SUBSCRIPTION_STAGES, isUnderSubscribed, placesRemaining } from '@/lib/underSubscription';
import type { BadgeTone } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { OutreachWithCounts } from '@/hooks';
import type { OutreachStatus } from '@/types/database';

const STATUS_TONE: Record<OutreachStatus, BadgeTone> = {
  draft: 'neutral',
  open: 'success',
  closed: 'warning',
  completed: 'navy',
  cancelled: 'danger',
};

const STATUS_LABEL: Record<OutreachStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export interface OutreachCardProps {
  outreach: OutreachWithCounts;
  /**
   * Every day this outreach runs on, `YYYY-MM-DD`. Omitted or empty falls back
   * to `outreaches.date`, which is the FIRST day — right for the one-day event
   * most of these are, and what shows while the day query is still in flight.
   */
  days?: readonly string[];
  /**
   * Per-day staffing, derived from live commitments. Absent on a single-day
   * outreach and while the query is in flight.
   */
  dayCoverage?: readonly DayCoverage[];
  onPress: () => void;
  /** Publish (draft -> open) or close (open -> closed) quick action, when applicable. */
  quickAction?: { label: string; onPress: () => void };
  quickActionPending?: boolean;
}

/**
 * Dashboard "deployment queue" card: flyer band with the title and status, then
 * date, location, slots and the pending applicant count.
 *
 * This card is now built from the SAME parts as the volunteer feed card
 * (components/volunteer/OutreachFeedCard.tsx): a FlyerBackground header band
 * carrying white type, over a bordered white body. It previously rendered as a
 * flat grey `colors.surface` block with no image and no border — not a
 * regression, but a gap: it was written in Phase 2 before the feed card's
 * treatment existed, and when flyers were added the organisation side was never
 * brought along. An organisation looking at its own event should see the event
 * as volunteers see it, flyer included.
 */
export function OutreachCard({
  outreach,
  days,
  dayCoverage,
  onPress,
  quickAction,
  quickActionPending,
}: OutreachCardProps) {
  // The whole span, not the first day. An organisation scanning its own queue
  // could not tell a one-day clinic from a three-week campaign, because both
  // printed the single date the campaign happens to START on.
  const dateLabel = days && days.length > 0 ? formatDaySpan(days) : formatEventDate(outreach.date);
  // Venue first, for the same reason as the volunteer feed card: an
  // organisation running several events at different sites recognises them by
  // where they are, not by which district they fall in.
  const location = outreach.location_name
    ? outreach.location_name
    : [outreach.district, outreach.region].filter(Boolean).join(', ');
  const timeRange = formatEventTimeRange(outreach.start_time, outreach.end_time);
  const pending = outreach.applicantCounts.pending;

  /*
    Under-subscription, shown in the app rather than only in a push. The push
    fires once per stage and is easy to miss; an organiser opening the
    dashboard should be able to see which events are short without counting.

    It STATES the position and stops — no suggestion to reduce slots or move
    the date. See lib/underSubscription.ts for why that boundary matters.
  */
  const daysOut = daysUntilEvent(outreach.date);
  const isShort =
    daysOut !== null &&
    daysOut >= 0 &&
    daysOut <= UNDER_SUBSCRIPTION_STAGES[0]!.daysOut &&
    isUnderSubscribed({
      status: outreach.status,
      slotsFilled: outreach.slots_filled,
      slotsTotal: outreach.slots_total,
    });

  const remaining = placesRemaining({
    slotsFilled: outreach.slots_filled,
    slotsTotal: outreach.slots_total,
  });

  /*
    WHEN "5 OF 5 FILLED" AND A SHORT DAY ARE BOTH TRUE.

    `slots_filled` counts accepted PEOPLE. Once a volunteer can release one day
    of a multi-day outreach, five people can be accepted while Saturday has
    four on it — so the footer says the event is full and a day of it is not.

    Neither number is wrong, and showing only one of them is what would make
    this read as a bug. The card states the day figure explicitly whenever it
    disagrees with the event figure, so the organisation sees both and the
    difference is named rather than discovered.
  */
  const coverage = dayCoverage ?? [];
  const dayGapLine =
    coverage.length > 1 ? dayShortfallSummary(coverage, formatDayShort) : null;
  const hiddenGap = hasHiddenDayShortfall(
    coverage,
    outreach.slots_filled,
    outreach.slots_total
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Manage ${outreach.title}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <FlyerBackground uri={outreach.flyer_url} style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            <Badge label={STATUS_LABEL[outreach.status]} tone={STATUS_TONE[outreach.status]} />
            {pending > 0 ? (
              <View style={styles.pendingPill}>
                <Text style={styles.pendingText}>
                  {pending} pending
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {outreach.title}
          </Text>
        </View>
      </FlyerBackground>

      <View style={styles.body}>
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="calendar" size={14} color={colors.textSecondary} />
          <Text style={styles.metaText} numberOfLines={1}>
            {dateLabel}
            {timeRange ? ` · ${timeRange}` : ''}
          </Text>
        </View>

        {location ? (
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1}>
              {location}
            </Text>
          </View>
        ) : null}

        {/*
          Shown ABOVE the general shortfall note when the event reads full,
          because in that case it is the only thing telling the organisation
          anything is wrong at all.
        */}
        {dayGapLine ? (
          <View style={[styles.shortfall, hiddenGap && styles.shortfallDay]}>
            <MaterialCommunityIcons
              name="calendar-alert"
              size={14}
              color={hiddenGap ? colors.warning : colors.textSecondary}
            />
            <Text style={styles.shortfallText}>
              {dayGapLine}
              {hiddenGap ? ' · the event itself is full' : ''}
            </Text>
          </View>
        ) : null}

        {isShort ? (
          <View style={styles.shortfall}>
            <MaterialCommunityIcons name="account-alert-outline" size={14} color={colors.warning} />
            <Text style={styles.shortfallText}>
              {daysOut === 0 ? 'Today' : daysOut === 1 ? 'Tomorrow' : `${daysOut} days to go`}
              {' · '}
              {remaining} {remaining === 1 ? 'place' : 'places'} still open
            </Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.slots}>
            <MaterialCommunityIcons name="account-group" size={16} color={colors.primary} />
            <Text style={styles.slotsText}>
              {outreach.slots_filled}/{outreach.slots_total} filled
            </Text>
          </View>

          {quickAction ? (
            <Pressable
              onPress={quickAction.onPress}
              disabled={quickActionPending}
              accessibilityRole="button"
              accessibilityLabel={`${quickAction.label} ${outreach.title}`}
              style={[styles.quickAction, quickActionPending && styles.quickActionDisabled]}
              hitSlop={4}
            >
              {quickActionPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.quickActionText}>{quickAction.label}</Text>
              )}
            </Pressable>
          ) : (
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.base,
  },
  pressed: {
    opacity: 0.85,
  },
  // A MINIMUM height, not a fixed one, so the band is identical on every card
  // whether or not a flyer was uploaded and the queue keeps its rhythm as
  // images arrive — while still growing for a two-line title. Shorter than the
  // volunteer feed card's 132: this is a working list an organiser scans, not
  // a discovery surface.
  header: {
    minHeight: 108,
    justifyContent: 'flex-end',
  },
  headerContent: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white,
  },
  pendingPill: {
    borderWidth: 1,
    borderColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pendingText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.white,
  },
  body: {
    padding: spacing.base,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  metaText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  shortfall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  // Tinted only when it is the ONLY warning on the card — an event reading full
  // while a day is short is the case nothing else would surface.
  shortfallDay: {
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
  },
  shortfallText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  slots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  slotsText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  quickAction: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
  },
  quickActionDisabled: {
    opacity: 0.6,
  },
  quickActionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.white,
  },
});
