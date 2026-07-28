import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface StepProgressBarProps {
  /** 1-indexed current step. */
  step: number;
  total: number;
  label?: string;
}

/** Segmented progress bar for multi-step wizards, e.g. Create Outreach. */
export function StepProgressBar({ step, total, label }: StepProgressBarProps) {
  return (
    <View>
      <View style={styles.track}>
        {Array.from({ length: total }).map((_, index) => (
          <View
            key={index}
            style={[styles.segment, index < step && styles.segmentFilled]}
          />
        ))}
      </View>
      <Text style={styles.caption}>
        {label ?? `STEP ${step} OF ${total}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  segmentFilled: {
    backgroundColor: colors.primary,
  },
  caption: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
