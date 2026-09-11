import {
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { getVScoreBand } from '@/lib/vscore';
import type { VScoreBand } from '@/lib/vscore';

const BAND_TONE: Record<VScoreBand, string> = {
  Elite: colors.success,
  Trusted: colors.success,
  Active: colors.warning,
  Developing: colors.warning,
  'At Risk': colors.danger,
};

export interface VScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md';
}

/** V-Score rendered as a ringed number with its band label. */
export function VScoreBadge({ score, size = 'md' }: VScoreBadgeProps) {
  const band = getVScoreBand(score);
  const tint = BAND_TONE[band];
  const dimension = size === 'md' ? 56 : 44;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.ring,
          { width: dimension, height: dimension, borderRadius: dimension / 2, borderColor: tint },
        ]}
      >
        <Text style={[styles.score, size === 'sm' && styles.scoreSm]}>{Math.round(score)}</Text>
      </View>
      <Text style={[styles.band, { color: tint }]}>{band}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  ring: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  score: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  scoreSm: {
    fontSize: 13,
  },
  band: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
});
