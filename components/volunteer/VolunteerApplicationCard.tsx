import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Badge, formatEventDate, formatEventTimeRange, isUpcomingEvent } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { VolunteerApplication } from '@/hooks';
import type { ApplicationStatus } from '@/types/database';

const STATUS_TONE: Record<ApplicationStatus, BadgeTone> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  waitlisted: 'primary',
  cancelled: 'neutral',
};

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: 'Under review',
  accepted: 'Accepted',
  rejected: 'Not selected',
  waitlisted: 'Waitlisted',
  cancelled: 'Withdrawn',
};

export interface VolunteerApplicationCardProps {
  application: VolunteerApplication;
  onPress: () => void;
  onWithdraw: () => void;
  /** Live queue place, for waitlisted applications only. Absent while it loads. */
  waitlistPosition?: { position: number; waitlistSize: number };
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
}: VolunteerApplicationCardProps) {
  const outreach = application.outreach;
  const timeRange = outreach ? formatEventTimeRange(outreach.start_time, outreach.end_time) : null;
  const upcoming = outreach ? isUpcomingEvent(outreach.date, outreach.start_time) : false;
  const canWithdraw =
    upcoming && (application.status === 'pending' || application.status === 'accepted' || application.status === 'waitlisted');

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
        <Badge label={STATUS_LABEL[application.status]} tone={STATUS_TONE[application.status]} />
      </View>

      <Text style={styles.org} numberOfLines={1}>
        {outreach?.organisation?.org_name ?? 'Unknown organisation'}
      </Text>

      {outreach ? (
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="calendar-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.meta} numberOfLines={1}>
            {formatEventDate(outreach.date)}
            {timeRange ? ` · ${timeRange}` : ''}
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
  org: {
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
