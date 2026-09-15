import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useFontScale } from '@/constants/typography';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface Column {
  icon: IconName;
  title: string;
  what: string;
  examples: string[];
  tint: string;
  accent: string;
}

/**
 * The two kinds of work, side by side.
 *
 * WHY IT IS A DIAGRAM AND NOT A PARAGRAPH (owner, 2026-09-15). Both terms had
 * only ever appeared next to verification, which taught everybody that
 * "clinical" means verified and "support" means unverified. It does not:
 * clinical is hands-on care, support is what makes the event run, and
 * verification is a CONSEQUENCE of the first, not its definition.
 *
 * Two real costs came out of the confusion. A verified nurse reads "support"
 * as beneath her and never applies, when support roles are exactly where an
 * extra pair of trained hands is most useful. And an organisation ticks
 * "support" to stop the verification gate blocking applicants, which takes the
 * credential check off work that needed it.
 *
 * A comparison is the thing a paragraph is worst at. Two columns, read at a
 * glance, put the distinction where the eye already is -- and the words are
 * kept short deliberately, because the failure mode here is somebody skipping
 * the text entirely.
 *
 * The verification line sits UNDERNEATH both columns rather than inside
 * either, because attaching it to the clinical column is how the original
 * misreading was taught in the first place.
 */
const COLUMNS: readonly Column[] = [
  {
    icon: 'stethoscope',
    title: 'Clinical',
    what: 'Hands-on care',
    examples: ['Blood pressure', 'Screening', 'Examination', 'Medicine advice'],
    tint: 'rgba(255, 107, 107, 0.10)',
    accent: colors.primary,
  },
  {
    icon: 'account-group-outline',
    title: 'Support',
    what: 'Makes the event run',
    examples: ['Registration', 'Crowd flow', 'Health talks', 'Data entry'],
    tint: 'rgba(18, 23, 43, 0.06)',
    accent: colors.navy,
  },
];

export interface RoleTypeExplainerProps {
  /** Adds the line telling a qualified volunteer that support roles are open to them. */
  audience?: 'volunteer' | 'organisation';
}

export function RoleTypeExplainer({ audience }: RoleTypeExplainerProps) {
  // A wrapping row would put one column above the other at a large system
  // font, which is correct: two 45%-wide columns of text become unreadable
  // before they become short.
  const { stacked } = useFontScale();

  return (
    <View style={styles.wrap}>
      <View style={[styles.columns, stacked && styles.columnsStacked]}>
        {COLUMNS.map((column) => (
          <View
            key={column.title}
            style={[styles.column, { backgroundColor: column.tint }, stacked && styles.columnFull]}
          >
            <View style={styles.columnHeader}>
              <MaterialCommunityIcons name={column.icon} size={20} color={column.accent} />
              <Text style={[styles.columnTitle, { color: column.accent }]}>{column.title}</Text>
            </View>
            <Text style={styles.columnWhat}>{column.what}</Text>
            {column.examples.map((example) => (
              <View key={example} style={styles.exampleRow}>
                <View style={[styles.bullet, { backgroundColor: column.accent }]} />
                <Text style={styles.exampleText}>{example}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.note}>
        <MaterialCommunityIcons name="information-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.noteText}>
          Verification follows the work, not the other way round. Clinical roles need it; support
          roles do not.
        </Text>
      </View>

      {audience === 'volunteer' ? (
        <Text style={styles.audienceNote}>
          Verified? Support roles are still open to you, and often short of hands.
        </Text>
      ) : null}

      {audience === 'organisation' ? (
        <Text style={styles.audienceNote}>
          Choose by what the work is. Marking clinical work as support removes a check it needs.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.base,
  },
  columns: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  columnsStacked: {
    flexDirection: 'column',
  },
  column: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.base,
    gap: spacing.xs,
  },
  columnFull: {
    flex: 0,
    width: '100%',
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    alignContent: 'center',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
    gap: spacing.xs,
  },
  columnTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
  },
  columnWhat: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignContent: 'center',
    flexWrap: 'wrap',
    rowGap: 2,
    gap: spacing.sm,
  },
  bullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  exampleText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  noteText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  audienceNote: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary,
  },
});
