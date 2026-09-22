import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { humanError } from '@/lib/errorMessage';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface SheetErrorProps {
  /** The failure. Null or undefined renders nothing at all. */
  error: unknown;
  fallback?: string;
}

/**
 * A failure banner for the TOP of a bottom sheet.
 *
 * WHY NOT ErrorAlert HERE. A sheet is already a Modal, and stacking a second
 * Modal on top of one is the arrangement that misbehaves most often on Android.
 * The sheets keep an in-place banner instead -- but at the TOP of the sheet,
 * directly under its title, rather than at the bottom of a scroller where the
 * old line of red text sat. On a long sheet (the full application form, the
 * review form) that line was frequently scrolled out of sight at the moment it
 * was written, which is the same fault ErrorAlert exists to fix everywhere else.
 *
 * It is deliberately NOT inside the ScrollView: a banner that can itself be
 * scrolled away is a banner that can be missed.
 */
export function SheetError({ error, fallback }: SheetErrorProps) {
  if (!error) return null;

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} />
      <Text style={styles.text}>{humanError(error, fallback)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: 'rgba(239, 68, 68, 0.10)',
  },
  text: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.danger,
  },
});
