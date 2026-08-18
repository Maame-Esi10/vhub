import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Badge, FlyerBackground, formatEventTimeRange } from '@/components/ui';
import { formatDaySpan } from '@/lib/outreachDays';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { ROLE_TYPES, VOLUNTEER_CATEGORIES } from '@/constants/categories';
import type { OutreachWizardState } from '@/components/organisation/outreachWizard';

export interface OutreachPreviewCardProps {
  state: OutreachWizardState;
}

/** Read-only summary shown on the Create Outreach preview step (design-refs/Create Outreach - Preview.png). */
export function OutreachPreviewCard({ state }: OutreachPreviewCardProps) {
  const location = [state.locationName, state.district, state.region].filter(Boolean).join(', ');
  const timeRange = formatEventTimeRange(state.startTime || null, state.endTime || null);
  const only = state.roles.length === 1 ? state.roles[0] : undefined;
  const totalSlots = state.roles.reduce((sum, role) => sum + role.slotsTotal, 0);

  // One role reads as a pair of badges, the way every outreach preview always
  // has. Several read as a breakdown, because neither the category nor the
  // role type has a single answer then.
  const categoryLabel = only
    ? (VOLUNTEER_CATEGORIES.find((c) => c.value === only.category)?.label ?? 'Any profession')
    : null;
  const roleTypeLabel = only
    ? (ROLE_TYPES.find((r) => r.value === only.roleType)?.label ?? null)
    : null;

  const roleSummary = only
    ? null
    : state.roles
        .map(
          (role) =>
            `${role.slotsTotal} ${VOLUNTEER_CATEGORIES.find((c) => c.value === role.category)?.label ?? 'volunteers'}`
        )
        .join(' · ');

  return (
    <View style={styles.card}>
      {/*
        The uploaded flyer, so the preview shows what the volunteer will
        actually see. Without a flyer this falls back to the navy band and the
        heart glyph — which is what the preview showed unconditionally before,
        flyer or not, and is why an uploaded flyer appeared to vanish.
      */}
      <FlyerBackground uri={state.flyerUrl} style={styles.hero}>
        <View style={styles.heroContent}>
          {state.flyerUrl ? null : (
            <MaterialCommunityIcons name="hand-heart-outline" size={40} color={colors.white} />
          )}
        </View>
        <Badge label="Live Preview" tone="primary" style={styles.previewBadge} textStyle={styles.previewBadgeText} />
      </FlyerBackground>

      <View style={styles.body}>
        <Text style={styles.title}>{state.title || 'Untitled outreach'}</Text>

        <View style={styles.infoRow}>
          <View style={styles.infoPill}>
            <MaterialCommunityIcons name="calendar" size={14} color={colors.primary} />
            {/*
              formatDaySpan rather than formatEventDate: it reads a one-day
              outreach exactly as the old single date did, and says "3 days"
              or "4 days · Oct 3 – Oct 24" for the rest, so the preview shows
              the same thing the volunteer's card will.
            */}
            <Text style={styles.infoText}>
              {state.days.length > 0 ? formatDaySpan(state.days) : 'No date set'}
              {timeRange ? ` · ${timeRange}` : ''}
            </Text>
          </View>
        </View>

        {location ? (
          <View style={styles.infoRow}>
            <View style={styles.infoPill}>
              <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.primary} />
              <Text style={styles.infoText}>{location}</Text>
            </View>
          </View>
        ) : null}

        {state.description ? <Text style={styles.description}>{state.description}</Text> : null}

        {roleSummary ? (
          <View style={styles.roleSummaryRow}>
            <MaterialCommunityIcons name="account-group-outline" size={14} color={colors.primary} />
            <Text style={styles.roleSummaryText}>{roleSummary}</Text>
          </View>
        ) : null}

        <View style={styles.tagsRow}>
          {roleTypeLabel ? <Badge label={roleTypeLabel} tone="neutral" /> : null}
          {categoryLabel ? <Badge label={categoryLabel} tone="neutral" /> : null}
          <Badge label={`${totalSlots} slot${totalSlots === 1 ? '' : 's'}`} tone="neutral" />
        </View>

        {state.requiredSkills.length > 0 ? (
          <View style={styles.skillsRow}>
            {state.requiredSkills.map((skill) => (
              <View key={skill} style={styles.skillChip}>
                <Text style={styles.skillLabel}>{skill}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  hero: {
    height: 120,
    justifyContent: 'center',
  },
  heroContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.background,
  },
  previewBadgeText: {
    color: colors.primary,
  },
  body: {
    padding: spacing.base,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  infoRow: {
    marginBottom: spacing.xs,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  infoText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  description: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  roleSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.base,
  },
  roleSummaryText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.base,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  skillChip: {
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  skillLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
});
