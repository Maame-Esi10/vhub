import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Input } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  MIN_PASSWORD_LENGTH,
  passwordStrength,
  useCompletePasswordReset,
  useRequestPasswordReset,
} from '@/hooks';

/** The recovery code Supabase puts in the email. */
const CODE_LENGTH = 6;

/**
 * The second half of "I have forgotten my password": type the code from the
 * email, choose a new password, done.
 *
 * NO DESIGN EXISTS FOR THIS SCREEN — the Figma export stops at the email
 * form, in every approach, because whatever happens after the email was never
 * drawn. So it reuses the existing auth visual language exactly (the same
 * header, the same pill inputs, the same navy action button, the same strength
 * meter as Settings -> Account & Security) rather than introducing a second
 * look for one screen.
 *
 * WHY THE CODE AND THE NEW PASSWORD ARE ON ONE SCREEN, not two. Verifying the
 * code signs the person in: at that moment they hold a real session, opened
 * with a code from an email rather than a password. Splitting the steps would
 * mean a screen that exists only while somebody is signed in on a recovery
 * code and has not yet chosen a password — a state worth not having. Asking
 * for both at once means the verification and the new password are one
 * submission, and the account is never left in that condition.
 *
 * The guard leaves this screen alone even once that session exists:
 * `AUTH_ENTRY_SCREENS` in useAuthGuard is welcome/login/register only, so a
 * session appearing mid-flow does not pull the user into their tab group
 * before the password has been written. The onboarding wizard relies on the
 * same exclusion for the same reason.
 */
export default function ResetPassword() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const email = typeof emailParam === 'string' ? emailParam : '';

  const completeReset = useCompletePasswordReset();
  const resend = useRequestPasswordReset();

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [resent, setResent] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);

  // Derived from state rather than written into it on submit. A snapshot taken
  // at submit time is the bug the Create Outreach wizard had: the message stays
  // on screen describing a field the user has since corrected.
  const errors = useMemo(() => {
    if (!attempted) return {};
    return {
      code:
        code.trim().length === CODE_LENGTH
          ? undefined
          : `Enter the ${CODE_LENGTH}-digit code from the email.`,
      password:
        password.length >= MIN_PASSWORD_LENGTH
          ? undefined
          : `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      confirm: password === confirmPassword ? undefined : 'Both passwords must match.',
    };
  }, [attempted, code, password, confirmPassword]);

  const handleSubmit = useCallback(() => {
    setAttempted(true);
    setResent(false);

    if (
      code.trim().length !== CODE_LENGTH ||
      password.length < MIN_PASSWORD_LENGTH ||
      password !== confirmPassword
    ) {
      return;
    }

    completeReset.mutate(
      { email, code, newPassword: password },
      {
        onSuccess: () => {
          // The person is signed in now, with the password they just chose.
          // Sending them to the root lets the guard route them the same way it
          // routes any other sign-in -- including a volunteer whose onboarding
          // is still unfinished, who belongs on welcome rather than in the tabs.
          router.replace('/');
        },
      }
    );
  }, [code, password, confirmPassword, email, completeReset, router]);

  const handleResend = useCallback(() => {
    setResent(false);
    resend.mutate(email, { onSuccess: () => setResent(true) });
  }, [email, resend]);

  const goToLogin = useCallback(() => {
    router.replace('/(auth)/login');
  }, [router]);

  const submitting = completeReset.isPending;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + spacing.base }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={styles.backButton}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.wordmark}>V-HUB</Text>
            <View style={styles.backButton} />
          </View>

          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            {email
              ? `If ${email} has a V-HUB account, we have sent it a ${CODE_LENGTH}-digit code. Enter it below and choose a new password.`
              : `Enter the ${CODE_LENGTH}-digit code from your email and choose a new password.`}
          </Text>

          <View style={styles.form}>
            <Input
              label="Reset Code"
              placeholder="123456"
              value={code}
              onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, CODE_LENGTH))}
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="oneTimeCode"
              maxLength={CODE_LENGTH}
              accessibilityLabel="Reset code"
              error={errors.code}
              leadingIcon={
                <MaterialCommunityIcons name="numeric" size={20} color={colors.textSecondary} />
              }
            />

            <View style={styles.fieldGap} />

            <Input
              label="New Password"
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              accessibilityLabel="New password"
              error={errors.password}
              leadingIcon={
                <MaterialCommunityIcons name="lock-outline" size={20} color={colors.textSecondary} />
              }
              trailingElement={
                <Pressable
                  onPress={() => setShowPassword((prev) => !prev)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <MaterialCommunityIcons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </Pressable>
              }
            />

            {password.length > 0 ? (
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
              placeholder="Type it again"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              accessibilityLabel="Confirm new password"
              error={errors.confirm}
              leadingIcon={
                <MaterialCommunityIcons name="lock-check-outline" size={20} color={colors.textSecondary} />
              }
              trailingElement={
                <Pressable
                  onPress={() => setShowConfirm((prev) => !prev)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'}
                >
                  <MaterialCommunityIcons
                    name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </Pressable>
              }
            />
          </View>

          <View style={styles.ctaBlock}>
            {submitting ? (
              <View style={[styles.actionButton, styles.actionButtonLoading]}>
                <ActivityIndicator color={colors.white} />
              </View>
            ) : (
              <Button
                title="Set New Password"
                variant="solid"
                onPress={handleSubmit}
                accessibilityLabel="Set new password"
                style={styles.actionButton}
              />
            )}
            {completeReset.error ? (
              <Text style={styles.errorText}>{completeReset.error.message}</Text>
            ) : null}
          </View>

          <View style={styles.resendBlock}>
            <Text style={styles.resendHint}>Nothing arrived? Check your spam folder first.</Text>
            <Pressable
              onPress={handleResend}
              hitSlop={8}
              disabled={resend.isPending}
              accessibilityRole="button"
              accessibilityLabel="Send a new code"
            >
              <Text style={[styles.link, resend.isPending && styles.linkDisabled]}>
                {resend.isPending ? 'Sending…' : 'Send a new code'}
              </Text>
            </Pressable>
            {resent ? <Text style={styles.resentNote}>A new code is on its way.</Text> : null}
            {resend.error ? <Text style={styles.errorText}>{resend.error.message}</Text> : null}
          </View>

          <View style={styles.backRow}>
            <Pressable
              onPress={goToLogin}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back to login"
            >
              <Text style={styles.link}>Back to login</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    color: colors.textPrimary,
    marginTop: spacing.xxl,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  form: {
    marginTop: spacing.xl,
  },
  fieldGap: {
    height: spacing.lg,
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
  ctaBlock: {
    marginTop: spacing.xl,
  },
  actionButton: {
    width: '100%',
  },
  actionButtonLoading: {
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.navy,
  },
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  resendBlock: {
    marginTop: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  resendHint: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  link: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.primary,
  },
  linkDisabled: {
    color: colors.textSecondary,
  },
  resentNote: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.success,
    textAlign: 'center',
  },
  backRow: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
});
