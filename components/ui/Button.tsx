import { Pressable, PressableProps, StyleProp, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export type ButtonVariant = 'solid' | 'outline' | 'text';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  /** Button label. Pass pre-cased text (e.g. "BECOME A VOLUNTEER") or use `uppercase`. */
  title: string;
  /** solid = filled navy pill (default, light screens). outline = bordered pill. text = plain link, no chrome. */
  variant?: ButtonVariant;
  /** Use the white-on-dark color scheme (for hero/dark backgrounds) instead of the default navy/coral scheme. */
  inverted?: boolean;
  /** Force uppercase + letter-spacing on the label. */
  uppercase?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

/**
 * Shared pill-shaped button used across auth screens (and beyond).
 * Minimum 44pt touch target per accessibility requirements.
 */
export function Button({
  title,
  variant = 'solid',
  inverted = false,
  uppercase = false,
  style,
  textStyle,
  accessibilityLabel,
  disabled,
  ...pressableProps
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        variant === 'solid' && styles.solid,
        variant === 'outline' && (inverted ? styles.outlineInverted : styles.outline),
        variant === 'text' && styles.text,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      {...pressableProps}
    >
      <Text
        style={[
          styles.label,
          variant === 'solid' && styles.labelSolid,
          variant === 'outline' && (inverted ? styles.labelInverted : styles.labelOutline),
          variant === 'text' && (inverted ? styles.labelInverted : styles.labelText),
          uppercase && styles.uppercase,
          textStyle,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  solid: {
    backgroundColor: colors.navy,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.navy,
  },
  outlineInverted: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.white,
  },
  text: {
    backgroundColor: 'transparent',
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
  },
  labelSolid: {
    color: colors.white,
  },
  labelOutline: {
    color: colors.navy,
  },
  labelInverted: {
    color: colors.white,
  },
  labelText: {
    color: colors.primary,
  },
  uppercase: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
