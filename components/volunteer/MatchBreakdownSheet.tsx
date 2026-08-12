import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { Layer1ComponentBreakdown, Layer1MatchResult } from '@/lib/matching/layer1';

export interface MatchBreakdownSheetProps {
  visible: boolean;
  outreachTitle: string;
  /** The 0-100 total and its five weighted components, straight from /api/match. */
  breakdown: Layer1MatchResult | null;
  /**
   * False when the server ranked with pure Layer 1 because Gemini was
   * unavailable. Shown honestly rather than hidden — the skills line means
   * something slightly different in each case.
   */
  layer2Applied: boolean;
  /**
   * The role this score was computed against, on a multi-role outreach.
   *
   * Without it a 92% names no requirement: an event wanting doctors, nurses
   * and students produces one number, and the volunteer has no way to know
   * which of the three it describes.
   */
  roleName?: string | null;
  onDismiss: () => void;
}

interface ComponentRow {
  key: keyof Omit<Layer1MatchResult, 'total'>;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Plain-language explanation of what earns points here. */
  explain: string;
}

/**
 * Order matches the spec's weighting, heaviest first, so the volunteer reads
 * the components in the order they actually move the score.
 */
const COMPONENTS: ComponentRow[] = [
  {
    key: 'skills',
    label: 'Skills',
    icon: 'stethoscope',
    explain: 'How much of what this event needs you already have on your profile.',
  },
  {
    key: 'category',
    label: 'Profession',
    icon: 'account-heart-outline',
    explain: 'Whether the role asks for your profession, or a closely related one.',
  },
  {
    key: 'location',
    label: 'Location',
    icon: 'map-marker-outline',
    explain: 'Full marks in your own district, half in your region.',
  },
  {
    key: 'availability',
    label: 'Availability',
    icon: 'calendar-clock',
    explain: 'Whether the event falls in a slot you marked yourself free for.',
  },
  {
    key: 'experience',
    label: 'Experience',
    icon: 'trending-up',
    explain: 'Your experience level, from beginner through to experienced.',
  },
];

function percent(component: Layer1ComponentBreakdown): number {
  return Math.round(component.raw * 100);
}

/**
 * The "why this match" panel behind the feed card's match pill.
 *
 * Shows every component's own 0–100% strength AND the points it contributed
 * out of its weight, because those answer different questions: "am I a good
 * fit on location?" versus "why is my total only 62?". A component that is
 * perfect but only worth 10 points looks misleadingly decisive without both.
 */
export function MatchBreakdownSheet({
  visible,
  outreachTitle,
  breakdown,
  layer2Applied,
  roleName,
  onDismiss,
}: MatchBreakdownSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Why this match?</Text>
            <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
              <MaterialCommunityIcons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          {breakdown ? (
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.eventTitle} numberOfLines={2}>
                {outreachTitle}
              </Text>

              <View style={styles.totalCard}>
                <Text style={styles.totalValue}>{Math.round(breakdown.total)}%</Text>
                {/*
                  On a multi-role outreach the score is against ONE role — the
                  best one open to this volunteer. Saying which turns an
                  unattributed number into an answer.
                */}
                <Text style={styles.totalLabel}>
                  {roleName ? `match as ${roleName}` : 'overall match'}
                </Text>
              </View>

              {COMPONENTS.map((row) => {
                const component = breakdown[row.key];
                const pct = percent(component);
                return (
                  <View key={row.key} style={styles.row}>
                    <View style={styles.rowHeader}>
                      <MaterialCommunityIcons name={row.icon} size={18} color={colors.primary} />
                      <Text style={styles.rowLabel}>{row.label}</Text>
                      <Text style={styles.rowPoints}>
                        {component.weighted.toFixed(1)} / {component.weight} pts
                      </Text>
                    </View>

                    <View
                      style={styles.track}
                      accessibilityRole="progressbar"
                      accessibilityLabel={`${row.label}: ${pct} percent`}
                    >
                      <View style={[styles.fill, { width: `${pct}%` }]} />
                    </View>

                    <Text style={styles.rowExplain}>{row.explain}</Text>
                  </View>
                );
              })}

              <View style={styles.note}>
                <MaterialCommunityIcons
                  name={layer2Applied ? 'creation' : 'calculator-variant-outline'}
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={styles.noteText}>
                  {layer2Applied
                    ? 'Your skills were also compared for meaning, so equivalent wording (like "blood draw" and "venipuncture") counts as a match.'
                    : 'Scored on exact skill wording this time. Meaning-based skill matching was unavailable, so a differently-worded skill may not have been credited.'}
                </Text>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.content}>
              <Text style={styles.rowExplain}>
                This outreach hasn&apos;t been scored for you yet.
              </Text>
            </View>
          )}

          <View style={styles.footer}>
            <Button title="Got it" onPress={onDismiss} accessibilityLabel="Close match breakdown" />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.base,
  },
  eventTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  totalCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    marginTop: spacing.base,
    marginBottom: spacing.lg,
  },
  totalValue: {
    fontFamily: fontFamily.bold,
    fontSize: 34,
    color: colors.textPrimary,
  },
  totalLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  row: {
    marginBottom: spacing.lg,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowPoints: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  rowExplain: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  noteText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
