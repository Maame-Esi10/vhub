import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface NumberStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  error?: string;
}

/** Plus/minus + editable numeric field. Used for `slots_total` (no slider library installed). */
export function NumberStepper({ label, value, onChange, min = 1, max = 999, error }: NumberStepperProps) {
  function clamp(next: number): number {
    if (Number.isNaN(next)) return min;
    return Math.min(max, Math.max(min, next));
  }

  function handleTextChange(text: string) {
    const digits = text.replace(/\D/g, '');
    if (digits === '') {
      onChange(min);
      return;
    }
    onChange(clamp(parseInt(digits, 10)));
  }

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.row, !!error && styles.rowError]}>
        <Pressable
          onPress={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          accessibilityRole="button"
          accessibilityLabel="Decrease"
          hitSlop={8}
          style={[styles.button, value <= min && styles.buttonDisabled]}
        >
          <MaterialCommunityIcons name="minus" size={18} color={colors.textPrimary} />
        </Pressable>
        <TextInput
          value={String(value)}
          onChangeText={handleTextChange}
          keyboardType="number-pad"
          style={styles.input}
          accessibilityLabel={label}
          maxLength={3}
        />
        <Pressable
          onPress={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          accessibilityRole="button"
          accessibilityLabel="Increase"
          hitSlop={8}
          style={[styles.button, value >= max && styles.buttonDisabled]}
        >
          <MaterialCommunityIcons name="plus" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  rowError: {
    borderColor: colors.danger,
  },
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.background,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  input: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
    minHeight: 44,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
