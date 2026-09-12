import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, spacing } from '@/constants/theme';

export interface OnboardingStepHeaderProps {
  /** Centered uppercase title, e.g. "ONBOARDING" or "EXPERT ONBOARDING". */
  title: string;
  onBack: () => void;
  /** Optional element rendered at the trailing edge, e.g. a "SKIP" link. */
  trailing?: React.ReactNode;
}

/** Back arrow + centered uppercase title, shared by every onboarding step screen. */
export function OnboardingStepHeader({ title, onBack, trailing }: OnboardingStepHeaderProps) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
        <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.trailing}>{trailing}</View>
    </View>
  );
}

export interface OnboardingStepFooterProps {
  /** 1-indexed step number. */
  step: number;
  total: number;
  /** Section caption, e.g. "SKILL CONFIGURATION". */
  section: string;
}

/** "STEP X OF N • SECTION NAME" caption, shared by every onboarding step screen. */
export function OnboardingStepFooter({ step, total, section }: OnboardingStepFooterProps) {
  return (
    <Text style={styles.footer}>
      STEP {step} OF {total} • {section.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',

    // alignItems centres children within their line; alignContent places

    // the line itself, and defaults to flex-start. Without it a wrapping row

    // pins its single line to the TOP of the box.

    alignContent: 'center',
    justifyContent: 'space-between',
    // Wraps instead of clipping when the row outgrows its width at a large
    // system font size. rowGap only applies between wrapped lines, so a row
    // that still fits on one is unaffected.
    flexWrap: 'wrap',
    rowGap: 4,
    paddingVertical: spacing.base,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    color: colors.textPrimary,
  },
  trailing: {
    minWidth: 22,
    alignItems: 'flex-end',
  },
  footer: {
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginTop: spacing.base,
  },
});
