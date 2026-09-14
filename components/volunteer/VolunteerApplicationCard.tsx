import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar, Badge, formatEventDate, formatEventTimeRange, isUpcomingEvent } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { describeCommitment, formatDaySpan } from '@/lib/outreachDays';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { VolunteerApplication } from '@/hooks';
import type { ApplicationStatus } from '@/types/database';

const STATUS_TONE: Record<ApplicationStatus, BadgeTone> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  waitlisted: 'primary',
  not_selected: 'neutral',
  cancelled: 'neutral',
};

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: 'Under review',
  accepted: 'Accepted',
  rejected: 'Not selected',
  waitlisted: 'Waitlisted',
  not_selected: 'Not selected',
  cancelled: 'Withdrawn',
};

export interface VolunteerApplicationCardProps {
  application: VolunteerApplication;
  onPress: () => void;
  onWithdraw: () => void;
  /**
   * The organisation's logo. Passed in because it lives on
   * `profiles.avatar_url`, which the application's embedded outreach cannot
   * reach; the screen looks them up for the whole list at once.
   */
  organisationLogoUrl?: string | null;
  /** Live queue place, for waitlisted applications only. Absent while it loads. */
  waitlistPosition?: { position: number; waitlistSize: number };
  /**
   * Every day the EVENT runs on, and the subset of them this application
   * promised — both `YYYY-MM-DD`, both looked up for the whole list at once.
   *
   * Absent falls back to `outreaches.date`, which is the first day: right for
   * the one-day event most of these are, and what shows while the query is in
   * flight.
   */
  eventDays?: readonly string[];
  committedDays?: readonly string[];
}

/**
 * One row of the applications tracker. Withdrawal is offered only where it is
 * actually possible: `applications_update_own_cancel` permits it for any of
 * the volunteer's own rows, but withdrawing from an event that has already
 * happened, or from an application that was already closed out, is noise.
 */
export function VolunteerApplicationCard({
  application,
  onPress,
  onWithdraw,
  waitlistPosition,
  organisationLogoUrl,
  eventDays,
  committedDays,
}: VolunteerApplicationCardProps) {
  const outreach = application.outreach;
  const timeRange = outreach ? formatEventTimeRange(outreach.start_time, outreach.end_time) : null;
  /*
    THE WHOLE SPAN, NOT THE FIRST DAY.

    `outreaches.date` is the first day of the event, so a four-day campaign read
    here as a single Monday — and the volunteer had no way to tell, from the
    screen that exists to track what they have signed up for, that they had
    promised four days rather than one.

    `upcoming` below deliberately still asks about the FIRST day. It gates
    withdrawal, and the rule is "you cannot withdraw once the event has begun" —
    which is a question about the start, not the end. Withdrawal is also
    all-or-nothing: there is no per-day withdrawal, so allowing it mid-campaign
    would cancel days already attended.
  */
  const days = eventDays && eventDays.length > 0 ? eventDays : outreach ? [outreach.date] : [];
  const dateLabel = outreach
    ? days.length > 0
      ? formatDaySpan(days)
      : formatEventDate(outreach.date)
    : '';
  const commitment =
    days.length > 1 && committedDays && committedDays.length > 0
      ? describeCommitment(committedDays.length, days.length)
      : '';
  const upcoming = outreach ? isUpcomingEvent(outreach.date, outreach.start_time) : false;

  /*
    THE EVENT'S STATUS OUTRANKS THE APPLICATION'S.

    Cancelling an event deliberately leaves the applications alone -- writing
    `cancelled` onto them would mean the volunteer withdrew, and would stamp a
    late-withdrawal V-Score penalty for the organiser's decision. The cost of
    that correctness is that the application still reads `accepted` or
    `pending`, which on its own is now misleading: "pending" implies a decision
    is still coming for an event that is not happening, and nothing resolves
    those applications afterwards.

    So the card leads with the event being off, and the withdraw button goes:
    there is nothing left to withdraw from.
  */
  const eventCancelled = outreach?.status === 'cancelled';
  const canWithdraw =
    upcoming &&
    !eventCancelled &&
    (application.status === 'pending' || application.status === 'accepted' || application.status === 'waitlisted');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={outreach?.title ?? 'Application'}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={2}>
          {outreach?.title ?? 'Outreach unavailable'}
        </Text>
        {eventCancelled ? (
          <Badge label="Event cancelled" tone="danger" />
        ) : (
          <Badge label={STATUS_LABEL[application.status]} tone={STATUS_TONE[application.status]} />
        )}
      </View>

      {eventCancelled ? (
        <Text style={styles.cancelledLine}>
          The organisation cancelled this event. Nothing is expected of you, and your record is
          unaffected.
        </Text>
      ) : null}

      <View style={styles.orgRow}>
        <Avatar
          name={outreach?.organisation?.org_name ?? 'Organisation'}
          uri={organisationLogoUrl}
          size={18}
        />
        <Text style={styles.org} numberOfLines={1}>
          {outreach?.organisation?.org_name ?? 'Unknown organisation'}
        </Text>
      </View>

      {outreach ? (
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="calendar-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.meta} numberOfLines={1}>
            {dateLabel}
            {timeRange ? ` · ${timeRange}` : ''}
          </Text>
        </View>
      ) : null}

      {/*
        Only on an event that runs more than one day, and only once the
        commitment has loaded. On a one-day event it would say nothing the date
        line has not already said.
      */}
      {commitment ? (
        <View style={styles.metaRow}>
          <MaterialCommunityIcons
            name="calendar-check-outline"
            size={13}
            color={colors.textSecondary}
          />
          <Text style={styles.meta} numberOfLines={1}>
            You are on {commitment.toLowerCase()}
          </Text>
        </View>
      ) : null}

      {outreach?.district || outreach?.region ? (
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.meta} numberOfLines={1}>
            {[outreach.location_name, outreach.district, outreach.region].filter(Boolean).join(', ')}
          </Text>
        </View>
      ) : null}

      {/*
        A waitlist place, said plainly and with what happens next. "Waitlisted"
        on its own reads as a soft rejection; "3rd of 8, and the top of the
        queue takes any freed slot automatically" is a real prospect the
        volunteer can act on — and it is exactly what the promotion rule does.
      */}
      {application.status === 'waitlisted' && waitlistPosition ? (
        <View style={styles.waitlist}>
          <MaterialCommunityIcons name="format-list-numbered" size={14} color={colors.textSecondary} />
          <Text style={styles.waitlistText}>
            You are <Text style={styles.waitlistStrong}>#{waitlistPosition.position}</Text> of{' '}
            {waitlistPosition.waitlistSize} waiting. If a place frees up, the top of the queue is
            confirmed automatically.
          </Text>
        </View>
      ) : null}

      <View style={styles.footerRow}>
        <Badge
          label={application.type === 'quick_join' ? 'Quick Join' : 'Full Application'}
          tone="neutral"
        />
        {application.status === 'cancelled' && application.late_cancellation ? (
          <Badge label="Late withdrawal" tone="danger" icon="alert-circle-outline" />
        ) : null}
        {canWithdraw ? (
          <Pressable
            onPress={onWithdraw}
            accessibilityRole="button"
            accessibilityLabel={`Withdraw from ${outreach?.title ?? 'this outreach'}`}
            hitSlop={8}
            style={styles.withdraw}
          >
            <Text style={styles.withdrawText}>Withdraw</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
  waitlist: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  waitlistText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  waitlistStrong: {
    fontFamily: fontFamily.semiBold,
    color: colors.textPrimary,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  cancelledLine: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  org: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  meta: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',

    // alignItems centres children within their line; alignContent places
    // the line itself, and defaults to flex-start. Without it a wrapping row
    // pins its single line to the TOP of the box.
    alignContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.base,
  },
  withdraw: {
    marginLeft: 'auto',
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  withdrawText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.danger,
  },
});
