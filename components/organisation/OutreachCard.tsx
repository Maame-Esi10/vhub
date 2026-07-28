import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Badge, formatEventDate, formatEventTimeRange } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { OutreachWithCounts } from '@/hooks';
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

export interface OutreachCardProps {
  outreach: OutreachWithCounts;
  onPress: () => void;
  /** Publish (draft -> open) or close (open -> closed) quick action, when applicable. */
  quickAction?: { label: string; onPress: () => void };
  quickActionPending?: boolean;
}

/** Dashboard "deployment queue" row: title, status, date/location, slots, pending applicant count. */
export function OutreachCard({ outreach, onPress, quickAction, quickActionPending }: OutreachCardProps) {
  const location = [outreach.district, outreach.region].filter(Boolean).join(', ');
  const timeRange = formatEventTimeRange(outreach.start_time, outreach.end_time);
  const pending = outreach.applicantCounts.pending;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View applicants for ${outreach.title}`}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={1}>
          {outreach.title}
        </Text>
        <Badge label={STATUS_LABEL[outreach.status]} tone={STATUS_TONE[outreach.status]} />
      </View>

      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="calendar" size={14} color={colors.textSecondary} />
        <Text style={styles.metaText}>
          {formatEventDate(outreach.date)}
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

      <View style={styles.footerRow}>
        <View style={styles.slotsPill}>
          <MaterialCommunityIcons name="account-group" size={14} color={colors.textSecondary} />
          <Text style={styles.slotsText}>
            {outreach.slots_filled}/{outreach.slots_total} filled
          </Text>
        </View>

        {pending > 0 ? (
          <View style={styles.pendingPill}>
            <Text style={styles.pendingText}>{pending} pending</Text>
          </View>
        ) : null}

        <View style={styles.spacer} />

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
              <ActivityIndicator size="small" color={colors.navy} />
            ) : (
              <Text style={styles.quickActionText}>{quickAction.label}</Text>
            )}
          </Pressable>
        ) : (
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
    minHeight: 44,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  metaText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  slotsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slotsText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  pendingPill: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pendingText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.primary,
  },
  spacer: {
    flex: 1,
  },
  quickAction: {
    minHeight: 44,
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
