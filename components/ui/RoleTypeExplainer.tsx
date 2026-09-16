import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { MAX_FONT_SCALE, useFontScale } from '@/constants/typography';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface Column {
  icon: IconName;
  title: string;
  /** Three or four words, directly under the heading. */
  what: string;
  /** The rule, in a sentence or two. This is what the examples cannot say. */
  blurb: string;
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
    what: 'Work on a person',
    // PROSE FIRST, LIST UNDERNEATH (owner, 2026-09-16: "listed bullet points
    // do not tell a volunteer what these actually mean or why they exist").
    // A list of four tasks answers "like what?" and never answers "what is
    // this?" -- so somebody who did not already know the difference read four
    // examples and still had to guess the rule. The sentence is the rule; the
    // examples are only there to confirm it.
    blurb:
      'Anything done to or for a patient directly. If it affects their care, or it needs training to do safely, it is clinical.',
    examples: ['Blood pressure', 'Screening', 'Examination', 'Medicine advice'],
    tint: 'rgba(255, 107, 107, 0.10)',
    accent: colors.primary,
  },
  {
    icon: 'account-group-outline',
    title: 'Support',
    what: 'Work around the event',
    blurb:
      'Everything that makes the day run. Nobody is examined or treated, but without it the clinical work cannot happen at all.',
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
  /*
    SIDE BY SIDE UNLESS THE FONT IS AT ITS ABSOLUTE CEILING (owner, 2026-09-16:
    "the clinical and support boxes should be side by side, not stacked").

    They already were -- at the default font. The shared `stacked` flag trips at
    1.2x, and the owner tests at a large system size, so in practice the
    comparison she was looking at had been turned into a list. A comparison
    stacked vertically is not a comparison any more: the whole point is that
    the eye can cross between the two columns.

    So the threshold here is MAX_FONT_SCALE rather than the app-wide 1.2. Text
    never scales past that ceiling anyway, so stacking now only happens at the
    very top of the range, where two columns genuinely cannot hold a sentence.
  */
  const { scale } = useFontScale();
  const stacked = scale >= MAX_FONT_SCALE;

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
            <Text style={styles.columnBlurb}>{column.blurb}</Text>
            <Text style={styles.examplesLabel}>For example</Text>
            {column.examples.map((example) => (
              <View key={example} style={styles.exampleRow}>
                <View style={[styles.bullet, { backgroundColor: column.accent }]} />
                <Text style={styles.exampleText}>{example}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/*
        REWRITTEN (owner, 2026-09-16: "verification follows the work, not the
        other way round" is unclear).

        It was. It was a sentence about the RELATIONSHIP between two ideas,
        aimed at a reader who was still working out what the ideas were -- and
        it only made sense if you already knew the mistake it was correcting.
        Nobody reads a note to learn which of two things they had backwards.

        What a volunteer actually needs to know is the practical consequence:
        which of these needs proof, and when they will be asked for it. So it
        now says that, in the order they will meet it.
      */}
      <View style={styles.note}>
        <MaterialCommunityIcons name="shield-check-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.noteText}>
          Clinical roles ask you to verify who you are first, because the work is hands-on. Support
          roles never do. It is decided by the job, not by you.
        </Text>
      </View>

      {audience === 'volunteer' ? (
        <Text style={styles.audienceNote}>
          Already verified? Support roles are still yours to take, and they are the ones most
          often short of hands.
        </Text>
      ) : null}

      {audience === 'organisation' ? (
        <Text style={styles.audienceNote}>
          Pick whichever describes the work. Calling clinical work &quot;support&quot; lets people through
          without the check that work needs.
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
    // REAL BREATHING SPACE (owner, 2026-09-16: "stacked directly against the
    // Clinical box with no breathing space"). sm put two tinted panels close
    // enough to read as one striped block; base is the gap at which they read
    // as two things being compared.
    gap: spacing.base,
  },
  columnsStacked: {
    flexDirection: 'column',
    gap: spacing.base,
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
  },
  columnBlurb: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  examplesLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
