import {
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tone?: 'neutral' | 'danger';
}

/**
 * One number on a summary grid.
 *
 * REDESIGNED (owner, 2026-09-21: the four boxes on the organisation home "are
 * grey boxes with text in them and nothing more").
 *
 * That was a fair description of what it was. A flat `surface` fill, a 10px
 * uppercase caption and a 16px glyph on one line, and the number underneath in
 * whatever space was left. Nothing in it said which part mattered, so four of
 * them side by side read as four grey rectangles rather than as four figures,
 * and the eye had to stop and parse each one to find the digit.
 *
 * THE NUMBER IS THE CARD. It is now the largest thing in it and the first
 * thing on the reading path, with the label underneath in ordinary sentence
 * case rather than shouting above it in 10px capitals. The icon moved into a
 * tinted tile at the top, which gives the card an anchor and gives the glyph
 * enough ground to be legible at 20px, and the fill changed from grey to the
 * white-plus-border container the feed, the applications tracker and the
 * roster all use, so the dashboard stops being the one screen with its own
 * idea of what a card looks like.
 *
 * `danger` still tints the number, and now the tile with it: the one figure
 * that means somebody is waiting on you should be findable without reading
 * four labels.
 */
export function MetricCard({ label, value, icon, tone = 'neutral' }: MetricCardProps) {
  const danger = tone === 'danger';
  const tint = danger ? colors.danger : colors.primary;

  return (
    <View style={styles.card}>
      <View
        style={[
          styles.iconTile,
          { backgroundColor: danger ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 107, 107, 0.12)' },
        ]}
      >
        <MaterialCommunityIcons name={icon} size={20} color={tint} />
      </View>

      <Text style={[styles.value, danger && styles.valueDanger]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    // Taller than the old 88: the card now holds three stacked elements
    // instead of a row and a number, and cramming them was the previous
    // design's whole problem.
    minHeight: 116,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    lineHeight: 34,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  valueDanger: {
    color: colors.danger,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
