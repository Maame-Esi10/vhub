import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary' | 'navy';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const TONE_COLOR: Record<BadgeTone, string> = {
  neutral: colors.textSecondary,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  primary: colors.primary,
  navy: colors.navy,
};

/** Small pill label used for statuses (outreach/application/verification) and V-Score bands. */
export function Badge({ label, tone = 'neutral', icon, style, textStyle }: BadgeProps) {
  const tint = TONE_COLOR[tone];
  return (
    <View style={[styles.base, style]}>
      {icon ? <MaterialCommunityIcons name={icon} size={12} color={tint} style={styles.icon} /> : null}
      <Text style={[styles.label, { color: tint }, textStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  icon: {
    marginRight: 4,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
