import {
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Badge, FlyerBackground, formatEventTimeRange } from '@/components/ui';
import { formatDaySpan, dayStringsOf } from '@/lib/outreachDays';
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

        {/*
          THE META ROWS SHARE ONE RAIL, ONE COLOUR AND THE CARD'S WIDTH.

          Three faults, all reported from a device, all in this block:

          The text ran past the right edge. A Text inside a flex row does not
          shrink on its own — without `flex: 1` it lays out at its natural
          width and simply overflows. Every meta value now sits in a flexed
          block, so a long venue wraps inside the card instead of escaping it.

          The icons sat beside the SECOND line. The row centred its children,
          so once the text wrapped the glyph centred against the whole block.
          They are top-aligned now, in a fixed 20pt column with the glyph's
          line height matched to the text's, so icon and first line share one
          line box — and because the column is a fixed width, the calendar and
          the pin start at the same left edge despite being different widths.

          The colours disagreed: date and venue were black while the
          description beneath them was grey, so the meta block read as two
          unrelated things. One grey now. Only the title is black.

          This is lifted from the Outreach Detail card's rail, which already
          solved all three. The volunteer feed card and Outreach Detail itself
          are deliberately untouched.
        */}
        <View style={styles.metaRow}>
          <View style={styles.metaIconColumn}>
            <MaterialCommunityIcons
              name="calendar"
              size={14}
              color={colors.primary}
              style={styles.metaIcon}
            />
          </View>
          {/*
            formatDaySpan rather than formatEventDate: it reads a one-day
            outreach exactly as the old single date did, and names the days for
            a scatter, so the preview shows the same thing the volunteer's card
            will.
          */}
          <Text style={styles.metaText}>
            {state.days.length > 0 ? formatDaySpan(dayStringsOf(state.days)) : 'No date set'}
            {timeRange ? ` · ${timeRange}` : ''}
          </Text>
        </View>

        {location ? (
          <View style={styles.metaRow}>
            <View style={styles.metaIconColumn}>
              <MaterialCommunityIcons
                name="map-marker-outline"
                size={14}
                color={colors.primary}
                style={styles.metaIcon}
              />
            </View>
            <Text style={styles.metaText}>{location}</Text>
          </View>
        ) : null}

        {state.description ? <Text style={styles.description}>{state.description}</Text> : null}

        {roleSummary ? (
          <View style={[styles.metaRow, styles.roleSummaryRow]}>
            <View style={styles.metaIconColumn}>
              <MaterialCommunityIcons
                name="account-group-outline"
                size={14}
                color={colors.primary}
                style={styles.metaIcon}
              />
            </View>
            <Text style={styles.metaText}>{roleSummary}</Text>
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
  metaRow: {
    flexDirection: 'row',
    // Top-aligned so the glyph anchors to the FIRST line. Centring stranded
    // the calendar beside line two of a wrapped date.
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  // The rail. Glyphs do not share an advance width -- the calendar is wider
  // than the pin -- so a fixed-width container is what makes the two rows
  // start at the same left edge. Sizing the glyph itself would not.
  metaIconColumn: {
    width: 20,
    alignItems: 'center',
  },
  // Matched to metaText's line height so the icon and the first line of text
  // occupy one line box and read as one line.
  metaIcon: {
    lineHeight: 19,
  },
  metaText: {
    // Without this the Text lays out at its natural width inside the row and
    // runs off the card. This is the whole overflow fix.
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  description: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  // The staffing breakdown is the same kind of row as the date and the venue,
  // so it uses the same rail and only adds the space that separates it from
  // the description above.
  roleSummaryRow: {
    marginTop: spacing.base,
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
