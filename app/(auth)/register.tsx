import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Input } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { getLogoSize } from '@/constants/logoSizes';
import { ORG_TYPES, OrgType } from '@/constants/org-types';
import { useSignUp } from '@/hooks';

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

    if (!password || password.length < 6) {
      nextFieldErrors.password = 'Password must be at least 6 characters.';
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
  const errorMessage = validationError ?? signUp.error?.message ?? null;

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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
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

            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <Pressable
                onPress={goToLogin}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Log in"
              >
                <Text style={styles.loginLink}>Log in</Text>
              </Pressable>
            </View>
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
    marginTop: spacing.xl,
  },
  loginText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  loginLink: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
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
    marginBottom: spacing.xl,
  },
  confirmationButton: {
    width: '100%',
  },
});
