import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface MatchScoreBadgeProps {
  /**
   * 0–100 match score, or null when the outreach hasn't been scored yet.
   * Nothing produces a score in Phase 2 — `applications.match_score` is
   * service-role write-only and stays null until Phase 3's /api/match runs
   * Layer 1 (and Gemini Layer 2 on top of it). Every caller passes null
   * today; the scored branch exists so wiring the real value in Phase 3 is a
   * one-line change at the call site rather than a redesign here.
   */
  score?: number | null;
  /** Dark pill for use over a coloured card header, per the Figma feed cards. */
  onDark?: boolean;
}

/**
 * The "98% MATCH" pill from design-refs/Volunteer Home Feed.png.
 *
 * Deliberately renders "NOT RANKED YET" rather than a plausible-looking
 * number while scoring is unimplemented — a fake percentage is exactly the
 * kind of thing that survives into a demo and gets mistaken for the real
 * matching engine.
 */
export function MatchScoreBadge({ score = null, onDark = false }: MatchScoreBadgeProps) {
  const scored = typeof score === 'number';
  const label = scored ? `${Math.round(score)}% MATCH` : 'NOT RANKED YET';

  return (
    <View
      style={[styles.pill, onDark && styles.pillOnDark]}
      accessibilityLabel={scored ? `${Math.round(score)} percent match` : 'Match score not calculated yet'}
    >
      <View style={[styles.dot, scored ? styles.dotScored : styles.dotUnscored]} />
      <Text style={[styles.label, onDark && styles.labelOnDark]} numberOfLines={1}>
        {label}
      </Text>
    </View>
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
