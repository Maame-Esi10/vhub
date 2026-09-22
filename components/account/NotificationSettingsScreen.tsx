import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AlertDialog, ErrorState, ScreenHeader, SettingsGroupLabel } from '@/components/ui';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';
import { usePushPreference, useSetPushEnabled } from '@/hooks/usePushPreference';
import { useMutation } from '@tanstack/react-query';
import { sendTestPush } from '@/lib/api-client';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { humanError } from '@/lib/errorMessage';

export interface NotificationSettingsScreenProps {
  /** Where back goes when no `from` param was supplied. */
  fallback: Parameters<ReturnType<typeof useRouter>['replace']>[0];
  /** This role's notifications inbox. */
  inboxRoute: string;
  /** What this role actually receives, in plain words. */
  whatYouGet: string[];
}

/**
 * Notification settings, shared by both roles.
 *
 * WHY THIS SCREEN EXISTS (owner, 2026-09-21: "Settings: the Notifications row
 * opens the notifications page. It should open notification settings").
 *
 * It did, and that was the bug: a row under a PREFERENCES heading that opened
 * a list of messages. Somebody looking for a preference found an inbox, and
 * there was nowhere in the app to turn pushes off short of the Android system
 * settings.
 *
 * WHAT IT DELIBERATELY IS NOT. It is one switch, not a grid of per-type
 * toggles. Per-type preferences need a column on the profile, which is a gated
 * schema change, and far more importantly they need every one of the six
 * dispatch endpoints and two cron passes to consult that column -- and a
 * preference half the senders ignore is worse than none, because the app
 * visibly breaks a promise it made in writing. The token is already the
 * switch every sender obeys. See hooks/usePushPreference.ts.
 *
 * THE INBOX IS NOT AFFECTED AND THE SCREEN SAYS SO. `notifyUsers` writes the
 * notifications row whether or not a token exists, which is why somebody who
 * declined the OS prompt still sees their application decisions. Turning this
 * off silences the phone and never the record, and a person deciding whether
 * to turn it off needs to know that before they do.
 */
export function NotificationSettingsScreen({
  fallback,
  inboxRoute,
  whatYouGet,
}: NotificationSettingsScreenProps) {
  const tabBarPadding = useTabBarContentPadding();
  const router = useRouter();
  const preference = usePushPreference();
  const setEnabled = useSetPushEnabled();
  // `tone` because this popup now reports a SUCCESS as well as failures, and a
  // successful test dressed in red reads as the test having failed.
  const [notice, setNotice] = useState<
    { title: string; message: string; tone?: 'success' | 'error' } | null
  >(null);

  /*
    THE TEST PUSH (owner, 2026-09-22: the toggle is on and nothing arrives on
    the phone).

    A push crosses four things VHub cannot see into: whether this device ever
    registered a token, whether Google accepted the message, whether Android
    decided to show it, and whether the phone was awake. When none of them
    reports back, "I am not getting notifications" is one sentence covering four
    completely different faults, and there is no way to tell them apart by
    looking at the app.

    This separates them in one tap, because each outcome is a different answer:

      - It refuses with "no push token" -> this device never registered. The
        switch says on because the switch reflects the OS permission, which was
        granted; the token write is a separate step and it did not happen.
      - It reports 0 sent -> the token was removed, most often by signing out on
        this phone or reinstalling.
      - It reports 1 or more and the phone buzzes -> delivery works, and a
        missing notification is about that particular sender.
      - It reports 1 or more and the phone stays silent -> delivery is the
        problem, which on Android is nearly always the FCM credential or battery
        optimisation, and neither is visible from in here.

    The endpoint it calls can only ever target the CALLER's own devices, so this
    is not a way to send anybody else a notification.
  */
  const testPush = useMutation({
    mutationFn: () =>
      sendTestPush(
        'Test notification',
        'If you can read this on your phone, VHub push notifications are working.'
      ),
    onSuccess: (result) => {
      /*
        THREE OUTCOMES, THREE DIFFERENT FAULTS. The old version had two, and
        the one it was missing is the one that was actually happening: Expo
        answers 200 for a request it ACCEPTED and then reports per-message
        failures in the body, so a push that could never be delivered looked
        identical to one that was. See server/expoPush.ts.
      */
      if (result.failures.length > 0) {
        const failure = result.failures[0]!;
        const credentialFault =
          failure.code === 'MismatchSenderId' || failure.code === 'InvalidCredentials';
        const deadToken = failure.code === 'DeviceNotRegistered';

        setNotice({
          title: 'The notification was refused',
          message: credentialFault
            ? 'The push service will not deliver to this app. This is a setup problem in the build rather than anything on your phone, and no amount of changing settings here will fix it. Nothing else about VHub is affected.'
            : deadToken
              ? 'This phone is registered under an old install of VHub. Turn the switch off and on again to register it fresh, then send another test.'
              : failure.message,
        });
        return;
      }

      if (result.dispatched === 0) {
        setNotice({
          title: 'No device is registered',
          message:
            'This phone is not set up to receive notifications, even though the switch is on. Turn the switch off and on again to register it, then send another test.',
        });
        return;
      }

      setNotice({
        tone: 'success' as const,
        title: 'Test sent',
        message:
          'The push service accepted it. If nothing appears on your phone within a minute, it is being blocked after that point, usually by battery saving. It has been added to your notifications list either way.',
      });
    },
    onError: (error) => {
      setNotice({
        title: 'Could not send the test',
        message: humanError(error, 'Please try again in a moment.'),
      });
    },
  });

  const state = preference.data;
  const blockedByOs = state?.supported === true && state.permission === 'denied';

  function handleToggle(next: boolean) {
    setEnabled.mutate(next, {
      onSuccess: (result) => {
        if (result.ok) return;
        /*
          A refused permission is not an error, but it IS the one case where
          the switch does not do what the person just asked it to. Saying
          nothing would leave a switch that flicks back on its own.
        */
        setNotice(
          result.reason === 'permission_denied'
            ? {
                title: 'Android is blocking notifications',
                message:
                  'VHub cannot turn these on by itself once the permission has been refused. Open the Android settings below and allow notifications for VHub, then come back.',
              }
            : {
                title: 'Could not turn notifications on',
                message:
                  'Something went wrong setting this device up. Check your connection and try again.',
              }
        );
      },
      onError: (error) => {
        setNotice({
          title: 'Could not change this setting',
          message: humanError(error, 'Please try again.'),
        });
      },
    });
  }

  const header = <ScreenHeader title="Notifications" fallback={fallback} />;

  if (preference.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.centerFill}>
          <ErrorState
            message={humanError(preference.error, 'Please try again.')}
            onRetry={() => preference.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}

      <ScrollView contentContainerStyle={[styles.content, tabBarPadding]}>
        <SettingsGroupLabel>ON THIS DEVICE</SettingsGroupLabel>

        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchTitle}>Push notifications</Text>
              <Text style={styles.switchBody}>
                {blockedByOs
                  ? 'Blocked in your Android settings.'
                  : state?.enabled
                    ? 'This phone will buzz when something needs you.'
                    : 'This phone stays quiet.'}
              </Text>
            </View>
            {preference.isLoading || setEnabled.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Switch
                value={state?.enabled ?? false}
                onValueChange={handleToggle}
                disabled={state?.supported === false}
                accessibilityLabel="Push notifications on this device"
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
            )}
          </View>

          {/*
            THE SENTENCE THAT MAKES TURNING IT OFF A SAFE DECISION. Somebody
            weighing this needs to know it silences the phone and not the
            record, and they need to know BEFORE they decide, not after.
          */}
          <View style={styles.reassurance}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.reassuranceText}>
              Turning this off only stops your phone buzzing. Everything is still saved and you can
              read it in your notifications list at any time.
            </Text>
          </View>
        </View>

        {/*
          Only offered when the switch is on. Testing delivery to a device that
          has deliberately been silenced would send a notification nobody asked
          for and then report a failure that is not one.
        */}
        {state?.enabled ? (
          <Pressable
            onPress={() => testPush.mutate()}
            disabled={testPush.isPending}
            accessibilityRole="button"
            accessibilityLabel="Send yourself a test notification"
            style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="bell-ring-outline" size={20} color={colors.primary} />
            <View style={styles.linkText}>
              <Text style={styles.linkTitle}>Send a test notification</Text>
              <Text style={styles.linkBody}>
                {testPush.isPending
                  ? 'Sending...'
                  : 'Goes to this phone only, so you can see whether pushes arrive at all.'}
              </Text>
            </View>
            {testPush.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
            )}
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => void Linking.openSettings()}
          accessibilityRole="button"
          accessibilityLabel="Open the Android notification settings for VHub"
          style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="cog-outline" size={20} color={colors.textSecondary} />
          <View style={styles.linkText}>
            <Text style={styles.linkTitle}>Android notification settings</Text>
            <Text style={styles.linkBody}>Sounds, banners and the lock screen are set here.</Text>
          </View>
          <MaterialCommunityIcons name="open-in-new" size={18} color={colors.textSecondary} />
        </Pressable>

        <SettingsGroupLabel>WHAT VHUB SENDS</SettingsGroupLabel>
        <View style={styles.card}>
          {whatYouGet.map((line) => (
            <View key={line} style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={styles.bulletText}>{line}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => router.push(inboxRoute as Parameters<typeof router.push>[0])}
          accessibilityRole="button"
          accessibilityLabel="Open your notifications"
          style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color={colors.textSecondary} />
          <View style={styles.linkText}>
            <Text style={styles.linkTitle}>See your notifications</Text>
            <Text style={styles.linkBody}>Everything VHub has sent you, newest first.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
        </Pressable>
      </ScrollView>

      <AlertDialog
        visible={notice !== null}
        tone={notice?.tone ?? 'error'}
        title={notice?.title ?? ''}
        message={notice?.message}
        actionLabel={blockedByOs ? 'Open Android settings' : undefined}
        onAction={blockedByOs ? () => { setNotice(null); void Linking.openSettings(); } : undefined}
        onDismiss={() => setNotice(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  card: {
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  switchText: {
    flex: 1,
  },
  switchTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  switchBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },
  reassurance: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reassuranceText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  linkText: {
    flex: 1,
  },
  linkTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  linkBody: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
});
