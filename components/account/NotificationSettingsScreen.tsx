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
