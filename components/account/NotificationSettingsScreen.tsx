import { useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertDialog,
  ErrorState,
  ScreenHeader,
  SettingsGroupLabel,
  SettingsRow,
  SettingsToggleRow,
} from '@/components/ui';
import type { ScreenHeaderProps } from '@/components/ui';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';
import { usePushPreference, useSetPushEnabled } from '@/hooks/usePushPreference';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { humanError } from '@/lib/errorMessage';

export interface NotificationSettingsScreenProps {
  /** Where back goes when no `from` param was supplied. */
  fallback: ScreenHeaderProps['fallback'];
  /**
   * What this role actually receives, in plain words.
   *
   * `inboxRoute` used to sit beside this and is gone with the row it fed: the
   * inbox has a bell on both home screens and its own row one tap from here,
   * so a third door to it on the screen ABOUT it pointed back where the reader
   * had just come from.
   */
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
  whatYouGet,
}: NotificationSettingsScreenProps) {
  const tabBarPadding = useTabBarContentPadding();
  const preference = usePushPreference();
  const setEnabled = useSetPushEnabled();
  // Failures only, now that the test push is gone: every remaining notice on
  // this screen is the toggle refusing to do what was just asked of it. `tone`
  // went with the test -- it existed so a successful test was not dressed in
  // red, and a field nothing sets is how a type starts lying.
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

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

        {/*
          NO BOX AROUND THE TOGGLE (owner, 2026-09-22: "toggles don't need those
          boxes"). This was a bordered card built before SettingsRow existed, so
          the screen carried two different treatments for rows doing the same
          kind of job -- and the box was drawing a frame around a control that
          needs no separating from anything.
        */}
        <SettingsToggleRow
          icon="bell-outline"
          label="Push notifications"
          value={
            blockedByOs
              ? 'Blocked in your Android settings'
              : state?.enabled
                ? 'This phone will buzz when something needs you'
                : 'This phone stays quiet'
          }
          checked={state?.enabled ?? false}
          onChange={handleToggle}
          busy={preference.isLoading || setEnabled.isPending}
          disabled={state?.supported === false}
        />

        {/*
          THE SENTENCE THAT MAKES TURNING IT OFF A SAFE DECISION, and it is now
          a plain line under the row rather than a panel inside it. Somebody
          weighing this needs to know it silences the phone and not the record,
          and they need to know BEFORE they decide.
        */}
        <Text style={styles.note}>
          Turning this off only stops your phone buzzing. Everything is still saved and you can read
          it in your notifications at any time.
        </Text>

        <SettingsRow
          icon="cog-outline"
          label="Android notification settings"
          value="Sounds, banners and the lock screen are set here"
          onPress={() => void Linking.openSettings()}
        />

        <SettingsGroupLabel>WHAT VHUB SENDS</SettingsGroupLabel>
        {whatYouGet.map((line) => (
          <View key={line} style={styles.bulletRow}>
            <View style={styles.bullet} />
            <Text style={styles.bulletText}>{line}</Text>
          </View>
        ))}

        {/*
          "See your notifications" WAS HERE AND IS GONE (owner: "remove the see
          your notification, redundancy"). The inbox has its own bell on both
          home screens and its own row is one tap from here in either
          direction; a third door to it on the screen ABOUT it was a link back
          to where the reader almost certainly just came from.
        */}
      </ScrollView>

      <AlertDialog
        visible={notice !== null}
        tone="error"
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
  /** The reassurance under the toggle, on the page rather than in a panel. */
  note: {
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.base,
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
