import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useFontScale } from '@/constants/typography';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface GlanceItem {
  icon: IconName;
  /** The thing itself, in one or two words. */
  term: string;
  /** What it is, in a handful. Never a sentence. */
  meaning: string;
}

export interface GlanceGridProps {
  items: readonly GlanceItem[];
}

/**
 * The top of an Info Hub: every idea on the screen, named, in two words each.
 *
 * WHY (owner, 2026-09-15: "it reads as a wall of paragraphs and nobody absorbs
 * a vital distinction that way"). The hubs were a stack of collapsed sections,
 * which is a table of contents written as furniture: to find out whether the
 * screen answers your question you had to open things. Somebody who is not
 * sure what they want to know does not open anything, and leaves.
 *
 * This is the map. It is not tappable and deliberately so -- it makes no
 * promise of navigation it would then have to keep, and the sections it
 * describes are directly underneath. Its whole job is to let someone decide in
 * two seconds whether to keep reading, and to put the vocabulary in front of
 * people who have never seen it.
 *
 * TWO WORDS AND A HANDFUL, never a sentence. A glance layer that needs reading
 * is just the wall again in a smaller font.
 */
export function GlanceGrid({ items }: GlanceGridProps) {
  // One column at a large system font: two cards side by side are narrower
  // than the words in them long before they are too short to read.
  const { stacked } = useFontScale();

  return (
    <View style={[styles.grid, stacked && styles.gridStacked]}>
      {items.map((item) => (
        <View key={item.term} style={[styles.card, stacked && styles.cardFull]}>
          <MaterialCommunityIcons name={item.icon} size={20} color={colors.primary} />
          <Text style={styles.term}>{item.term}</Text>
          <Text style={styles.meaning}>{item.meaning}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridStacked: {
    flexDirection: 'column',
  },
  card: {
    // Two per row with the gap accounted for. flexBasis rather than flex so a
    // third item starts a new row instead of squeezing all three onto one.
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.xs,
  },
  cardFull: {
    flexBasis: 'auto',
    width: '100%',
  },
  term: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  meaning: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
});
