import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { KEYBOARD_AVOID_BEHAVIOR } from '@/constants/keyboard';
import { Text } from '@/components/ui/Text';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, ErrorAlert, Input } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useRequestPasswordReset } from '@/hooks';

/**
 * "Reset Password" — design-refs/Forgot Password.png.
 *
 * The layout is the design's: back arrow, wordmark, an illustration panel, the
 * title and subtitle, one email field, the dark action button, and "Back to
 * login". Two things differ from the picture and both are explained here
 * rather than left to be spotted.
 *
 * FIRST, the word "link" is "code". The recovery email carries a six-digit
 * code that is typed on the next screen, because a link would have to reopen
 * the app through a deep link and hand it session tokens out of a URL — new
 * plumbing whose failure modes all sit in places we cannot see (a scheme that
 * differs between the dev client and a real build, Android mail clients that
 * treat custom schemes inconsistently). The reasoning is in
 * hooks/usePasswordReset.ts.
 *
 * SECOND, the illustration is drawn rather than dropped in. The design's
 * artwork is not among the exported assets, and inventing a stock illustration
 * would put a look in the app that exists nowhere else in it. This is the same
 * treatment the no-flyer outreach banner already uses: the panel's own tinted
 * ground, two off-edge discs, and one icon from the family every other screen
 * draws from.
 */
export default function ForgotPassword() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requestReset = useRequestPasswordReset();

  const [email, setEmail] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSend = useCallback(() => {
    setValidationError(null);
    const trimmed = email.trim();

    if (!trimmed) {
      setValidationError('Please enter the email address for your account.');
      return;
    }

    requestReset.mutate(trimmed, {
      onSuccess: () => {
        // Straight on to the code screen, carrying the address so the next
        // screen does not have to ask for it twice. Nothing here reveals
        // whether that address has an account — see useRequestPasswordReset.
        router.push({ pathname: '/(auth)/reset-password', params: { email: trimmed } });
      },
    });
  }, [email, requestReset, router]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(auth)/login');
  }, [router]);

  const submitting = requestReset.isPending;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={KEYBOARD_AVOID_BEHAVIOR}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            // Bottom inset as well as top: without it the last row of the form
            // sits under the phone's gesture bar on some handsets and not
            // others, which reads as a layout that only works on one device.
            { paddingTop: insets.top + spacing.base, paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <Pressable
              onPress={goBack}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={styles.backButton}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.wordmark}>VHub</Text>
            {/* Balances the back button so the wordmark sits centred. */}
            <View style={styles.backButton} />
          </View>

          <View style={styles.illustration}>
            <View style={[styles.disc, styles.discLeft]} />
            <View style={[styles.disc, styles.discRight]} />
            <View style={styles.illustrationBadge}>
              <MaterialCommunityIcons name="lock-reset" size={44} color={colors.primary} />
            </View>
          </View>

          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email and we will send you a six-digit code to set a new password.
          </Text>

          <View style={styles.form}>
            <Input
              label="Email Address"
              placeholder="example@v-hub.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              accessibilityLabel="Email address"
              leadingIcon={
                <MaterialCommunityIcons name="email-outline" size={20} color={colors.textSecondary} />
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
                title="Send Reset Code"
                variant="solid"
                onPress={handleSend}
                accessibilityLabel="Send reset code"
                style={styles.actionButton}
              />
            )}
            {validationError ? (
              <Text style={styles.errorText}>{validationError}</Text>
            ) : null}
            <ErrorAlert
              error={requestReset.error}
              fallback="Could not send the reset code. Please try again."
            />
          </View>

          <View style={styles.backRow}>
            <Pressable
              onPress={goBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back to login"
            >
              <Text style={styles.backLink}>Back to login</Text>
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
    // Zero, not 0.5: the half point was left over from the all-caps wordmark.
    letterSpacing: 0,
  },
  illustration: {
    height: 200,
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  disc: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
  },
  discLeft: {
    left: -70,
    top: -40,
  },
  discRight: {
    right: -70,
    bottom: -50,
  },
  illustrationBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
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
  backRow: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  backLink: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.primary,
  },
});
