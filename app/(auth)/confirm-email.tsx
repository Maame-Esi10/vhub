import { useCallback, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { KEYBOARD_AVOID_BEHAVIOR } from '@/constants/keyboard';
import { Text } from '@/components/ui/Text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Input } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { getLogoSize } from '@/constants/logoSizes';
import { useConfirmSignUp, useResendConfirmation } from '@/hooks';
import { humanError } from '@/lib/errorMessage';

/** The confirmation code Supabase puts in the email. */
const CODE_LENGTH = 6;

/**
 * Confirming a brand-new account WITHOUT LEAVING THE APP.
 *
 * WHAT THIS REPLACES, AND WHY (owner, 2026-09-14). The emailed link sends a
 * person through the mail app, a browser, a landing page and back again by
 * hand. The owner did exactly that, saw the landing page confirm successfully,
 * returned, tried to log in, and got nothing at all - because everything
 * between leaving V-HUB and coming back is invisible to V-HUB. A flow whose
 * failures cannot be observed by the person in it is a flow that cannot be
 * reported, and that is what made the code worth building rather than
 * patching the link.
 *
 * THE LINK STILL WORKS. `api/src/app/page.tsx` still receives anyone who taps
 * it, and confirming that way then falls through to the `existing` branch in
 * useConfirmSignUp. The code is the primary path; the link is the fallback,
 * which is the opposite of how it was.
 *
 * NOT AN AUTH_ENTRY_SCREEN, and that matters. `verifyOtp` creates a real
 * session, and the guard bounces a signed-in user out of welcome/login/
 * register the moment one appears. This screen is excluded from that set, so
 * the session can appear mid-flow without yanking the person away before their
 * profile rows are written - the same exclusion the onboarding wizard and the
 * password reset both rely on.
 */
export default function ConfirmEmail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const logoSize = getLogoSize('small', width);
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const email = typeof emailParam === 'string' ? emailParam : '';

  const confirmSignUp = useConfirmSignUp();
  const resend = useResendConfirmation();

  const [code, setCode] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [resent, setResent] = useState(false);

  const codeError =
    attempted && code.trim().length !== CODE_LENGTH
      ? `Enter the ${CODE_LENGTH}-digit code from the email.`
      : undefined;

  const handleConfirm = useCallback(() => {
    setAttempted(true);
    if (code.trim().length !== CODE_LENGTH) return;

    confirmSignUp.mutate(
      { email, code },
      {
        onSuccess: () => {
          // To the ROOT, never a role home. The guard decides where this
          // person belongs - including a volunteer whose onboarding has not
          // started, who must land in the wizard rather than the tabs.
          router.replace('/');
        },
      }
    );
  }, [code, email, confirmSignUp, router]);

  const handleResend = useCallback(() => {
    setResent(false);
    resend.mutate(email, { onSuccess: () => setResent(true) });
  }, [email, resend]);

  const submitting = confirmSignUp.isPending;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_AVOID_BEHAVIOR}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            // Bottom inset as well as top: there is no tab bar under an auth
            // screen to carry it, and 24dp from the window edge is under the
            // gesture bar on some handsets and clear of it on others.
            { paddingTop: insets.top + spacing.base, paddingBottom: insets.bottom + spacing.xxl },
          ]}
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
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: logoSize, height: logoSize }}
              resizeMode="contain"
            />
            <View style={styles.backButton} />
          </View>

          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="email-check-outline" size={36} color={colors.primary} />
          </View>

          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            {email
              ? `We sent a ${CODE_LENGTH}-digit code to ${email}. Enter it below to finish setting up your account.`
              : `Enter the ${CODE_LENGTH}-digit code from your email to finish setting up your account.`}
          </Text>
          {/* The confirmation email is the most spam-prone message V-HUB
              sends: it goes to somebody who has never heard from the sender.
              Same wording as the reset-password screen, deliberately. */}
          <Text style={styles.hint}>Nothing arrived? Check your spam folder first.</Text>

          <View style={styles.form}>
            <Input
              label="Confirmation Code"
              placeholder="123456"
              value={code}
              onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, CODE_LENGTH))}
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              // Lets the keyboard offer the code straight from the email on
              // both platforms, which is the whole ergonomic win over a link.
              textContentType="oneTimeCode"
              maxLength={CODE_LENGTH}
              accessibilityLabel="Confirmation code"
              error={codeError}
              leadingIcon={
                <MaterialCommunityIcons name="numeric" size={20} color={colors.textSecondary} />
              }
            />
          </View>

          <Button
            title={submitting ? 'Confirming...' : 'Confirm my account'}
            variant="solid"
            onPress={handleConfirm}
            disabled={submitting}
            accessibilityLabel="Confirm my account"
            style={styles.primaryButton}
          />

          {confirmSignUp.isError ? (
            <Text style={styles.errorText}>
              {humanError(confirmSignUp.error, 'We could not confirm your account. Please try again.')}
            </Text>
          ) : null}

          {/*
            EVERY ACTION BELOW IS ITS OWN BLOCK WITH ITS OWN SPACING. The
            screen this replaces stacked "Send the email again" and "Back to
            Login" flush against each other, because both carried a style that
            set width and nothing else. Two buttons touching read as one
            control, and that invites the wrong tap.
          */}
          <View style={styles.secondaryBlock}>
            <Button
              title={resend.isPending ? 'Sending...' : 'Send a new code'}
              variant="outline"
              disabled={resend.isPending}
              onPress={handleResend}
              accessibilityLabel="Send a new confirmation code"
              style={styles.secondaryButton}
            />
            {resent ? <Text style={styles.resentNote}>A new code is on its way.</Text> : null}
            {resend.isError ? (
              <Text style={styles.errorText}>
                {humanError(resend.error, 'Could not send it just now.')}
              </Text>
            ) : null}
          </View>

          <View style={styles.loginRow}>
            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back to login"
            >
              <Text style={styles.loginLink}>Back to login</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  form: {
    marginTop: spacing.xl,
  },
  primaryButton: {
    width: '100%',
    marginTop: spacing.xl,
  },
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  secondaryBlock: {
    // A full section gap, not a button gap: this is a different decision from
    // the one above it, and the two must not read as a pair of equals.
    marginTop: spacing.xxl,
  },
  secondaryButton: {
    width: '100%',
  },
  resentNote: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  loginRow: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  loginLink: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.primary,
  },
});
