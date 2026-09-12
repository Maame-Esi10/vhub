import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Input } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { getLogoSize } from '@/constants/logoSizes';
import { useSignIn } from '@/hooks';
import { humanErrorOrNull } from '@/lib/errorMessage';

// The circular badge backdrop is sized relative to the logo so their ratio
// (badge slightly larger, framing the mark) stays consistent as the logo
// itself scales with screen width.
const BADGE_TO_LOGO_RATIO = 64 / 36;

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const logoSize = getLogoSize('medium', width);
  const badgeSize = logoSize * BADGE_TO_LOGO_RATIO;
  const signIn = useSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleTogglePassword = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const handleLogin = useCallback(() => {
    setValidationError(null);

    if (!email.trim() || !password) {
      setValidationError('Please enter both your email and password.');
      return;
    }

    signIn.mutate({ email: email.trim(), password });
    // On success, app/_layout.tsx's auth guard detects the new session and
    // redirects to the correct tab group automatically.
  }, [email, password, signIn]);

  const submitting = signIn.isPending;
  const errorMessage = validationError ?? humanErrorOrNull(signIn.error) ?? null;

  const handleForgotPassword = useCallback(() => {
    // Was an intentional no-op for the whole of Phase 1: somebody who forgot
    // their password had no route back into their account at all. The flow is
    // now app/(auth)/forgot-password.tsx -> reset-password.tsx.
    router.push('/(auth)/forgot-password');
  }, [router]);

  const goToWelcome = useCallback(() => {
    router.push('/(auth)/welcome');
  }, [router]);

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
            { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandBlock}>
            <View style={[styles.badge, { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 }]}>
              <Image
                source={require('../../assets/logo.png')}
                style={{ width: logoSize, height: logoSize }}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.wordmark}>V-HUB</Text>
            <Text style={styles.tagline}>Virtual Health Unified Bridge</Text>
          </View>

          <Text style={styles.title}>Welcome back</Text>

          <View style={styles.form}>
            <Input
              label="Email Address"
              placeholder="name@example.com"
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

            <View style={styles.passwordLabelRow}>
              <Text style={styles.label}>Password</Text>
              <Pressable
                onPress={handleForgotPassword}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
              >
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </Pressable>
            </View>
            <Input
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              accessibilityLabel="Password"
              leadingIcon={
                <MaterialCommunityIcons name="lock-outline" size={20} color={colors.textSecondary} />
              }
              trailingElement={
                <Pressable
                  onPress={handleTogglePassword}
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
          </View>

          <View style={styles.ctaBlock}>
            {submitting ? (
              <View style={[styles.loginButton, styles.loginButtonLoading]}>
                <ActivityIndicator color={colors.white} />
              </View>
            ) : (
              <Button
                title="Login"
                variant="solid"
                onPress={handleLogin}
                accessibilityLabel="Login"
                style={styles.loginButton}
              />
            )}
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>New to V-HUB? </Text>
            <Pressable
              onPress={goToWelcome}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Create an account"
            >
              <Text style={styles.signupLink}>Create an account</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <MaterialCommunityIcons name="shield-check-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.footerText}>SECURE MEDICAL PORTAL</Text>
      </View>
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
    paddingBottom: spacing.xl,
  },
  brandBlock: {
    alignItems: 'center',
  },
  badge: {
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  wordmark: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  tagline: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    color: colors.textPrimary,
    marginTop: spacing.xxl * 1.5,
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.lg,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  forgotText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
  },
  ctaBlock: {
    marginTop: spacing.xl,
  },
  loginButton: {
    width: '100%',
  },
  loginButtonLoading: {
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
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  signupText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  signupLink: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.primary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
  },
  footerText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
});
