import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
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
  /*
    A horizontal ScrollView must be told NOT to grow.

    React Native gives every ScrollView a base style of its own, and for
    `horizontal` that base is `{ flexGrow: 1, flexShrink: 1, flexDirection:
    'row' }`. In a column-flex screen that flexGrow makes the picker expand
    into all the vertical space the list is not using, and the content
    container's default `alignItems: 'stretch'` then stretches every chip to
    that full height — which is how short chips became half-screen pills.

    It only surfaced when the wrapping View was removed (so that the track
    could reach the screen edge): the wrapper had an auto height, so there was
    nothing for flexGrow to grow into. Nothing about the chips changed. The
    fix is to pin the picker to its content height here rather than to
    reinstate the wrapper, which would bring the clipping back.
  */
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  // The screen's horizontal inset lives HERE, on the scrollable content, not on
  // a wrapping View. With it on the wrapper the ScrollView's own bounds were
  // inset too, so the track ended before the screen edge and the last chip sat
  // permanently clipped and unreachable. On the content the list scrolls edge
  // to edge and still starts and ends flush with the rest of the screen.
  row: {
    // Belt and braces with `scroll` above: centring the chips on the cross axis
    // means each one is its own height even if some future parent does give
    // this ScrollView a height.
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xl,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 44,
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
