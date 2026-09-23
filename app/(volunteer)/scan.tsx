import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
// Direct import, never the components/ui barrel — expo-camera is a NATIVE
// module and the barrel is imported by nearly every screen. See the note in
// components/ui/index.ts.
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, ScreenHeader, formatEventDate } from '@/components/ui';
import { tabBarClearance } from '@/components/ui/tabBarOptions';
import { useCheckIn } from '@/hooks/useCheckInScan';
import { useOutreach } from '@/hooks/useOutreaches';
import { decodeCheckinQr } from '@/lib/checkin-qr';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { humanError } from '@/lib/errorMessage';

/**
 * The volunteer's check-in scanner.
 *
 * No Figma design exists for this screen, so it reuses the app's language: the
 * standard header, the neutral card treatment, one primary action at a time.
 *
 * WHAT THE VOLUNTEER IS NEVER TOLD, and this is deliberate: whether their
 * location agreed with the venue. A successful scan says "checked in", full
 * stop. A mismatch is a signal for the ORGANISER's exception list, not an
 * accusation to put in front of someone whose GPS may simply be confused — and
 * showing it would teach anyone gaming it exactly where the boundary sits.
 */

/**
 * How long a "that isn't a VHub code" hint stays up before the scanner will
 * complain again. A camera sees every code in view, so without this a poster's
 * URL sitting next to the QR would flash the same warning many times a second.
 */
const REJECT_HINT_MS = 2_500;

export default function VolunteerScanCheckin() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const checkIn = useCheckIn();

  const [scannedOutreachId, setScannedOutreachId] = useState<string | null>(null);
  const [rejectHint, setRejectHint] = useState(false);

  /**
   * Locks the camera the instant a usable code is read. `onBarcodeScanned`
   * fires on every frame the QR is visible — many times a second — and React
   * state does not update fast enough to gate that, so the guard has to be a
   * ref. Without it one QR held in front of the lens fires a burst of
   * identical check-in requests.
   */
  const handledRef = useRef(false);
  const rejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Named only once the scan has succeeded, so the confirmation can say which
  // event they just checked into rather than a bare "done".
  const outreachQuery = useOutreach(checkIn.isSuccess ? (scannedOutreachId ?? undefined) : undefined);

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (handledRef.current) return;

      const payload = decodeCheckinQr(data);
      if (!payload) {
        // Not ours, or malformed — the response to both is the same: keep
        // scanning, and say so quietly rather than firing a request at
        // whatever the camera happened to read.
        if (!rejectTimerRef.current) {
          setRejectHint(true);
          rejectTimerRef.current = setTimeout(() => {
            setRejectHint(false);
            rejectTimerRef.current = null;
          }, REJECT_HINT_MS);
        }
        return;
      }

      handledRef.current = true;
      setRejectHint(false);
      setScannedOutreachId(payload.outreachId);
      checkIn.mutate({ outreachId: payload.outreachId, checkinCode: payload.code });
    },
    [checkIn]
  );

  function scanAgain() {
    handledRef.current = false;
    setScannedOutreachId(null);
    checkIn.reset();
  }

  // ---------------------------------------------------------------- states

  if (!permission) {
    return (
      <Shell>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Shell>
    );
  }

  if (!permission.granted) {
    return (
      <Shell>
        <View style={styles.messageBlock}>
          <MaterialCommunityIcons name="camera-off-outline" size={40} color={colors.textSecondary} />
          <Text style={styles.messageTitle}>Camera access needed</Text>
          <Text style={styles.messageBody}>
            VHub uses the camera only to read the check-in code your organiser is showing at the
            venue.
          </Text>
          <Button
            title={permission.canAskAgain ? 'Allow camera' : 'Open settings to allow camera'}
            variant="solid"
            onPress={() => void requestPermission()}
            disabled={!permission.canAskAgain}
            style={styles.actionButton}
          />
          {!permission.canAskAgain ? (
            <Text style={styles.footnote}>
              Camera access was turned off for VHub. Enable it in your phone&apos;s Settings, then
              come back.
            </Text>
          ) : null}
        </View>
      </Shell>
    );
  }

  if (checkIn.isSuccess) {
    return (
      <Shell>
        <View style={styles.messageBlock}>
          <MaterialCommunityIcons name="check-circle" size={48} color={colors.success} />
          <Text style={styles.messageTitle}>You&apos;re checked in</Text>
          {outreachQuery.data ? (
            <Text style={styles.messageBody}>
              {outreachQuery.data.title} · {formatEventDate(outreachQuery.data.date)}
            </Text>
          ) : (
            <Text style={styles.messageBody}>Your attendance has been recorded.</Text>
          )}
          <Button
            title="Done"
            variant="solid"
            onPress={() => router.replace('/(volunteer)/schedule')}
            style={styles.actionButton}
          />
        </View>
      </Shell>
    );
  }

  if (checkIn.isError) {
    return (
      <Shell>
        <View style={styles.messageBlock}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.danger} />
          <Text style={styles.messageTitle}>Could not check you in</Text>
          {/* The API's messages are written to be shown as-is — "you are not on
              the accepted list", "that code is not valid for this outreach". */}
          <Text style={styles.messageBody}>{humanError(checkIn.error)}</Text>
          <Button title="Try again" variant="solid" onPress={scanAgain} style={styles.actionButton} />
        </View>
      </Shell>
    );
  }

  return (
    <Shell>
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          // QR only. Left unrestricted, the scanner would also read the
          // barcode on a passing medicine box and treat it as a candidate.
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={checkIn.isPending ? undefined : handleBarcode}
        />
        <View style={styles.reticle} pointerEvents="none" />
        {checkIn.isPending ? (
          <View style={styles.pendingOverlay}>
            <ActivityIndicator color={colors.white} />
            <Text style={styles.pendingText}>Checking you in...</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.instruction}>
        Point your camera at the check-in code your organiser is showing.
      </Text>

      {rejectHint ? (
        <Text style={styles.hint}>That isn&apos;t a VHub check-in code. Keep the camera steady.</Text>
      ) : null}

      <Text style={styles.footnote}>
        VHub checks your location once, at the moment you scan, to confirm you are at the event. It
        is never stored and you are never tracked. If location is off or unavailable, you are
        still checked in.
      </Text>
    </Shell>
  );
}

/** Shared frame, so every state above keeps the same header and padding. */
function Shell({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Scan to check in" fallback="/(volunteer)/schedule" />
      {/*
        CLEARS THE TAB PILL even though this screen is on the full-bleed
        exemption list. That exemption was written about the BUTTONS, which
        really are vertically centred and never at the bottom. The privacy
        footnote is not: it carries `marginTop: 'auto'`, which pins it to the
        bottom of this column, and with only 32dp of padding its last line or
        two were drawn under the floating pill. There is no scroller here
        (correctly), so nothing could bring them back into view, and that
        paragraph is the strongest privacy statement the app makes.
      */}
      <View style={[styles.content, { paddingBottom: tabBarClearance(insets.bottom) }]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraWrap: {
    // Square: a QR is square, and a full-bleed viewfinder would push the
    // privacy note below the fold on a small phone.
    aspectRatio: 1,
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.heroBackground,
    marginTop: spacing.sm,
  },
  reticle: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    margin: spacing.xxl,
    borderWidth: 2,
    borderColor: colors.white,
    borderRadius: radius.md,
    opacity: 0.8,
  },
  pendingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.overlay,
  },
  pendingText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.white,
  },
  instruction: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  hint: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.warning,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  messageBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  messageTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  messageBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  actionButton: {
    width: '100%',
    marginTop: spacing.sm,
  },
  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 'auto',
  },
});
