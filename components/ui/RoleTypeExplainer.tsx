import { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface RoleCard {
  icon: IconName;
  title: string;
  /** Three or four words, directly under the heading. */
  what: string;
  /** The rule, in a sentence or two. This is what the examples cannot say. */
  blurb: string;
  examples: string[];
  accent: string;
  tint: string;
}

/**
 * The two kinds of work, as cards you swipe between.
 *
 * WHY IT IS A DIAGRAM AND NOT A PARAGRAPH (owner, 2026-09-15). Both terms had
 * only ever appeared next to verification, which taught everybody that
 * "clinical" means verified and "support" means unverified. It does not:
 * clinical is hands-on care, support is what makes the event run, and
 * verification is a CONSEQUENCE of the first, not its definition. A verified
 * nurse who reads "support" as beneath her never applies; an organisation that
 * ticks "support" to stop the gate blocking applicants takes the credential
 * check off work that needed it.
 *
 * WHY IT IS NOW HORIZONTAL CARDS (owner, 2026-09-21: the columns "are dull.
 * Make them a proper card design, ideally a horizontal scrollable card with
 * the information in bits, which retains better than a flat vertical list").
 *
 * The two tinted columns had three faults beyond being plain. Side by side on
 * a phone each column is barely 150dp wide, so a two-line rule broke into five
 * short lines and read as a poem. The examples were a bulleted list, which is
 * the flattest possible presentation of four scannable words. And the whole
 * thing collapsed into a vertical stack at a large font size, which destroys
 * the one property a comparison needs.
 *
 * A card that takes most of the width can hold its sentence on two or three
 * lines, the examples become chips, and swiping to the second card is itself
 * the act of comparing. The next card deliberately peeks past the right edge,
 * because that is the only reliable signal that a horizontal scroller
 * scrolls. It works identically at every font size, so the stacking rule that
 * used to break the comparison is gone.
 *
 * The verification note sits UNDERNEATH both cards rather than inside either,
 * because attaching it to the clinical one is how the original misreading was
 * taught in the first place.
 */
const CARDS: readonly RoleCard[] = [
  {
    icon: 'stethoscope',
    title: 'Clinical',
    what: 'Work on a person',
    // PROSE FIRST, EXAMPLES UNDERNEATH (owner, 2026-09-16). A list of four
    // tasks answers "like what?" and never answers "what is this?" -- so
    // somebody who did not already know the difference read four examples and
    // still had to guess the rule. The sentence is the rule; the examples only
    // confirm it.
    blurb:
      'Anything done to or for a patient directly. If it affects their care, or it needs training to do safely, it is clinical.',
    examples: ['Blood pressure', 'Screening', 'Examination', 'Medicine advice'],
    accent: colors.primary,
    tint: 'rgba(255, 107, 107, 0.10)',
  },
  {
    icon: 'account-group-outline',
    title: 'Support',
    what: 'Work around the event',
    blurb:
      'Everything that makes the day run. Nobody is examined or treated, but without it the clinical work cannot happen at all.',
    examples: ['Registration', 'Crowd flow', 'Health talks', 'Data entry'],
    accent: colors.navy,
    tint: 'rgba(18, 23, 43, 0.06)',
  },
];

/**
 * The verification note, written for whoever is reading it.
 *
 * THE ORGANISATION'S VERSION USED TO BE NONSENSE (owner, 2026-09-21: "the
 * clinical text is wrong. It says the role is decided by the job and not by
 * you. The organisation is the one creating the event").
 *
 * Exactly right, and the cause is that one sentence was written for two
 * readers with opposite relationships to the choice. "It is decided by the
 * job, not by you" is true and useful for a VOLUNTEER, who cannot change what
 * a role is and only needs to know why one asks for proof. Said to the
 * ORGANISATION filling in the role type, it denies the thing they are at that
 * moment doing, which reads as the app not knowing what screen it is on.
 *
 * So there are two sentences. The organisation's names the consequence of
 * their choice, which is the part that actually matters to them: the choice
 * decides who gets asked for proof.
 */
const VERIFICATION_NOTE: Record<'volunteer' | 'organisation' | 'default', string> = {
  volunteer:
    'A clinical role asks you to verify who you are before you can apply, because the work is hands-on. A support role never does. Which one a role is comes from the work itself, so it is nothing you have to decide.',
  organisation:
    'Whichever you pick decides who is asked for proof. A clinical role requires the volunteer to have verified their identity before they can apply to it; a support role lets anybody apply. Pick the one that describes the work, and the check follows.',
  default:
    'A clinical role asks the volunteer to verify their identity before applying, because the work is hands-on. A support role does not.',
};

export interface RoleTypeExplainerProps {
  /** Changes the verification note and adds a closing line. */
  audience?: 'volunteer' | 'organisation';
}

export function RoleTypeExplainer({ audience }: RoleTypeExplainerProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const lastIndex = useRef(0);

  /*
    Measured rather than taken from the window: this component is dropped
    inside screens with their own horizontal padding, and a card sized to the
    SCREEN would overflow every one of them.
  */
  function handleLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  // The next card peeks. Without that there is nothing on screen saying a
  // horizontal scroller is a horizontal scroller.
  const cardWidth = trackWidth > 0 ? Math.round(trackWidth * 0.86) : 0;
  const step = cardWidth + spacing.md;

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (step <= 0) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / step);
    if (next !== lastIndex.current) {
      lastIndex.current = next;
      setIndex(next);
    }
  }

  return (
    <View style={styles.wrap} onLayout={handleLayout}>
      {cardWidth > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // Snapping makes the swipe land on a card rather than halfway
          // between two, which is what stops it feeling like a loose strip.
          snapToInterval={step}
          decelerationRate="fast"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.track}
        >
          {CARDS.map((card) => (
            <View key={card.title} style={[styles.card, { width: cardWidth }]}>
              <View style={[styles.cardBand, { backgroundColor: card.tint }]}>
                <View style={[styles.iconTile, { backgroundColor: card.accent }]}>
                  <MaterialCommunityIcons name={card.icon} size={20} color={colors.white} />
                </View>
                <View style={styles.headings}>
                  <Text style={[styles.cardTitle, { color: card.accent }]}>{card.title}</Text>
                  <Text style={styles.cardWhat}>{card.what}</Text>
                </View>
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.cardBlurb}>{card.blurb}</Text>

                <Text style={styles.examplesLabel}>For example</Text>
                {/*
                  CHIPS, NOT BULLETS. Four scannable words in a bulleted column
                  is the flattest way to show them; as chips they read as a set
                  at a glance, which is the whole job of an example list.
                */}
                <View style={styles.chips}>
                  {card.examples.map((example) => (
                    <View key={example} style={[styles.chip, { borderColor: card.accent }]}>
                      <Text style={[styles.chipText, { color: card.accent }]}>{example}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.dots}>
        {CARDS.map((card, dotIndex) => (
          <View
            key={card.title}
            style={[styles.dot, dotIndex === index && styles.dotActive]}
          />
        ))}
      </View>

      <View style={styles.note}>
        <MaterialCommunityIcons name="shield-check-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.noteText}>{VERIFICATION_NOTE[audience ?? 'default']}</Text>
      </View>

      {audience === 'volunteer' ? (
        <Text style={styles.audienceNote}>
          Already verified? Support roles are still yours to take, and they are the ones most
          often short of hands.
        </Text>
      ) : null}

      {audience === 'organisation' ? (
        <Text style={styles.audienceNote}>
          Calling clinical work &quot;support&quot; lets people through without the check that work
          needs.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  track: {
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    // Clipped so the tinted band reaches the rounded corners, the same
    // treatment the feed and application cards use.
    overflow: 'hidden',
  },
  cardBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headings: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
  },
  cardWhat: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 1,
  },
  cardBody: {
    padding: spacing.base,
  },
  cardBlurb: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  examplesLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'center',
    gap: spacing.sm,
    rowGap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 18,
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
