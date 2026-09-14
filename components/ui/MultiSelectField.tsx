import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Input } from './Input';
import { CategoryChecklist } from './CategoryChecklist';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface MultiSelectSection {
  title: string;
  /** MaterialCommunityIcons glyph for the category card. Falls back to a generic tag. */
  icon?: string;
  data: string[];
}

export interface MultiSelectFieldProps {
  label: string;
  placeholder: string;
  selected: string[];
  sections: MultiSelectSection[];
  onChange: (next: string[]) => void;
  error?: string;
  /** Renders a red asterisk beside the label. */
  required?: boolean;
}

/**
 * Pressable field that opens a searchable, sectioned multi-select picker.
 *
 * FULL SCREEN, NOT AN 80% SHEET. The skills vocabulary is seventy-five entries
 * across nine categories, and a sheet that leaves a fifth of the screen showing
 * the page behind it wastes the space where the list goes. It also shows how
 * many are selected and how many matched a search, because with a list this
 * long the two questions people ask are "what have I already picked" and "did
 * my search find anything".
 */
export function MultiSelectField({
  label,
  placeholder,
  selected,
  sections,
  onChange,
  error,
  required,
}: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const searching = query.trim().length > 0;

  const filteredSections = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return sections;
    return sections
      .map((section) => ({
        ...section,
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
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
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

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
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
            <Text style={styles.pickerMeta}>
              {selected.length} selected
              {query.trim()
                ? ` · ${filteredSections.reduce((sum, section) => sum + section.data.length, 0)} match "${query.trim()}"`
                : ''}
            </Text>

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {filteredSections.length === 0 ? (
                <Text style={styles.pickerEmpty}>
                  Nothing matches &quot;{query.trim()}&quot;. Try a shorter word.
                </Text>
              ) : null}

              <CategoryChecklist
                sections={filteredSections}
                selected={selectedSet}
                onToggle={toggle}
                searching={searching}
              />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // The asterisk carries the "you must fill this in" signal, so the message
  // below the field no longer has to explain that it is required and can be one
  // short line about what is wrong.
  requiredMark: {
    color: colors.danger,
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
    backgroundColor: colors.background,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
  },
  pickerEmpty: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    paddingVertical: spacing.xl,
    textAlign: 'center',
  },
  pickerMeta: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
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
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
