import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { Button, Input , PasswordRequirements } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { getLogoSize } from '@/constants/logoSizes';
import { ORG_TYPES, OrgType } from '@/constants/org-types';
import { useResendConfirmation, useSignUp } from '@/hooks';
import { humanError, humanErrorOrNull } from '@/lib/errorMessage';
import { describePasswordProblem } from '@/lib/password';


type RegisterRole = 'volunteer' | 'organisation';

function resolveRole(param: string | undefined): RegisterRole {
  return param === 'organisation' ? 'organisation' : 'volunteer';
}

export default function Register() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const logoSize = getLogoSize('medium', width);
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const role = useMemo(() => resolveRole(roleParam), [roleParam]);
  const signUp = useSignUp();
  const resendConfirmation = useResendConfirmation();

  // Shared fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  // Volunteer fields
  const [fullName, setFullName] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Organisation fields
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<OrgType | null>(null);
  const [orgTypePickerVisible, setOrgTypePickerVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');

  const handleTogglePassword = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const goToLogin = useCallback(() => {
    router.push('/(auth)/login');
  }, [router]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/welcome');
    }
  }, [router]);

  const orgTypeLabel = orgType
    ? ORG_TYPES.find((option) => option.value === orgType)?.label ?? null
    : null;

  const validate = useCallback((): boolean => {
    const nextFieldErrors: Record<string, string> = {};

    if (role === 'volunteer') {
      if (!fullName.trim()) {
        nextFieldErrors.fullName = 'Please enter your full name.';
      }
    } else {
      if (!orgName.trim()) {
        nextFieldErrors.orgName = 'Please enter your organisation name.';
      }
    }

    if (!email.trim()) {
      nextFieldErrors.email = 'Please enter your email address.';
    }

    /*
      THE SHARED RULE, not a second opinion. This was `password.length < 6`,
      which meant the app demanded 8 characters to CHANGE a password and 6 to
      choose one in the first place — the wrong way round, and neither number
      was ever mentioned to the person typing. See lib/password.ts.
    */
    const passwordProblem = describePasswordProblem(password);
    if (passwordProblem) {
      nextFieldErrors.password = passwordProblem;
    }

    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      return false;
    }

    if (role === 'volunteer' && !agreedToTerms) {
      setValidationError('Please agree to the Terms of Service and Privacy Policy to continue.');
      return false;
    }

    return true;
  }, [role, fullName, orgName, email, password, agreedToTerms]);

  const handleSubmit = useCallback(async () => {
    setValidationError(null);

    if (!validate()) {
      return;
    }

    try {
      const result = await signUp.mutateAsync(
        role === 'volunteer'
          ? { role: 'volunteer', email: email.trim(), password, fullName }
          : { role: 'organisation', email: email.trim(), password, orgName, orgType, description, website }
      );

      if (result.status === 'confirmationRequired') {
        setAwaitingConfirmation(true);
        return;
      }

      router.replace(result.role === 'volunteer' ? '/(auth)/onboarding' : '/(organisation)/dashboard');
    } catch {
      // Error surfaced via signUp.error below.
    }
  }, [validate, signUp, role, email, password, fullName, orgName, orgType, description, website, router]);

  const submitting = signUp.isPending;
  const errorMessage = validationError ?? humanErrorOrNull(signUp.error) ?? null;

  const headerTitle = role === 'volunteer' ? 'Volunteer Registration' : 'Organization Registration';

  if (awaitingConfirmation) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={[styles.brandStrip, { paddingTop: insets.top + spacing.sm }]}>
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: logoSize, height: logoSize }}
            resizeMode="contain"
          />
        </View>
        <View style={[styles.header, { paddingTop: spacing.sm }]}>
          <Pressable
            onPress={goBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backButton}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.confirmationContent}>
          <View style={styles.confirmationIcon}>
            <MaterialCommunityIcons name="email-check-outline" size={40} color={colors.primary} />
          </View>
          <Text style={styles.confirmationTitle}>Check your email</Text>
          <Text style={styles.confirmationBody}>
            We sent a confirmation link to {email.trim()}. Verify your address, then log in to
            finish setting up your account.
          </Text>
          {/* The confirmation email is the most spam-prone message V-HUB sends: it goes
              to somebody who has never heard from the sender, and it contains a link.
              Since delivery moved to a Gmail account rather than a branded domain
              (2026-09-01), the filter risk is real enough to name here. Same wording as
              the reset-password screen, deliberately. */}
          <Text style={styles.confirmationHint}>
            Nothing arrived? Check your spam folder first.
          </Text>
          {/*
            THIS SCREEN USED TO BE A DEAD END. An unconfirmed address cannot log
            in, and Supabase refuses a second registration for an address it
            already holds — so if the email did not arrive there was no way
            forward from inside the app and no way back into the account. One
            button is the whole fix.
          */}
          <Button
            title={
              resendConfirmation.isSuccess
                ? 'Sent — check your inbox again'
                : resendConfirmation.isPending
                  ? 'Sending...'
                  : 'Send the email again'
            }
            variant="outline"
            disabled={resendConfirmation.isPending || resendConfirmation.isSuccess}
            onPress={() => resendConfirmation.mutate(email)}
            accessibilityLabel="Send the confirmation email again"
            style={styles.confirmationButton}
          />
          {resendConfirmation.isError ? (
            <Text style={styles.errorText}>
              {humanError(resendConfirmation.error, 'Could not send it just now.')}
            </Text>
          ) : null}
          <Button
            title="Back to Login"
            variant="solid"
            onPress={goToLogin}
            accessibilityLabel="Back to login"
            style={styles.confirmationButton}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={KEYBOARD_AVOID_BEHAVIOR}
      >
        <ScrollView
          /*
            THE BOTTOM INSET, WHICH WAS MISSING ENTIRELY.

            This is why "Already have an account? Log in" was visible on one
            phone and not the other. It is the last thing in the scroll view,
            and the content stopped 24dp from the bottom of the WINDOW — but on
            a phone using gesture navigation the bottom 24-48dp of the window
            is underneath the system gesture bar. On a handset with three-button
            navigation, or a smaller inset, the same 24dp was enough and the row
            showed. Nothing about the row itself was ever wrong.
          */
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.brandStrip, { paddingTop: insets.top + spacing.sm }]}>
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: logoSize, height: logoSize }}
            resizeMode="contain"
          />
        </View>
        <View style={[styles.header, { paddingTop: spacing.sm }]}>
            <Pressable
              onPress={goBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={styles.backButton}
            >
              <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            <View style={styles.backButton} />
          </View>

          <View style={styles.body}>
            {role === 'volunteer' ? (
              <>
                <Text style={styles.title}>Create your account</Text>
                <Text style={styles.subtitle}>
                  Enter your account details to get started with V-HUB and join our healthcare
                  mission.
                </Text>

                <View style={styles.form}>
                  <Input
                    label="Full Name"
                    placeholder="John Doe"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    textContentType="name"
                    accessibilityLabel="Full name"
                    error={fieldErrors.fullName}
                    leadingIcon={
                      <MaterialCommunityIcons
                        name="account-outline"
                        size={20}
                        color={colors.textSecondary}
                      />
                    }
                  />

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
                    error={fieldErrors.email}
                    leadingIcon={
                      <MaterialCommunityIcons
                        name="email-outline"
                        size={20}
                        color={colors.textSecondary}
                      />
                    }
                  />

                  <Input
                    label="Password"
                    placeholder="Enter your password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    accessibilityLabel="Password"
                    error={fieldErrors.password}
                    leadingIcon={
                      <MaterialCommunityIcons
                        name="lock-outline"
                        size={20}
                        color={colors.textSecondary}
                      />
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
                  {/*
                    Live, as they type. The rules that tick here are the same
                    ones validate() enforces, imported from lib/password.ts, so
                    the checklist can never promise something the form rejects.
                  */}
                  <PasswordRequirements value={password} />
                </View>

                <Pressable
                  onPress={() => setAgreedToTerms((prev) => !prev)}
                  style={styles.termsRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: agreedToTerms }}
                  accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
                  hitSlop={4}
                >
                  <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
                    {agreedToTerms ? (
                      <MaterialCommunityIcons name="check" size={14} color={colors.white} />
                    ) : null}
                  </View>
                  <Text style={styles.termsText}>
                    I agree to the{' '}
                    <Text style={styles.termsLink} onPress={() => {}}>
                      Terms of Service
                    </Text>{' '}
                    and{' '}
                    <Text style={styles.termsLink} onPress={() => {}}>
                      Privacy Policy
                    </Text>
                    .
                  </Text>
                </Pressable>

                <View style={styles.ctaBlock}>
                  {submitting ? (
                    <View style={[styles.submitButton, styles.submitButtonLoading]}>
                      <ActivityIndicator color={colors.white} />
                    </View>
                  ) : (
                    <Button
                      title="Register"
                      variant="solid"
                      onPress={handleSubmit}
                      accessibilityLabel="Register"
                      disabled={!agreedToTerms}
                      style={styles.submitButton}
                    />
                  )}
                  {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.title}>Join V-HUB</Text>
                <Text style={styles.subtitle}>
                  Register your organization to start making an impact in the community.
                </Text>

                <View style={styles.form}>
                  <Input
                    label="Organization Name"
                    placeholder="Enter legal name"
                    value={orgName}
                    onChangeText={setOrgName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    accessibilityLabel="Organization name"
                    error={fieldErrors.orgName}
                    leadingIcon={
                      <MaterialCommunityIcons
                        name="office-building-outline"
                        size={20}
                        color={colors.textSecondary}
                      />
                    }
                  />

                  <View style={styles.selectWrapper}>
                    <Text style={styles.label}>Organization Type</Text>
                    <Pressable
                      onPress={() => setOrgTypePickerVisible(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Select organization type"
                      style={styles.selectField}
                    >
                      <MaterialCommunityIcons
                        name="domain"
                        size={20}
                        color={colors.textSecondary}
                        style={styles.selectLeadingIcon}
                      />
                      <Text
                        style={[styles.selectText, !orgTypeLabel && styles.selectPlaceholder]}
                      >
                        {orgTypeLabel ?? 'Select type'}
                      </Text>
                      <MaterialCommunityIcons
                        name="chevron-down"
                        size={20}
                        color={colors.textSecondary}
                      />
                    </Pressable>
                  </View>

                  <Input
                    label="Email Address"
                    placeholder="org@example.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="emailAddress"
                    accessibilityLabel="Email address"
                    error={fieldErrors.email}
                    leadingIcon={
                      <MaterialCommunityIcons
                        name="email-outline"
                        size={20}
                        color={colors.textSecondary}
                      />
                    }
                  />

                  <Input
                    label="Password"
                    placeholder="Enter your password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    accessibilityLabel="Password"
                    error={fieldErrors.password}
                    leadingIcon={
                      <MaterialCommunityIcons
                        name="lock-outline"
                        size={20}
                        color={colors.textSecondary}
                      />
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
                  {/*
                    Live, as they type. The rules that tick here are the same
                    ones validate() enforces, imported from lib/password.ts, so
                    the checklist can never promise something the form rejects.
                  */}
                  <PasswordRequirements value={password} />

                  <Input
                    label="Description"
                    placeholder="Briefly describe your organisation's mission (optional)"
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={4}
                    accessibilityLabel="Organisation description"
                    leadingIcon={
                      <MaterialCommunityIcons
                        name="text-long"
                        size={20}
                        color={colors.textSecondary}
                      />
                    }
                  />

                  <Input
                    label="Website"
                    placeholder="https://yourorganisation.org (optional)"
                    value={website}
                    onChangeText={setWebsite}
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Organisation website"
                    leadingIcon={
                      <MaterialCommunityIcons
                        name="web"
                        size={20}
                        color={colors.textSecondary}
                      />
                    }
                  />
                </View>

                <View style={styles.ctaBlock}>
                  {submitting ? (
                    <View style={[styles.submitButton, styles.submitButtonLoading]}>
                      <ActivityIndicator color={colors.white} />
                    </View>
                  ) : (
                    <Button
                      title="Create Account"
                      variant="solid"
                      onPress={handleSubmit}
                      accessibilityLabel="Create account"
                      style={styles.submitButton}
                    />
                  )}
                  {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                </View>
              </>
            )}

            {/*
              THE WHOLE LINE IS THE CONTROL, and it is meant to be seen.

              It was a grey 14px sentence with only the last two words
              tappable, sitting flush under the submit button — the owner's
              report was that she could barely find it. For a returning user
              this is the most important thing on the screen, and it was the
              quietest. It now has a rule above it separating it from the form,
              real vertical room, near-black lead-in text and a link at the
              same weight as a button label; the tap target is the entire row
              rather than two words at the end of it.
            */}
            <Pressable
              onPress={goToLogin}
              accessibilityRole="button"
              accessibilityLabel="Already have an account? Log in"
              style={({ pressed }) => [styles.loginRow, pressed && styles.loginRowPressed]}
            >
              <Text style={styles.loginText}>Already have an account?</Text>
              <Text style={styles.loginLink}>Log in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={orgTypePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOrgTypePickerVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setOrgTypePickerVisible(false)}
          accessibilityLabel="Close organization type picker"
        >
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Organization Type</Text>
            {ORG_TYPES.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => {
                  setOrgType(option.value);
                  setOrgTypePickerVisible(false);
                }}
                style={styles.modalOption}
                accessibilityRole="button"
                accessibilityLabel={option.label}
              >
                <Text style={styles.modalOptionText}>{option.label}</Text>
                {orgType === option.value ? (
                  <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
                ) : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    width: '100%',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
  brandStrip: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  body: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.lg,
  },
  selectWrapper: {
    width: '100%',
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.base,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  selectLeadingIcon: {
    marginRight: spacing.sm,
  },
  selectText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  selectPlaceholder: {
    color: colors.textSecondary,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  termsText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  termsLink: {
    color: colors.primary,
    fontFamily: fontFamily.medium,
  },
  ctaBlock: {
    marginTop: spacing.xl,
  },
  submitButton: {
    width: '100%',
  },
  submitButtonLoading: {
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
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    // Wraps at a large font size instead of squeezing two sentences onto one
    // line that is not wide enough for either.
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  loginRowPressed: {
    opacity: 0.6,
  },
  loginText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  loginLink: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.primary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 11, 15, 0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalOptionText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  confirmationContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  confirmationIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  confirmationTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  confirmationBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  confirmationHint: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  confirmationButton: {
    width: '100%',
  },
});
