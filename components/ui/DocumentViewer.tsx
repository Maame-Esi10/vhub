import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { Button } from './Button';

export interface DocumentViewerProps {
  visible: boolean;
  onClose: () => void;
  /** What is being looked at, e.g. "Registration certificate". */
  title: string;
  /** The signed, expiring link. Null while it is being fetched or if that failed. */
  url: string | null;
  isImage: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/** How far in each tap zooms. Three steps, because two is not enough to read a licence number. */
const ZOOM_STEPS = [1, 2, 3.5] as const;

/**
 * Full-screen viewer for one private document.
 *
 * WHY ZOOM IS A TAP AND NOT A PINCH. Real pinch-to-zoom needs
 * react-native-gesture-handler, and dependencies are a gated decision in this
 * project — so rather than add one unasked, this zooms in steps on tap and
 * pans with the scroll views it is already built from. It answers the question
 * the brief actually asks ("can an admin read a licence number off a photo?")
 * with what is already installed. On iOS the ScrollView's own pinch works too,
 * for free; Android has no equivalent, which is exactly why the tap steps
 * exist rather than being an iOS-only nicety.
 *
 * A PDF is opened in the phone's browser instead. Rendering one inline needs a
 * viewer dependency and a native rebuild, for a screen an admin uses with a
 * document that the browser already displays well.
 *
 * The link it is handed expires. Nothing here caches it, and closing the
 * viewer discards it — a signed URL kept past its own lifetime is the mistake
 * this whole design exists to avoid.
 */
export function DocumentViewer({
  visible,
  onClose,
  title,
  url,
  isImage,
  loading,
  error,
  onRetry,
}: DocumentViewerProps) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const { width, height } = Dimensions.get('window');

  // Reopening always starts fitted. Carrying the previous zoom over means the
  // next document opens mid-way into a corner of itself for no reason.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets zoom on open, so the next document does not start mid-way into a corner of itself
    if (visible) setZoomIndex(0);
  }, [visible]);

  const zoom = ZOOM_STEPS[zoomIndex] ?? 1;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close document"
            hitSlop={10}
            style={styles.closeButton}
          >
            <MaterialCommunityIcons name="close" size={22} color={colors.white} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centred}>
            <ActivityIndicator color={colors.white} />
            <Text style={styles.note}>Unlocking this document…</Text>
          </View>
        ) : error || !url ? (
          <View style={styles.centred}>
            <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.danger} />
            <Text style={styles.errorText}>{error ?? 'This document could not be opened.'}</Text>
            <Button title="Try again" variant="outline" onPress={onRetry} style={styles.retry} />
          </View>
        ) : isImage ? (
          <ScrollView
            style={styles.zoomOuter}
            contentContainerStyle={styles.zoomContent}
            maximumZoomScale={4}
            minimumZoomScale={1}
            showsVerticalScrollIndicator={false}
          >
            <ScrollView
              horizontal
              contentContainerStyle={styles.zoomContent}
              showsHorizontalScrollIndicator={false}
            >
              <Pressable
                onPress={() => setZoomIndex((index) => (index + 1) % ZOOM_STEPS.length)}
                accessibilityRole="button"
                accessibilityLabel={
                  zoomIndex === ZOOM_STEPS.length - 1 ? 'Zoom back out' : 'Zoom in'
                }
              >
                <Image
                  source={{ uri: url }}
                  style={{ width: width * zoom, height: height * 0.75 * zoom }}
                  resizeMode="contain"
                />
              </Pressable>
            </ScrollView>
          </ScrollView>
        ) : (
          <View style={styles.centred}>
            <MaterialCommunityIcons name="file-pdf-box" size={56} color={colors.white} />
            <Text style={styles.note}>
              This document is a PDF, so it opens in your browser. The link works for a few minutes
              and then stops.
            </Text>
            <Button
              title="Open document"
              onPress={() => void Linking.openURL(url)}
              style={styles.retry}
            />
          </View>
        )}

        {isImage && url && !loading && !error ? (
          <Text style={styles.hint}>Tap the image to zoom · drag to move around</Text>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Dark ground on purpose: a scanned certificate is nearly always white, and
  // a white surround makes its edges impossible to find.
  container: { flex: 1, backgroundColor: colors.heroBackground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
  },
  title: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.white },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.base,
    paddingHorizontal: spacing.xl,
  },
  note: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.white,
    textAlign: 'center',
  },
  retry: { marginTop: spacing.sm },
  zoomOuter: { flex: 1 },
  zoomContent: { alignItems: 'center', justifyContent: 'center' },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    paddingVertical: spacing.base,
  },
});
