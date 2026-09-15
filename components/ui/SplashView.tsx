import { ActivityIndicator, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/Text';
import { SplashBackdrop } from '@/components/ui/SplashBackdrop';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { getLogoSize, getSplashWordmarkFontSize } from '@/constants/logoSizes';
import { APP_TAGLINE, APP_INTRO } from '@/constants/brand';

const LOGO = require('../../assets/logo.png');

export type SplashVariant = 'full' | 'mark';

/**
 * Where the mark's CENTRE sits, as a fraction of screen height.
 *
 * SLIGHTLY ABOVE CENTRE, and the same number in both variants (owner,
 * 2026-09-15). Two separate points:
 *
 * A composition centred on the exact middle of a tall screen reads as adrift,
 * because the eye takes the optical centre to be a little above the
 * mathematical one. 0.42 is that lift; it is small enough that nobody notices
 * it deliberately and large enough that the screen stops feeling like it slid
 * down.
 *
 * And it is ONE constant because the two variants have to agree. Before this
 * the mark was dead-centre at `hero` size on the mark-only screen and above a
 * text block at `heroCompact` on the full one -- a different size in a
 * different place, so the two splashes read as two screens from two apps. The
 * text now hangs BELOW a mark that does not move.
 *
 * Accepted consequence: the native splash (app.json) can only centre its image
 * exactly, so the mark shifts up by ~3% of the screen height at the handover
 * from native to JS. That is a fraction of the jump it replaces, and expo's
 * splash config has no vertical offset to match it with.
 */
const MARK_CENTER_RATIO = 0.42;

/** Gap between the mark and the wordmark. Deliberately tiny: see below. */
const LOCKUP_GAP = spacing.xs;

/** How much wider than the mark the glow spreads. */
const GLOW_SPREAD = 2.6;

export interface SplashViewProps {
  /** Hide the spinner row when the screen is not actually waiting on anything. */
  showLoading?: boolean;
  /**
   * `full` introduces the app; `mark` is the logo alone on the dark ground.
   *
   * WHICH ONE, AND WHY IT DEPENDS ON WHO IS OPENING THE APP (owner, 2026-09-11).
   * The fuller screen is an introduction - it names the product and says what
   * it is for. That is worth a returning volunteer's time exactly once. Every
   * launch after that it is a wall of text between them and the app they
   * already know, so a signed-in user gets the mark alone: no wordmark, no
   * tagline, no spinner.
   *
   * The two are now the SAME COMPOSITION with the text removed, rather than
   * two different screens - same mark, same size, same position, same backdrop.
   */
  variant?: SplashVariant;
}

/**
 * THE splash screen. One component, one design, every place the app is still
 * getting ready.
 *
 * There used to be two in a row: this one (wordmark only) while fonts and the
 * session resolved, and then a second, differently composed one on the welcome
 * screen (logo + wordmark, no tagline) while the carousel images prefetched.
 * Two branded loading screens back to back read as a stutter, not as a brand.
 * The logo now lives here - where the owner wanted it - and welcome renders
 * this same component, so the app shows one continuous splash that simply ends
 * when the carousel is ready.
 *
 * THE COMPOSITION, rebuilt 2026-09-15 (owner: "it looks detached... treat it as
 * one composition rather than a stack").
 *
 * It was a flex column: mark, wordmark, title, subtext, each separated by a
 * similar gap, with the spinner floating below. Four things evenly spaced are
 * four things, not a design - the same fault the Profile screen had, where the
 * space BETWEEN groups equalled the space INSIDE them so nothing read as
 * grouped. The fix here is the same one:
 *
 *   mark + wordmark    -- 4px apart. ONE lockup, read as a single object.
 *   (36px of air)      -- the group boundary, and it has to be much larger
 *                         than the gap above or the lockup dissolves.
 *   tagline            -- what the app is.
 *   (8px)              -- within the text group.
 *   intro sentence     -- what it does.
 *   ...
 *   spinner            -- pinned near the bottom, far from everything, so it
 *                         reads as machinery rather than as a fifth line of
 *                         the composition.
 *
 * Everything except the mark is coded UI, so it stays crisp at any resolution.
 */
export function SplashView({ showLoading = true, variant = 'full' }: SplashViewProps) {
  const { width, height } = useWindowDimensions();

  // ONE size, both variants. The mark-only screen keeps the `hero` size the
  // owner approved; the full screen is raised to match it rather than the
  // mark-only one being shrunk, which also gives the lockup the presence it
  // was missing.
  const logoSize = getLogoSize('hero', width);
  const wordmarkFontSize = getSplashWordmarkFontSize(width);

  const markCenterY = height * MARK_CENTER_RATIO;
  const markTop = markCenterY - logoSize / 2;
  const textTop = markCenterY + logoSize / 2 + LOCKUP_GAP;

  return (
    <View style={styles.splash}>
      <SplashBackdrop glowSize={logoSize * GLOW_SPREAD} glowCenterRatio={MARK_CENTER_RATIO} />

      <View style={[styles.row, { top: markTop }]}>
        <Image
          source={LOGO}
          style={{ width: logoSize, height: logoSize }}
          resizeMode="contain"
          accessible={false}
        />
      </View>

      {variant === 'full' ? (
        <View style={[styles.row, styles.textBlock, { top: textTop }]}>
          {/*
            THE WORDMARK IS A LOGOTYPE, NOT TEXT TO BE READ, so it is the one
            string in the app that does not scale with the system font: it sits
            directly under the mark and has to stay in proportion to it. Every
            other line on this screen scales normally.
          */}
          <Text
            style={[styles.wordmark, { fontSize: wordmarkFontSize }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            allowFontScaling={false}
          >
            VHub
          </Text>
          <Text style={styles.tagline}>{APP_TAGLINE}</Text>
          <Text style={styles.intro}>{APP_INTRO}</Text>
        </View>
      ) : null}

      {showLoading && variant === 'full' ? (
        <View style={styles.footer}>
          <ActivityIndicator size="small" color={colors.white} />
          <Text style={styles.loadingText}>Loading your mission...</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.heroBackground,
  },
  /** Full-width absolute band, so a child centres without the parent laying out. */
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  textBlock: {
    paddingHorizontal: spacing.xl,
  },
  wordmark: {
    fontFamily: fontFamily.bold,
    // The mark's own red, not the coral accent. These sit two millimetres
    // apart on the splash and were two different reds - near enough to read as
    // a printing error rather than as a palette. `colors.primary` stays the
    // interface accent everywhere else; this one colour answers to the artwork.
    color: colors.brandMark,
    // NEGATIVE, because this is now mixed case at display size (2026-09-15).
    // The old "V-HUB" carried positive tracking, which is what an all-caps
    // logotype wants: capitals are drawn to sit apart. "VHub" has two
    // lowercase letters, and lowercase is drawn to sit close -- open it up and
    // the word visibly comes apart into "V H u b". A touch of negative
    // tracking binds the four glyphs into one mark.
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  tagline: {
    fontFamily: fontFamily.semiBold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.white,
    textAlign: 'center',
    // THE GROUP BOUNDARY. Much larger than the 4px holding the lockup
    // together, because that difference is the only thing telling the eye
    // where one object ends and the next begins.
    marginTop: spacing.xl + spacing.md,
  },
  intro: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.white,
    opacity: 0.72,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Near the bottom of the screen, well clear of the text block above, so it
    // reads as a loading indicator and not as part of the composition. The
    // value clears the gesture bar on every handset without needing the
    // safe-area provider, which is not guaranteed to be mounted above this
    // component during the earliest frames of launch.
    bottom: spacing.xxl + spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.white,
    opacity: 0.8,
  },
});
