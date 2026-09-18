import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar, Badge, formatEventDate, formatEventTimeRange, isUpcomingEvent } from '@/components/ui';
import { describeCommitment, formatDaySpan } from '@/lib/outreachDays';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { VolunteerApplication } from '@/hooks';
import type { ApplicationStatus } from '@/types/database';

/**
 * The colour of the status dot and its label.
 *
 * WHY THE COLOURED RAIL IS GONE (owner, 2026-09-18: "there is a green line
 * attached to the cards that I do not understand. Remove it or explain what
 * it is").
 *
 * That line was a four-pixel border down the left edge of the card, painted in
 * the application's status colour: green for accepted, amber for pending,
 * coral for waitlisted. It was added two days earlier so a list of
 * applications could be read as a shape rather than as five titles.
 *
 * The owner's question is the verdict on it. A colour carries meaning only to
 * somebody who has been told the key; nothing in the app told anybody, and the
 * device appeared on no other screen. So on the one screen that exists to
 * answer "where do my applications stand", the most prominent mark on every
 * card was the one thing that could not be read. A legend would only have been
 * a second thing to learn.
 *
 * What replaced it is a band across the top of the card carrying the status IN
 * WORDS plus a sentence saying what it means for the volunteer. Colour stays
 * as a small dot beside the words, where it reinforces something already
 * legible instead of being the only thing said.
 */
const STATUS_ACCENT: Record<ApplicationStatus, string> = {
  pending: colors.warning,
  accepted: colors.success,
  waitlisted: colors.primary,
  /*
    NOT RED. A decision that went against the volunteer is not an error and not
    a warning: the organisation chose other people. `rejected` used to be drawn
    in danger red, which said something the platform does not mean.
  */
  rejected: colors.textSecondary,
  not_selected: colors.textSecondary,
  cancelled: colors.textSecondary,
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
 * The sentence under the status word.
 *
 * Every status gets one, and each says what the status means for the
 * VOLUNTEER rather than restating the label. "Waitlisted" on its own reads as
 * a soft rejection; "you are number 3 of 8, and the top of the queue is
 * confirmed automatically" is a real prospect they can act on, and it is
 * exactly what the promotion rule does.
 */
function statusExplanation(
  application: VolunteerApplication,
  waitlistPosition?: { position: number; waitlistSize: number }
): string {
  switch (application.status) {
    case 'pending':
      return 'The organisation has not decided yet. You will be told as soon as it does.';
    case 'accepted':
      return 'Your place is confirmed. The organisation is expecting you on the day.';
    case 'waitlisted':
      return waitlistPosition
        ? `You are number ${waitlistPosition.position} of ${waitlistPosition.waitlistSize} waiting. If a place frees up, the top of the queue is confirmed automatically.`
        : 'You are in the queue. If a place frees up, the top of the queue is confirmed automatically.';
    case 'cancelled':
      return application.late_cancellation
        ? 'You withdrew within 24 hours of the start, so this one counted against your V-Score.'
        : 'You withdrew from this outreach.';
    case 'rejected':
    case 'not_selected':
    default:
      return 'The organisation chose other volunteers this time. Nothing about your record changed.';
  }
}

/**
 * One card in the applications tracker.
 *
 * THE CARD LANGUAGE IS THE FEED'S (owner, 2026-09-18: the containers "look out
 * of place with the rest of the app, there is no coordination with anything
 * else"). That was right. The card was a bordered box with a coloured edge and
 * six stacked icon rows, a shape that appears nowhere else in the app.
 *
 * It is now built from the same three parts as OutreachFeedCard, in the same
 * order, from the same tokens: a band across the top, a body whose facts sit
 * in a two-column stat row (32dp circular icon, tiny uppercase caption, one
 * value), and a footer divided off by a hairline with a badge on one side and
 * the action on the other. The feed's band is the flyer and carries the
 * organisation; this band carries the status, because that is what this screen
 * is for. Put the two screens side by side and they read as one app.
 *
 * Withdrawal is offered only where it is actually possible:
 * `applications_update_own_cancel` permits it for any of the volunteer's own
 * rows, but withdrawing from an event that has already happened, or from an
 * application that was already closed out, is noise.
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

    So the band leads with the event being off, and the withdraw button goes:
    there is nothing left to withdraw from.
  */
  const eventCancelled = outreach?.status === 'cancelled';
  const canWithdraw =
    upcoming &&
    !eventCancelled &&
    (application.status === 'pending' || application.status === 'accepted' || application.status === 'waitlisted');

  const accent = eventCancelled ? colors.danger : STATUS_ACCENT[application.status];
  const statusLabel = eventCancelled ? 'Event cancelled' : STATUS_LABEL[application.status];
  const explanation = eventCancelled
    ? 'The organisation called this event off. Nothing is expected of you, and your record is unaffected.'
    : statusExplanation(application, waitlistPosition);

  /*
    The second stat is whichever fact is actually worth a column on THIS card.
    A multi-day event's committed days are what the volunteer promised and what
    their attendance is measured against, so they win; on the one-day event
    most of these are, there is no commitment to state and the hours are what
    somebody needs next.
  */
  const secondStat = commitment
    ? { icon: 'calendar-check-outline' as const, caption: 'YOUR DAYS', value: commitment }
    : timeRange
      ? { icon: 'clock-outline' as const, caption: 'HOURS', value: timeRange }
      : null;

  const place = outreach
    ? [outreach.location_name, outreach.district, outreach.region].filter(Boolean).join(', ')
    : '';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${outreach?.title ?? 'Application'}, ${statusLabel}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {/*
        THE STATUS BAND. One tint for every status rather than five: the dot
        and the word carry the status, and five different card fills would make
        one list of applications read as five different components.
      */}
      <View style={styles.statusBand}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={[styles.statusLabel, { color: accent }]}>{statusLabel}</Text>
        </View>
        <Text style={styles.statusNote}>{explanation}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {outreach?.title ?? 'Outreach unavailable'}
        </Text>

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
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <View style={styles.statIcon}>
                <MaterialCommunityIcons name="calendar-outline" size={16} color={colors.primary} />
              </View>
              <View style={styles.statText}>
                <Text style={styles.statLabel}>WHEN</Text>
                <Text style={styles.statValue} numberOfLines={1}>
                  {dateLabel}
                </Text>
              </View>
            </View>

            {secondStat ? (
              <View style={styles.stat}>
                <View style={styles.statIcon}>
                  <MaterialCommunityIcons name={secondStat.icon} size={16} color={colors.primary} />
                </View>
                <View style={styles.statText}>
                  <Text style={styles.statLabel}>{secondStat.caption}</Text>
                  <Text style={styles.statValue} numberOfLines={1}>
                    {secondStat.value}
                  </Text>
                </View>
              </View>
            ) : (
              // An empty half rather than one stat stretched across the card,
              // so every card in the list keeps the same column rhythm.
              <View style={styles.stat} />
            )}
          </View>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.footerText}>
            {place ? (
              <Text style={styles.place} numberOfLines={1}>
                <MaterialCommunityIcons name="map-marker-outline" size={12} color={colors.textSecondary} />{' '}
                {place}
              </Text>
            ) : null}
            <Badge
              label={application.type === 'quick_join' ? 'Quick Join' : 'Full Application'}
              tone="neutral"
              style={styles.typeBadge}
            />
          </View>
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
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /*
    THE FEED CARD'S CONTAINER, TO THE TOKEN: white ground, one-pixel border,
    radius.lg, clipped so the status band's fill reaches the rounded corners.
  */
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
  statusBand: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: 1,
    // borderOnSurface, not border: this line sits on the tinted band, and
    // #E5E7EB on #F9FAFB is drawn without being visible.
    borderBottomColor: colors.borderOnSurface,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  statusNote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  body: {
    padding: spacing.base,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  org: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.base,
    marginTop: spacing.base,
  },
  stat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  statText: {
    flex: 1,
  },
  statLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  statValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
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
  footerText: {
    flex: 1,
    gap: spacing.sm,
  },
  place: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  typeBadge: {
    alignSelf: 'flex-start',
  },
  withdraw: {
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
