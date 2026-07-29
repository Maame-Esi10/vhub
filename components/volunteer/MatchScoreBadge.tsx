import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface MatchScoreBadgeProps {
  /**
   * 0–100 match score from `/api/match`, or null when this outreach hasn't
   * been ranked for the viewer — which now means the ranking service was
   * unreachable and the feed fell back to an unranked list, not that scoring
   * is unimplemented.
   */
  score?: number | null;
  /** Dark pill for use over a coloured card header, per the Figma feed cards. */
  onDark?: boolean;
  /** When provided, the pill becomes tappable and shows the "why this match" affordance. */
  onPress?: () => void;
}

/**
 * The "98% MATCH" pill from design-refs/Volunteer Home Feed.png.
 *
 * Deliberately renders "NOT RANKED YET" rather than a plausible-looking
 * number when no score is available — a fake percentage is exactly the kind
 * of thing that survives into a demo and gets mistaken for the real matching
 * engine.
 */
export function MatchScoreBadge({ score = null, onDark = false, onPress }: MatchScoreBadgeProps) {
  const scored = typeof score === 'number';
  const label = scored ? `${Math.round(score)}% MATCH` : 'NOT RANKED YET';
  const accessibilityLabel = scored
    ? `${Math.round(score)} percent match${onPress ? ', see breakdown' : ''}`
    : 'Match score not available';

  const content = (
    <>
      <View style={[styles.dot, scored ? styles.dotScored : styles.dotUnscored]} />
      <Text style={[styles.label, onDark && styles.labelOnDark]} numberOfLines={1}>
        {label}
      </Text>
      {onPress && scored ? (
        <MaterialCommunityIcons
          name="information-outline"
          size={12}
          color={onDark ? colors.navy : colors.textSecondary}
        />
      ) : null}
    </>
  );

  // Only scored pills are interactive — there is nothing to break down when
  // the feed is showing its unranked fallback.
  if (!onPress || !scored) {
    return (
      <View style={[styles.pill, onDark && styles.pillOnDark]} accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [styles.pill, onDark && styles.pillOnDark, pressed && styles.pillPressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  pillOnDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  pillPressed: {
    opacity: 0.75,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotScored: {
    backgroundColor: colors.success,
  },
  dotUnscored: {
    backgroundColor: colors.textSecondary,
  },
  label: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.4,
    color: colors.textPrimary,
  },
  labelOnDark: {
    color: colors.navy,
  },
});
