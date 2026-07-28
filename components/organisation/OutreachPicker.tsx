import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { OutreachWithCounts } from '@/hooks';

export interface OutreachPickerProps {
  outreaches: OutreachWithCounts[];
  selectedId: string | undefined;
  onSelect: (outreachId: string) => void;
}

/** Horizontal picker of the org's outreaches; applicants.tsx lists applications for whichever is selected. */
export function OutreachPicker({ outreaches, selectedId, onSelect }: OutreachPickerProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {outreaches.map((outreach) => {
        const selected = outreach.id === selectedId;
        return (
          <TouchableOpacity
            key={outreach.id}
            onPress={() => onSelect(outreach.id)}
            accessibilityRole="button"
            accessibilityLabel={`View applicants for ${outreach.title}`}
            accessibilityState={{ selected }}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.title, selected && styles.titleSelected]} numberOfLines={1}>
              {outreach.title}
            </Text>
            {outreach.applicantCounts.pending > 0 ? (
              <View style={[styles.dot, selected && styles.dotSelected]}>
                <Text style={[styles.dotText, selected && styles.dotTextSelected]}>
                  {outreach.applicantCounts.pending}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    maxWidth: 220,
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  titleSelected: {
    color: colors.white,
  },
  dot: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  dotSelected: {
    backgroundColor: colors.white,
  },
  dotText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: colors.white,
  },
  dotTextSelected: {
    color: colors.navy,
  },
});
