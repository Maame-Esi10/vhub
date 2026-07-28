import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Badge, formatEventDate, formatEventTimeRange } from '@/components/ui';
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
  const categoryLabel = VOLUNTEER_CATEGORIES.find((c) => c.value === state.requiredCategory)?.label;
  const roleTypeLabel = ROLE_TYPES.find((r) => r.value === state.roleType)?.label;

  return (
    <View style={styles.card}>
      <View style={styles.hero}>
        <MaterialCommunityIcons name="hand-heart-outline" size={40} color={colors.white} />
        <Badge label="Live Preview" tone="primary" style={styles.previewBadge} textStyle={styles.previewBadgeText} />
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{state.title || 'Untitled outreach'}</Text>

        <View style={styles.infoRow}>
          <View style={styles.infoPill}>
            <MaterialCommunityIcons name="calendar" size={14} color={colors.primary} />
            <Text style={styles.infoText}>
              {state.date ? formatEventDate(state.date) : 'No date set'}
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

        <View style={styles.tagsRow}>
          {roleTypeLabel ? <Badge label={roleTypeLabel} tone="neutral" /> : null}
          {categoryLabel ? <Badge label={categoryLabel} tone="neutral" /> : null}
          <Badge label={`${state.slotsTotal} slot${state.slotsTotal === 1 ? '' : 's'}`} tone="neutral" />
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
    backgroundColor: colors.navy,
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
