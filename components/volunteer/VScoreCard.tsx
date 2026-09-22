import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { getVScoreBand } from '@/lib/vscore';

export interface VScoreCardProps {
  /** 0-100. The caller does not render this card at all when there is no score. */
  score: number;
  eventsAttended: number;
  /** Opens the explanation. The card is one big button for this. */
  onPress: () => void;
}

/** Where the knob sits, kept off both ends so it is never half outside the track. */
const KNOB = 22;

/**
 * The volunteer's V-Score, as the Profile screen's one piece of data.
 *
 * BUILT FROM THE OWNER'S REFERENCE CARDS (2026-09-22): `design-refs/Reference -
 * metric card with progress.png` for the anatomy, and `Reference - hero promo
 * card.png` for the gradient. The structure comes almost unchanged from the
 * first: a titled header with a circular arrow button at the trailing edge, the
 * figure large and right-aligned under it, and a gradient track with a round
 * knob marking the current position.
 *
 * WHY THAT SHAPE FITS THIS NUMBER, rather than being borrowed decoration. A
 * V-Score is a position on a fixed 0-100 scale cut into five named bands, and
 * it is DERIVED from a whole history rather than set directly. "78" on its own
 * says very little; "78, and here is how far along 0 to 100 that is, and the
 * band it falls in" is the entire meaning. A knob on a track is the one figure
 * that shows a position rather than just a quantity, which is why it beats the
 * plain filled bar this replaces.
 *
 * THE GRADIENT IS NOT A HEAT SCALE, and the distinction matters. It runs coral
 * to navy across the whole track regardless of the score: it is the track's own
 * decoration, not a statement that low is bad and high is good. Colouring the
 * track by value would contradict the band label, which is where the judgement
 * actually lives, and would say "at risk" in red under somebody's number
 * without the word.
 *
 * `react-native-svg` is already a dependency (the check-in QR pulls it in), so
 * the gradient costs nothing new. Stacked translucent Views were tried for
 * gradients elsewhere in this app and band visibly at this size.
 */
export function VScoreCard({ score, eventsAttended, onPress }: VScoreCardProps) {
  const band = getVScoreBand(score);
  const bounded = Math.max(0, Math.min(100, score));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Your V-Score is ${Math.round(score)}, ${band}. Based on ${eventsAttended} ${eventsAttended === 1 ? 'event' : 'events'}. See how it is worked out.`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <View style={styles.iconTile}>
          <MaterialCommunityIcons name="shield-star-outline" size={18} color={colors.primary} />
        </View>
        <Text style={styles.title}>Your V-Score</Text>
        {/*
          The circular arrow from the reference. It is not separately tappable:
          the whole card opens the explanation, and a button inside a button is
          two targets doing one thing and a place for them to disagree.
        */}
        <View style={styles.openDisc}>
          <MaterialCommunityIcons name="arrow-top-right" size={16} color={colors.white} />
        </View>
      </View>

      <View style={styles.figureRow}>
        <View style={styles.figureText}>
          <Text style={styles.band}>{band}</Text>
          <Text style={styles.basis}>
            {eventsAttended === 1 ? 'From 1 event so far' : `From ${eventsAttended} events so far`}
          </Text>
        </View>
        <Text style={styles.score}>{Math.round(score)}</Text>
      </View>

      <View style={styles.track}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <LinearGradient id="vscoreTrack" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.primary} stopOpacity="0.85" />
              <Stop offset="1" stopColor={colors.navy} stopOpacity="0.85" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" rx={6} fill="url(#vscoreTrack)" />
        </Svg>
        {/*
          The knob is positioned by PERCENTAGE with its own width taken off, so
          it stays inside the track at both ends. A plain `left: ${score}%`
          hangs half the knob past the right edge at 100, which reads as a
          rendering fault rather than as a full score.
        */}
        <View
          style={[styles.knob, { left: `${bounded}%`, marginLeft: -(KNOB / 2) }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>

      <View style={styles.scale}>
        <Text style={styles.scaleEnd}>0</Text>
        <Text style={styles.scaleHint}>See how this is worked out</Text>
        <Text style={styles.scaleEnd}>100</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    // The section gap. While the space BETWEEN sections equalled the space
    // INSIDE them, nothing on the Profile screen read as grouped.
    marginTop: spacing.xl,
  },
  pressed: {
    opacity: 0.85,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    // alignItems centres children within their line; alignContent places the
    // line itself and defaults to flex-start, so a wrapping row pins to the top.
    alignContent: 'center',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    gap: spacing.md,
  },
  iconTile: {
    width: 32,
    height: 32,
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  openDisc: {
    width: 32,
    height: 32,
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  figureRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  figureText: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 120,
    gap: 2,
  },
  band: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  basis: {
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  score: {
    fontFamily: fontFamily.bold,
    // The one genuinely large number on the screen, as the reference has it.
    fontSize: 34,
    lineHeight: 38,
    color: colors.textPrimary,
  },
  track: {
    height: 12,
    borderRadius: 6,
    overflow: 'visible',
    marginTop: spacing.base,
    justifyContent: 'center',
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: colors.background,
    borderWidth: 3,
    borderColor: colors.navy,
    // Lifts it off the track on Android, where a plain white disc on a
    // coloured bar otherwise reads as a gap in the bar.
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  scale: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  scaleEnd: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  scaleHint: {
    flexShrink: 1,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.primary,
  },
});
