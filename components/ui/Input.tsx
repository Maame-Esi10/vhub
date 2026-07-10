import { forwardRef, ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface InputProps extends TextInputProps {
  /** Label rendered above the field. */
  label?: string;
  /** Icon (or any node) rendered at the leading edge of the pill. */
  leadingIcon?: ReactNode;
  /** Icon/element rendered at the trailing edge of the pill (e.g. show/hide password toggle). */
  trailingElement?: ReactNode;
  /** Error message rendered below the field; also switches the field border to `colors.danger`. */
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Shared pill-shaped text input used across auth + onboarding screens.
 * Minimal by design: a styled TextInput wrapper, not a form library.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, leadingIcon, trailingElement, error, containerStyle, style, multiline, ...textInputProps },
  ref
) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          multiline && styles.fieldMultiline,
          !!error && styles.fieldError,
        ]}
      >
        {leadingIcon ? (
          <View style={[styles.leading, multiline && styles.leadingMultiline]}>{leadingIcon}</View>
        ) : null}
        <TextInput
          ref={ref}
          style={[styles.input, multiline && styles.inputMultiline, style]}
          placeholderTextColor={colors.textSecondary}
          multiline={multiline}
          {...textInputProps}
        />
        {trailingElement ? <View style={styles.trailing}>{trailingElement}</View> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.base,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  fieldError: {
    borderColor: colors.danger,
  },
  fieldMultiline: {
    alignItems: 'flex-start',
    borderRadius: radius.lg,
    minHeight: 96,
    paddingVertical: spacing.md,
  },
  leading: {
    marginRight: spacing.sm,
  },
  leadingMultiline: {
    marginTop: spacing.xs,
  },
  trailing: {
    marginLeft: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
  },
  inputMultiline: {
    paddingVertical: 0,
    textAlignVertical: 'top',
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
