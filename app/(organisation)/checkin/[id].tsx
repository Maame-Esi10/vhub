import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
// Direct import, never the components/ui barrel: this pulls in react-native-svg,
// a NATIVE module, and the barrel is imported by nearly every screen — a
// re-export would take the whole app down on a dev client built without it
// rather than just this screen. Same rule as DateTimeField (see that barrel).
import QRCode from 'react-native-qrcode-svg';
import {
  Button,
  ConfirmDialog,
  ErrorState,
  ScreenHeader,
  formatEventDate,
  formatEventTimeRange,
} from '@/components/ui';
import { useOutreach } from '@/hooks/useOutreaches';
import { useOutreachCheckinCode } from '@/hooks/useAttendance';
// Separate module because it reaches expo-location — see the note at its top.
import { useAnchorVenue } from '@/hooks/useCheckInScan';
import { encodeCheckinQr } from '@/lib/checkin-qr';
import { isVenueAnchorUsable } from '@/lib/attendance';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

/**
 * The organiser's check-in QR, displayed at the venue for volunteers to scan.
 *
 * No Figma design exists for this screen (design-refs/ has Mark Attendance and
 * Post-Event Review, but nothing for the QR), so it reuses the app's own visual
 * language rather than inventing one: SafeAreaView + ScreenHeader, a white card
 * on the neutral ramp, the same status-card treatment as Identity Verification.
 *
 * TWO THINGS HAPPEN HERE, and the order matters to the organiser:
 *   1. Anchoring the venue — an explicit "I'm at the venue" tap, which is what
 *      gives every scan something to be compared against.
 *   2. Showing the QR itself.
 * The anchor is presented FIRST when it is missing or stale, because a QR
 * displayed without one still works (everyone is recorded present, unverified)
 * but quietly loses the location check the design exists for.
 */

const QR_SIZE = 232;

export default function OrganisationCheckinQr() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const outreachQuery = useOutreach(id);
  const codeQuery = useOutreachCheckinCode(id);
  const anchor = useAnchorVenue();
  const [confirmingAnchor, setConfirmingAnchor] = useState(false);

  const outreach = outreachQuery.data;

  if (outreachQuery.isLoading || codeQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Check-in code" fallback="/(organisation)/dashboard" />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (outreachQuery.isError || codeQuery.isError || !outreach || !codeQuery.data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Check-in code" fallback="/(organisation)/dashboard" />
        <ErrorState
          message={
            outreachQuery.error?.message ??
            codeQuery.error?.message ??
            'Could not load the check-in code for this outreach.'
          }
          onRetry={() => {
            void outreachQuery.refetch();
            void codeQuery.refetch();
          }}
        />
      </SafeAreaView>
    );
  }

  // The QR carries the outreach id AND the secret. Neither alone is enough:
  // the id is public (it is in the feed), and the code is verified server-side
  // against a table only this organisation can read.
  const qrValue = encodeCheckinQr({ outreachId: outreach.id, code: codeQuery.data });

  const anchored = isVenueAnchorUsable(outreach.venue_anchored_at, outreach.date);
  const anchoredSomeDay = !!outreach.venue_anchored_at;
  const timeRange = formatEventTimeRange(outreach.start_time, outreach.end_time);

  // LocationUnavailableError's messages are written to be shown as-is (they
  // already name the fix — enable it in Settings, step outside), and the API
  // client's messages are too, so one branch serves both.
  const anchorError = anchor.error?.message ?? null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Check-in code" fallback="/(organisation)/dashboard" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{outreach.title}</Text>
        <Text style={styles.meta}>
          {formatEventDate(outreach.date)}
          {timeRange ? ` · ${timeRange}` : ''}
        </Text>
        {outreach.location_name ? (
          <Text style={styles.meta}>{outreach.location_name}</Text>
        ) : null}

        {/*
          White card, deliberately: a QR needs a light quiet zone around it to
          scan reliably, and the app's neutral surface tint is not that.
        */}
        <View style={styles.qrCard}>
          <QRCode
            value={qrValue}
            size={QR_SIZE}
            backgroundColor={colors.white}
            color={colors.navy}
          />
        </View>

        <Text style={styles.instruction}>
          Hold this up where volunteers can reach it. Each one scans it once from their own phone.
        </Text>

        {/* ---------------- venue anchor ---------------- */}

        <View
          style={[
            styles.statusCard,
            { backgroundColor: anchored ? 'rgba(34, 197, 94, 0.12)' : colors.surface },
          ]}
        >
          <MaterialCommunityIcons
            name={anchored ? 'map-marker-check' : 'map-marker-alert-outline'}
            size={24}
            color={anchored ? colors.success : colors.textSecondary}
          />
          <View style={styles.statusText}>
            <Text style={styles.statusLabel}>
              {anchored ? 'Venue marked' : 'Venue not marked yet'}
            </Text>
            <Text style={styles.statusDetail}>
              {anchored
                ? 'Check-ins scanned here will be matched against this spot.'
                : anchoredSomeDay
                  ? // Anchored, but not today — so it will be DISCARDED rather
                    // than trusted. Said plainly, because an organiser who
                    // opened this screen the night before would otherwise
                    // believe the location check was running when it was not.
                    'This outreach was marked on a different day, so it will not be used. Tap below once you are at the venue today.'
                  : 'Volunteers can still check in — they will simply all be recorded as present without a location check.'}
            </Text>
          </View>
        </View>

        {anchorError ? <Text style={styles.errorText}>{anchorError}</Text> : null}

        {/*
          An explicit outcome after the tap, and this is not decoration.
          Without it the only feedback was the status card above quietly
          changing wording, and when an anchor saved but fell on the wrong day
          it changed from one grey card to another -- so a successful save was
          indistinguishable from nothing happening at all. That was reported.
        */}
        {anchor.isSuccess ? (
          anchor.data.usableForEvent ? (
            <View style={styles.resultOk}>
              <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />
              <Text style={styles.resultOkText}>
                Venue saved. Scans here will be matched against this spot for today&apos;s event.
              </Text>
            </View>
          ) : (
            <View style={styles.resultWarn}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.warning} />
              <Text style={styles.resultWarnText}>
                Saved, but it will not be used. A venue only counts on the day of the event, and
                this outreach is on {formatEventDate(outreach.date)}. Come back and tap this again
                when you are at the venue on the day — until then everyone who scans is still
                checked in, just without the location check.
              </Text>
            </View>
          )
        ) : null}

        <Button
          title={
            anchor.isPending
              ? 'Getting your location...'
              : anchored
                ? 'Update venue location'
                : "I'm at the venue"
          }
          variant={anchored ? 'outline' : 'solid'}
          disabled={anchor.isPending}
          onPress={() => setConfirmingAnchor(true)}
          style={styles.anchorButton}
        />

        <Text style={styles.footnote}>
          Marking the venue reads your location once, from this device, and stores only the
          venue&apos;s position — never a volunteer&apos;s. It counts on the day of the event only.
        </Text>
      </ScrollView>

      {/*
        The disclaimer belongs BEFORE the location read, not after. Tapping
        this button silently took a GPS fix and made wherever the organiser
        happened to be standing into the venue -- reasonable once you know
        that, and surprising if you do not.
      */}
      <ConfirmDialog
        visible={confirmingAnchor}
        icon="map-marker-radius-outline"
        title="Use this spot as the venue?"
        message={
          `V-HUB will read this phone's location once and save it as the venue for "${outreach.title}". ` +
          'Volunteers who scan nearby are then confirmed as on site. Only do this while you are actually at the venue, on the day of the event — a location saved on any other day is ignored.'
        }
        confirmLabel="Yes, I'm at the venue"
        cancelLabel="Not yet"
        busy={anchor.isPending}
        onConfirm={() => {
          setConfirmingAnchor(false);
          anchor.mutate(outreach.id);
        }}
        onCancel={() => setConfirmingAnchor(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.textPrimary,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  qrCard: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginTop: spacing.xl,
  },
  instruction: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.base,
    marginBottom: spacing.xl,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  statusText: {
    flex: 1,
    gap: spacing.xs,
  },
  statusLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  statusDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.md,
  },
  resultOk: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderRadius: radius.md,
    padding: spacing.base,
    marginTop: spacing.md,
  },
  resultOkText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  resultWarn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: radius.md,
    padding: spacing.base,
    marginTop: spacing.md,
  },
  resultWarnText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  anchorButton: {
    width: '100%',
    marginTop: spacing.base,
  },
  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
});
