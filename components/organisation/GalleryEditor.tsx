import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface GalleryEditorProps {
  /** Image URLs in display order. */
  urls: readonly string[];
  /** Add one. Called after the picker and upload have finished. */
  onAdd: () => void;
  onRemove: (index: number) => void;
  /** Swap with the neighbour. Absent means reordering is unavailable. */
  onMove?: (index: number, direction: -1 | 1) => void;
  uploading?: boolean;
  max: number;
  /** Shown under the strip — an upload failure, or the cap being reached. */
  error?: string | null;
  /**
   * True in the outreach editor, where a change is written the moment it is
   * made rather than on Save. Says so, because a control that saves itself
   * inside a form that has a Save button is otherwise a guess.
   */
  savesImmediately?: boolean;
}

/**
 * The organisation's gallery control — several images per outreach.
 *
 * SEPARATE FROM THE FLYER, WHICH IS UNTOUCHED. The flyer is one banner image
 * that heads the card and the detail hero; this is the event's poster and its
 * photographs. They sit next to each other in the form and neither falls back
 * to the other.
 *
 * Reordering is two arrows rather than drag-and-drop. Dragging inside a
 * vertically scrolling form fights the scroll on a phone, and the only ordering
 * decision that actually matters here is which image comes first — that is the
 * one the volunteer sees before scrolling.
 */
export function GalleryEditor({
  urls,
  onAdd,
  onRemove,
  onMove,
  uploading = false,
  max,
  error,
  savesImmediately = false,
}: GalleryEditorProps) {
  const full = urls.length >= max;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Gallery (optional)</Text>
        <Text style={styles.count}>
          {urls.length} of {max}
        </Text>
      </View>

      <Text style={styles.hint}>
        The event&rsquo;s poster and any other images you want volunteers to see, uploaded whole and
        not cropped, so a portrait flyer stays readable. The first one leads.
        {savesImmediately ? ' Changes here save straight away.' : ''}
      </Text>

      {urls.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {urls.map((url, index) => (
            <View key={`${url}-${index}`} style={styles.tile}>
              <Image source={{ uri: url }} style={styles.tileImage} resizeMode="cover" />

              <Pressable
                onPress={() => onRemove(index)}
                accessibilityRole="button"
                accessibilityLabel={`Remove image ${index + 1}`}
                hitSlop={8}
                style={styles.removeButton}
              >
                <MaterialCommunityIcons name="close" size={14} color={colors.white} />
              </Pressable>

              {onMove && urls.length > 1 ? (
                <View style={styles.moveRow}>
                  <Pressable
                    onPress={() => onMove(index, -1)}
                    disabled={index === 0}
                    accessibilityRole="button"
                    accessibilityLabel={`Move image ${index + 1} earlier`}
                    accessibilityState={{ disabled: index === 0 }}
                    hitSlop={6}
                    style={[styles.moveButton, index === 0 && styles.moveDisabled]}
                  >
                    <MaterialCommunityIcons name="chevron-left" size={16} color={colors.white} />
                  </Pressable>
                  {index === 0 ? <Text style={styles.leadPill}>COVER</Text> : null}
                  <Pressable
                    onPress={() => onMove(index, 1)}
                    disabled={index === urls.length - 1}
                    accessibilityRole="button"
                    accessibilityLabel={`Move image ${index + 1} later`}
                    accessibilityState={{ disabled: index === urls.length - 1 }}
                    hitSlop={6}
                    style={[styles.moveButton, index === urls.length - 1 && styles.moveDisabled]}
                  >
                    <MaterialCommunityIcons name="chevron-right" size={16} color={colors.white} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}

      {/*
        The add control stays visible with an empty gallery and disappears at
        the cap, replaced by the reason. A disabled button with no explanation
        is the thing that makes an organisation press it repeatedly.
      */}
      {full ? (
        <Text style={styles.capNote}>
          That is the maximum of {max}. Remove one to add another.
        </Text>
      ) : (
        <Pressable
          onPress={onAdd}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Add a gallery image"
          accessibilityState={{ disabled: uploading }}
          style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons
            name={uploading ? 'progress-upload' : 'image-multiple-outline'}
            size={18}
            color={colors.primary}
          />
          <Text style={styles.addText}>
            {uploading ? 'Uploading...' : urls.length === 0 ? 'Add images' : 'Add another image'}
          </Text>
        </Pressable>
      )}

      {/* A failed image upload is a popup, never a line under the grid. */}
      <ErrorAlert error={error} fallback="That image could not be added." />
    </View>
  );
}

// Portrait, matching how these actually render to a volunteer. A landscape
// thumbnail in the form and a portrait one on the detail screen would show the
// organisation something different from what they are publishing.
const TILE = 132;
const TILE_ASPECT = 4 / 3; // height / width

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  count: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  strip: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tile: {
    width: TILE,
    height: TILE * TILE_ASPECT,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  moveRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  moveButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveDisabled: {
    opacity: 0.3,
  },
  leadPill: {
    fontFamily: fontFamily.bold,
    fontSize: 8,
    letterSpacing: 0.8,
    color: colors.white,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  addText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  capNote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
  },
  pressed: {
    opacity: 0.85,
  },
});
