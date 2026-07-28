import { useMemo, useState } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Input } from './Input';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface MultiSelectSection {
  title: string;
  data: string[];
}

export interface MultiSelectFieldProps {
  label: string;
  placeholder: string;
  selected: string[];
  sections: MultiSelectSection[];
  onChange: (next: string[]) => void;
  error?: string;
}

/**
 * Pressable field that opens a searchable, sectioned multi-select modal.
 * Same search + toggle interaction as app/(auth)/onboarding/skills.tsx, generalised for reuse.
 */
export function MultiSelectField({
  label,
  placeholder,
  selected,
  sections,
  onChange,
  error,
}: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filteredSections = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return sections;
    return sections
      .map((section) => ({
        title: section.title,
        data: section.data.filter((item) => item.toLowerCase().includes(trimmed)),
      }))
      .filter((section) => section.data.length > 0);
  }, [sections, query]);

  function toggle(item: string) {
    const next = new Set(selectedSet);
    if (next.has(item)) {
      next.delete(item);
    } else {
      next.add(item);
    }
    onChange(Array.from(next));
  }

  function removeChip(item: string) {
    onChange(selected.filter((entry) => entry !== item));
  }

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected.length} selected`}
        style={[styles.field, !!error && styles.fieldError]}
      >
        <Text style={[styles.value, selected.length === 0 && styles.placeholder]}>
          {selected.length > 0 ? `${selected.length} selected` : placeholder}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {selected.length > 0 ? (
        <View style={styles.chipRow}>
          {selected.map((item) => (
            <Pressable
              key={item}
              onPress={() => removeChip(item)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item}`}
              style={styles.chip}
            >
              <Text style={styles.chipLabel}>{item}</Text>
              <MaterialCommunityIcons name="close" size={14} color={colors.primary} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <SafeAreaView style={styles.sheet} edges={['bottom']}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Done"
                hitSlop={12}
                style={styles.doneButton}
              >
                <Text style={styles.done}>Done</Text>
              </Pressable>
            </View>
            <Input
              placeholder="Search skills..."
              value={query}
              onChangeText={setQuery}
              leadingIcon={<MaterialCommunityIcons name="magnify" size={18} color={colors.textSecondary} />}
              containerStyle={styles.search}
            />
            <SectionList
              sections={filteredSections}
              keyExtractor={(item) => item}
              style={styles.list}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => (
                <Text style={styles.sectionHeader}>{section.title}</Text>
              )}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{item}</Text>
                  <Switch
                    value={selectedSet.has(item)}
                    onValueChange={() => toggle(item)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={colors.white}
                  />
                </View>
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.primary,
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
    height: '80%',
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
  doneButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  done: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.primary,
  },
  search: {
    marginBottom: spacing.sm,
  },
  list: {
    flex: 1,
  },
  sectionHeader: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginTop: spacing.base,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
