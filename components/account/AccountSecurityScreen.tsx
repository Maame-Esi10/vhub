import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { KEYBOARD_AVOID_BEHAVIOR } from '@/constants/keyboard';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Button,
  ConfirmDialog,
  EditSectionCard,
  Input,
  ScreenHeader,
  SettingsGroupLabel,
} from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  MIN_PASSWORD_LENGTH,
  passwordStrength,
  syncProfileEmail,
  useCancelEmailChange,
  useChangeLoginEmail,
  useChangePassword,
  useCloseAccount,
} from '@/hooks/useAccountSecurity';
import { useSignOut } from '@/hooks/useSignOut';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export interface AccountSecurityScreenProps {
  /** Where the header's back arrow lands if there is no navigation history. */
  fallback: string;
}

/**
 * Account & Security — changing the LOGIN EMAIL and the PASSWORD.
 *
 * Shared by both roles: credentials work identically for a volunteer and an
 * organisation, and forking it would mean fixing every auth bug twice. Only
 * the header fallback differs, which is why that is the single prop.
 *
 * NOTE: design-refs/ has no Account & Security frame — the closest are
 * Settings.png (row groups) and Forgot Password.png (the password field
 * treatment). This screen is assembled from those two and from Edit
 * Profile's EditSectionCard/Input/Button language. Nothing new was invented.
 *
 * Contact details are deliberately NOT here. They live on Edit Profile,
 * because "how volunteers reach my organisation" and "what I type to sign in"
 * are different things with different audiences and different risk.
 */
export function AccountSecurityScreen({ fallback }: AccountSecurityScreenProps) {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailErrors, setEmailErrors] = useState<{ email?: string; password?: string }>({});
  const [emailSent, setEmailSent] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<{
    current?: string;
    next?: string;
    confirm?: string;
  }>({});
  const [passwordDone, setPasswordDone] = useState(false);

  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const changeEmail = useChangeLoginEmail();
  const changePassword = useChangePassword();
  const cancelChange = useCancelEmailChange();

  /*
    CLOSING THE ACCOUNT. Immediate, irreversible, and gated behind typing the
    word rather than a single tap — this is the only control in the app that
    cannot be undone by anybody, including an administrator.
  */
  const closeAccount = useCloseAccount();
  const { signOut } = useSignOut();
  const [closeVisible, setCloseVisible] = useState(false);
  const [closeConfirmation, setCloseConfirmation] = useState('');
  const [closeAttempted, setCloseAttempted] = useState(false);
  const closeConfirmed = closeConfirmation.trim().toUpperCase() === 'CLOSE';

  function handleClose() {
    setCloseAttempted(true);
    if (!closeConfirmed) return;

    closeAccount.mutate(undefined, {
      onSuccess: () => {
        /*
          SIGNING OUT IS PART OF THE OPERATION, not a courtesy. The ban does not
          invalidate the session the caller is holding until it is next
          refreshed, so leaving them signed in would show an anonymised version
          of their own account -- their name replaced, their profile emptied --
          which reads as the app having broken rather than as a closure that
          worked.
        */
        void signOut();
      },
    });
  }

  // `new_email` is populated by Supabase only while a change awaits
  // confirmation, so reading it from the session (rather than tracking a local
  // "I just submitted" flag) means the pending banner survives an app restart
  // and disappears by itself once the links are clicked.
  const pendingEmail = (user as { new_email?: string | null } | null)?.new_email ?? null;

  /**
   * Re-reads the session and, if the confirmed address has moved, mirrors it
   * into profiles.email.
   *
   * Runs on mount because the confirmation link reopens the app on THIS
   * screen: the moment the user lands back here is exactly when the change
   * may have just completed.
   */
  const refreshSession = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    setUser(data.user);
    if (data.user.email) {
      await syncProfileEmail(data.user.id, data.user.email);
    }
  }, [setUser]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const strength = useMemo(() => passwordStrength(nextPassword), [nextPassword]);

  function toggle(key: string) {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function eye(key: string) {
    return (
      <Pressable
        onPress={() => toggle(key)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={revealed[key] ? 'Hide password' : 'Show password'}
      >
        <MaterialCommunityIcons
          name={revealed[key] ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>
    );
  }

  async function handleEmailSubmit() {
    const trimmed = newEmail.trim();
    const next: { email?: string; password?: string } = {};
    // Deliberately permissive: a shape check only. Real validation is the
    // confirmation link — an address that cannot receive mail never confirms.
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) next.email = 'Enter a valid email address.';
    if (!emailPassword) next.password = 'Confirm your current password to continue.';
    setEmailErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      await changeEmail.mutateAsync({ newEmail: trimmed, currentPassword: emailPassword });
      setEmailSent(true);
      setNewEmail('');
      setEmailPassword('');
      await refreshSession();
    } catch {
      // Surfaced from the mutation's `error` below.
    }
  }

  async function handleCancelChange() {
    try {
      await cancelChange.mutateAsync();
      setEmailSent(false);
      await refreshSession();
    } catch {
      // Surfaced below.
    }
  }

  async function handlePasswordSubmit() {
    const next: { current?: string; next?: string; confirm?: string } = {};
    if (!currentPassword) next.current = 'Enter your current password.';
    if (nextPassword.length < MIN_PASSWORD_LENGTH) {
      next.next = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (confirmPassword !== nextPassword) next.confirm = 'These passwords do not match.';
    setPasswordErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      await changePassword.mutateAsync({ currentPassword, newPassword: nextPassword });
      setPasswordDone(true);
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
    } catch {
      // Surfaced below.
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Account & Security" fallback={fallback} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={KEYBOARD_AVOID_BEHAVIOR}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SettingsGroupLabel>LOGIN</SettingsGroupLabel>

          <EditSectionCard icon="email-outline" title="LOGIN EMAIL">
            <Text style={styles.currentLabel}>You sign in as</Text>
            <Text style={styles.currentValue}>{user?.email ?? 'Not set'}</Text>

            {pendingEmail ? (
              <View style={styles.pending}>
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={16}
                  color={colors.textSecondary}
                />
                <View style={styles.pendingBody}>
                  <Text style={styles.pendingText}>
                    Waiting on confirmation for{' '}
                    <Text style={styles.pendingEmail}>{pendingEmail}</Text>. Open the link we sent
                    to that address, and the one sent to {user?.email}, to finish. Until then you
                    keep signing in with your current email.
                  </Text>
                  <Pressable
                    onPress={handleCancelChange}
                    disabled={cancelChange.isPending}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelLink}>
                      {cancelChange.isPending ? 'Cancelling…' : 'Cancel this change'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {emailSent && !pendingEmail ? (
              <Text style={styles.success}>
                Check your inbox. We have sent the confirmation link.
              </Text>
            ) : null}

            <View style={styles.fieldGap} />
            <Input
              label="New Email"
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              error={emailErrors.email}
            />
            <View style={styles.fieldGap} />
            <Input
              label="Current Password"
              value={emailPassword}
              onChangeText={setEmailPassword}
              placeholder="Your password"
              autoCapitalize="none"
              secureTextEntry={!revealed.emailPassword}
              trailingElement={eye('emailPassword')}
              error={emailErrors.password}
            />
            <Text style={styles.helper}>
              We ask for your password because changing this address changes how you sign in.
            </Text>

            {changeEmail.error ? (
              <Text style={styles.error}>
                {changeEmail.error instanceof Error
                  ? changeEmail.error.message
                  : 'Could not start the email change.'}
              </Text>
            ) : null}
            {cancelChange.error ? (
              <Text style={styles.error}>
                {cancelChange.error instanceof Error
                  ? cancelChange.error.message
                  : 'Could not cancel the email change.'}
              </Text>
            ) : null}

            <Button
              title={changeEmail.isPending ? 'Sending…' : 'Send Confirmation Link'}
              variant="solid"
              disabled={changeEmail.isPending}
              onPress={handleEmailSubmit}
              style={styles.action}
            />
          </EditSectionCard>

          <SettingsGroupLabel>PASSWORD</SettingsGroupLabel>

          <EditSectionCard icon="lock-outline" title="CHANGE PASSWORD">
            <Input
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Your current password"
              autoCapitalize="none"
              secureTextEntry={!revealed.current}
              trailingElement={eye('current')}
              error={passwordErrors.current}
            />
            <View style={styles.fieldGap} />
            <Input
              label="New Password"
              value={nextPassword}
              onChangeText={setNextPassword}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              autoCapitalize="none"
              secureTextEntry={!revealed.next}
              trailingElement={eye('next')}
              error={passwordErrors.next}
            />

            {nextPassword.length > 0 ? (
              <View style={styles.meterRow}>
                <View style={styles.meterTrack}>
                  <View
                    style={[
                      styles.meterFill,
                      strength === 'weak' && styles.meterWeak,
                      strength === 'fair' && styles.meterFair,
                      strength === 'strong' && styles.meterStrong,
                    ]}
                  />
                </View>
                <Text style={styles.meterLabel}>
                  {strength === 'weak' ? 'Weak' : strength === 'fair' ? 'Fair' : 'Strong'}
                </Text>
              </View>
            ) : null}

            <View style={styles.fieldGap} />
            <Input
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Type it again"
              autoCapitalize="none"
              secureTextEntry={!revealed.confirm}
              trailingElement={eye('confirm')}
              error={passwordErrors.confirm}
            />

            {passwordDone ? (
              <Text style={styles.success}>Your password has been updated.</Text>
            ) : null}
            {changePassword.error ? (
              <Text style={styles.error}>
                {changePassword.error instanceof Error
                  ? changePassword.error.message
                  : 'Could not update your password.'}
              </Text>
            ) : null}

            <Button
              title={changePassword.isPending ? 'Updating…' : 'Update Password'}
              variant="solid"
              disabled={changePassword.isPending}
              onPress={handlePasswordSubmit}
              style={styles.action}
            />
          </EditSectionCard>

          {/*
            Points at the signed-out recovery flow rather than trying to
            recover in place: someone who cannot supply their current password
            cannot be safely served from inside an authenticated session.
          */}
          <Text style={styles.footnote}>
            Forgotten your password? Sign out and use “Forgot Password” on the login screen.
          </Text>

          {/*
            THE DANGER ZONE, given real separation from the password card above
            rather than dropped straight underneath it. It is the one control
            here that nothing can undo, and a destructive action jammed against
            an ordinary one invites the wrong tap.
          */}
          <SettingsGroupLabel>CLOSING YOUR ACCOUNT</SettingsGroupLabel>

          <View style={styles.dangerCard}>
            <View style={styles.dangerHeader}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={20}
                color={colors.danger}
              />
              <Text style={styles.dangerTitle}>Close my account</Text>
            </View>

            {/*
              Says exactly what survives and what does not, BEFORE the button.
              A closure that quietly kept records the person believed were gone
              would be the app breaking its own privacy policy in the one place
              somebody is most entitled to trust it.
            */}
            <Text style={styles.dangerBody}>
              This removes you from V-HUB straight away. Your name, contact details, photo and
              everything you have written about yourself are cleared, any document you uploaded is
              destroyed, and you will not be able to sign in again.
            </Text>
            <Text style={styles.dangerBody}>
              Events you actually took part in stay on record — that you attended, and reviews
              written about that work. An organisation’s record of who worked at its clinic is
              its record too, not only yours, so it is kept without your name on it.
            </Text>
            <Text style={styles.dangerBody}>
              Anything still ahead of you is cancelled first, and anyone affected is told.
            </Text>

            <Button
              title="Close my account"
              variant="outline"
              onPress={() => {
                setCloseVisible(true);
                setCloseConfirmation('');
                setCloseAttempted(false);
              }}
              style={styles.action}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={closeVisible}
        icon="alert-circle-outline"
        tone="destructive"
        title="Close your account?"
        message="This cannot be undone, by you or by anybody at V-HUB. Type CLOSE to confirm."
        confirmLabel="Close my account"
        cancelLabel="Keep my account"
        busy={closeAccount.isPending}
        onConfirm={handleClose}
        onCancel={() => {
          setCloseVisible(false);
          setCloseConfirmation('');
          setCloseAttempted(false);
        }}
      >
        <Input
          label="Type CLOSE"
          required
          value={closeConfirmation}
          onChangeText={setCloseConfirmation}
          placeholder="CLOSE"
          autoCapitalize="characters"
          error={closeAttempted && !closeConfirmed ? 'Type CLOSE to confirm.' : undefined}
        />
        {closeAccount.error ? (
          <Text style={styles.error}>{closeAccount.error.message}</Text>
        ) : null}
      </ConfirmDialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  currentLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  currentValue: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  pending: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginTop: spacing.md,
  },
  pendingBody: {
    flex: 1,
  },
  pendingText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  pendingEmail: {
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  cancelLink: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  fieldGap: {
    height: spacing.base,
  },
  helper: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  meterTrack: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  meterWeak: {
    width: '33%',
    backgroundColor: colors.danger,
  },
  meterFair: {
    width: '66%',
    backgroundColor: colors.warning,
  },
  meterStrong: {
    width: '100%',
    backgroundColor: colors.success,
  },
  meterLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
    width: 46,
    textAlign: 'right',
  },
  success: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.success,
    marginTop: spacing.md,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.md,
  },
  action: {
    marginTop: spacing.base,
  },
  dangerCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  dangerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dangerTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  dangerBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
