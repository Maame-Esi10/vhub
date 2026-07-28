import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Input } from './Input';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  placeholder: string;
  value: string | null;
  options: SelectOption[];
  onSelect: (value: string) => void;
  searchable?: boolean;
  error?: string;
  disabled?: boolean;
  /** Shown under the field when disabled, e.g. "Choose a region first". */
  disabledHint?: string;
}

/** Pressable field styled like Input that opens a modal list to single-select a value. */
export function SelectField({
  label,
  placeholder,
  value,
  options,
  onSelect,
  searchable = false,
  error,
  disabled = false,
  disabledHint,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLabel = options.find((option) => option.value === value)?.label ?? null;

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return options;
    return options.filter((option) => option.label.toLowerCase().includes(trimmed));
  }, [options, query]);

  function handleSelect(next: string) {
    onSelect(next);
    setOpen(false);
    setQuery('');
  }

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedLabel ?? placeholder}`}
        style={[
          styles.field,
          !!error && styles.fieldError,
          disabled && styles.fieldDisabled,
        ]}
      >
        <Text style={[styles.value, !selectedLabel && styles.placeholder]}>
          {selectedLabel ?? placeholder}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {disabled && disabledHint ? <Text style={styles.hint}>{disabledHint}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <SafeAreaView style={styles.sheet} edges={['bottom']}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
              >
                <MaterialCommunityIcons name="close" size={22} color={colors.textPrimary} />
              </Pressable>
            </View>
            {searchable ? (
              <Input
                placeholder="Search..."
                value={query}
                onChangeText={setQuery}
                leadingIcon={<MaterialCommunityIcons name="magnify" size={18} color={colors.textSecondary} />}
                containerStyle={styles.search}
              />
            ) : null}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleSelect(item.value)}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  style={styles.option}
                >
                  <Text style={styles.optionLabel}>{item.label}</Text>
                  {item.value === value ? (
                    <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
                  ) : null}
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No matches.</Text>}
            />
          </SafeAreaView>
        </View>
      </Modal>
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
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  fieldDisabled: {
    opacity: 0.5,
  },
  value: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  placeholder: {
    color: colors.textSecondary,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 11, 15, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '75%',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.base,
  },
  sheetTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  search: {
    marginBottom: spacing.sm,
  },
  list: {
    paddingBottom: spacing.xl,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
