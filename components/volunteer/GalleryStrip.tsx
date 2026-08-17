import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface GalleryStripItem {
  id: string;
  url: string;
  caption?: string | null;
  /** Shown under the image on the organisation profile, where the event matters. */
  subtitle?: string | null;
}

export interface GalleryStripProps {
  items: readonly GalleryStripItem[];
  /** Section heading. Omit for no heading. */
  title?: string;
}

/**
 * A horizontal run of an outreach's (or organisation's) images.
 *
 * RENDERS NOTHING WHEN THERE ARE NO IMAGES. Not a placeholder, not an empty
 * frame, not a "no photos yet" line — the section simply is not there. Most
 * outreaches will never have a gallery, and a permanent empty shell on every
 * one of them would make the app look broken rather than look empty.
 *
 * Tapping opens the image full-screen, because the point of a poster is the
 * text on it and a 200pt-wide thumbnail is not readable.
 */
export function GalleryStrip({ items, title }: GalleryStripProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  const open = openIndex === null ? null : items[openIndex];

  return (
    <View style={styles.wrap}>
      {title ? <Text style={styles.title}>{title}</Text> : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {items.map((item, index) => (
          <Pressable
            key={item.id}
            onPress={() => setOpenIndex(index)}
            accessibilityRole="imagebutton"
            accessibilityLabel={item.caption ?? item.subtitle ?? `Image ${index + 1}`}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          >
            <Image source={{ uri: item.url }} style={styles.tileImage} resizeMode="cover" />
            {item.subtitle ? (
              <Text style={styles.tileSubtitle} numberOfLines={1}>
                {item.subtitle}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>

      <Modal
        visible={open !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenIndex(null)}
      >
        <View style={styles.viewer}>
          <Pressable
            onPress={() => setOpenIndex(null)}
            accessibilityRole="button"
            accessibilityLabel="Close image"
            hitSlop={12}
            style={styles.viewerClose}
          >
            <MaterialCommunityIcons name="close" size={24} color={colors.white} />
          </Pressable>

          {open ? (
            <>
              <Image source={{ uri: open.url }} style={styles.viewerImage} resizeMode="contain" />
              {open.caption || open.subtitle ? (
                <Text style={styles.viewerCaption}>{open.caption ?? open.subtitle}</Text>
              ) : null}
            </>
          ) : null}

          {items.length > 1 && openIndex !== null ? (
            <View style={styles.viewerNav}>
              <Pressable
                onPress={() => setOpenIndex(Math.max(0, openIndex - 1))}
                disabled={openIndex === 0}
                accessibilityRole="button"
                accessibilityLabel="Previous image"
                accessibilityState={{ disabled: openIndex === 0 }}
                hitSlop={10}
                style={[styles.viewerNavButton, openIndex === 0 && styles.viewerNavDisabled]}
              >
                <MaterialCommunityIcons name="chevron-left" size={26} color={colors.white} />
              </Pressable>
              <Text style={styles.viewerCount}>
                {openIndex + 1} / {items.length}
              </Text>
              <Pressable
                onPress={() => setOpenIndex(Math.min(items.length - 1, openIndex + 1))}
                disabled={openIndex === items.length - 1}
                accessibilityRole="button"
                accessibilityLabel="Next image"
                accessibilityState={{ disabled: openIndex === items.length - 1 }}
                hitSlop={10}
                style={[
                  styles.viewerNavButton,
                  openIndex === items.length - 1 && styles.viewerNavDisabled,
                ]}
              >
                <MaterialCommunityIcons name="chevron-right" size={26} color={colors.white} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

/*
  PORTRAIT, AND BIG ENOUGH TO READ.

  These were 168pt wide and 4:3 landscape — the banner's proportions — which is
  the wrong shape for the commonest thing in an event gallery. A real flyer is a
  portrait poster whose entire purpose is the text printed on it, and a short
  landscape thumbnail crops that away and then renders what survives too small
  to read. A 3:4 tile at 220pt shows a whole A4-proportioned poster, and the
  full-screen viewer is one tap away for the detail.
*/
const TILE = 220;
const TILE_ASPECT = 4 / 3; // height / width — portrait.

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  strip: {
    gap: spacing.sm,
  },
  tile: {
    width: TILE,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSubtle,
  },
  tileImage: {
    width: '100%',
    height: TILE * TILE_ASPECT,
  },
  tileSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pressed: {
    opacity: 0.85,
  },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.base,
  },
  viewerClose: {
    position: 'absolute',
    top: spacing.xxl,
    right: spacing.xl,
    zIndex: 1,
  },
  viewerImage: {
    width: '100%',
    // Most of the screen: a poster is only useful when its text is legible,
    // and this is the surface that exists to make it so.
    height: '78%',
  },
  viewerCaption: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.white,
    textAlign: 'center',
  },
  viewerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  viewerNavButton: {
    padding: spacing.xs,
  },
  viewerNavDisabled: {
    opacity: 0.3,
  },
  viewerCount: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.white,
    minWidth: 56,
    textAlign: 'center',
  },
});
