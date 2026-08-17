import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar, Badge, FlyerBackground, formatEventDate, formatEventTimeRange } from '@/components/ui';
import { MatchScoreBadge } from '@/components/volunteer/MatchScoreBadge';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { OutreachWithOrganisation } from '@/hooks';

export interface OutreachFeedCardProps {
  outreach: OutreachWithOrganisation;
  /**
   * The organisation's logo. Passed in rather than read here because the logo
   * lives on `profiles.avatar_url`, which the outreach embed cannot reach —
   * the screen fetches them for the whole list in one query instead. Null or
   * absent falls back to initials.
   */
  organisationLogoUrl?: string | null;
  onPress: () => void;
  /** 0–100 from `/api/match`, or null when the feed is showing its unranked fallback. */
  matchScore?: number | null;
  /** Opens the "why this match" breakdown. Omit to leave the match pill non-interactive. */
  onPressScore?: () => void;
  /**
   * "2 doctors · 3 nurses · 5 students" for a multi-role outreach. Omitted in
   * single-role mode, where the category badge already says everything.
   */
  roleSummary?: string | null;
}

/**
 * Feed card from design-refs/Volunteer Home Feed.png.
 *
 * The Figma card is topped with event photography. That is now the
 * organisation's own uploaded flyer (`outreaches.flyer_url`), rendered by
 * FlyerBackground, which falls back to the solid navy band when no flyer was
 * uploaded — so both states carry the same content (match pill, organisation
 * eyebrow, title) at the same size.
 */
export function OutreachFeedCard({
  outreach,
  organisationLogoUrl,
  onPress,
  matchScore = null,
  onPressScore,
  roleSummary,
}: OutreachFeedCardProps) {
  const slotsLeft = Math.max(0, outreach.slots_total - outreach.slots_filled);
  const timeRange = formatEventTimeRange(outreach.start_time, outreach.end_time);
  // The VENUE leads, because it is the thing that tells a volunteer where to
  // go. District and region only stand in when no venue was given: "Ayawaso
  // West, Greater Accra" is an administrative area, not somewhere you can turn
  // up to.
  const place = outreach.location_name
    ? outreach.location_name
    : [outreach.district, outreach.region].filter(Boolean).join(', ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${outreach.title}, ${formatEventDate(outreach.date)}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <FlyerBackground uri={outreach.flyer_url} style={styles.header}>
        <View style={styles.headerContent}>
          <MatchScoreBadge score={matchScore} onDark onPress={onPressScore} />
          <View style={styles.orgRow}>
            <Avatar
              name={outreach.organisation?.org_name ?? 'Organisation'}
              uri={organisationLogoUrl}
              size={20}
            />
            <Text style={styles.eyebrow} numberOfLines={1}>
              {outreach.organisation?.org_name?.toUpperCase() ?? 'ORGANISATION'}
            </Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {outreach.title}
          </Text>
          {/*
            The breakdown, on the card itself. A volunteer scanning the feed
            needs to know an event wants students before opening it — without
            this, a multi-role outreach looks identical to a single-role one.
          */}
          {roleSummary ? (
            <Text style={styles.roleSummary} numberOfLines={1}>
              {roleSummary}
            </Text>
          ) : null}
        </View>
      </FlyerBackground>

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <View style={styles.statIcon}>
              <MaterialCommunityIcons name="account-multiple-outline" size={16} color={colors.primary} />
            </View>
            <View style={styles.statText}>
              <Text style={styles.statLabel}>OPENINGS</Text>
              <Text style={styles.statValue}>
                {slotsLeft === 0 ? 'Full' : `${slotsLeft} needed`}
              </Text>
            </View>
          </View>

          <View style={styles.stat}>
            <View style={styles.statIcon}>
              <MaterialCommunityIcons name="calendar-outline" size={16} color={colors.primary} />
            </View>
            <View style={styles.statText}>
              <Text style={styles.statLabel}>WHEN</Text>
              <Text style={styles.statValue} numberOfLines={1}>
                {formatEventDate(outreach.date)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerText}>
            {place ? (
              <Text style={styles.place} numberOfLines={1}>
                <MaterialCommunityIcons name="map-marker-outline" size={12} color={colors.textSecondary} />{' '}
                {place}
              </Text>
            ) : null}
            {timeRange ? <Text style={styles.time}>{timeRange}</Text> : null}
          </View>
          {outreach.role_type ? (
            <Badge
              label={outreach.role_type === 'clinical' ? 'Clinical' : 'Support'}
              tone={outreach.role_type === 'clinical' ? 'primary' : 'navy'}
            />
          ) : null}
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
  // A MINIMUM height, not a fixed one, so the band is the same size on every
  // card whether or not a flyer was uploaded — a list of cards must not change
  // its rhythm as images load — while still growing for a two-line title.
  header: {
    // Raised from 132: a card is how a volunteer decides whether to open an
    // outreach at all, and the flyer was being reduced to a band too shallow
    // to make out. Still a MINIMUM so the rhythm holds for cards without one.
    minHeight: 176,
    justifyContent: 'flex-end',
  },
  headerContent: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  roleSummary: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.white,
    opacity: 0.85,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  eyebrow: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.white,
    opacity: 0.7,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.white,
  },
  body: {
    padding: spacing.base,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.base,
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
  },
  place: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  time: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
