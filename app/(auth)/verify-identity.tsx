import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Input, OnboardingStepFooter, OnboardingStepHeader } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useCompleteOnboarding } from '@/hooks';

// Lenient placeholder validation only — real per-council formats (Nursing &
// Midwifery Council, Medical & Dental Council, Pharmacy Council) still need
// to be defined. See docs/REPORT_NOTES.md.
function isLicenseFormatValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 4 && trimmed.length <= 20 && /^[A-Za-z0-9-]+$/.test(trimmed);
}

/**
 * Step 5/5 of volunteer onboarding (design-refs/ID Verification.png). Kept
 * as its own top-level (auth) route, not nested under onboarding/, since
 * it's also the natural re-entry point for a volunteer who chose "Complete
 * Later" and comes back to verify afterward.
 */
export default function VerifyIdentity() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const onboarding = useOnboardingStore();
  const completeOnboarding = useCompleteOnboarding();

  const [licenseNumber, setLicenseNumber] = useState(onboarding.licenseNumber);
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const licenseValid = isLicenseFormatValid(licenseNumber);
  const canVerifyNow = licenseValid && confirmed;
  const submitting = completeOnboarding.isPending;
  const errorMessage = validationError ?? completeOnboarding.error?.message ?? null;

  const progress = useMemo(() => {
    if (licenseValid && confirmed) return 1;
    if (licenseValid || confirmed) return 0.6;
    return 0.3;
  }, [licenseValid, confirmed]);

  async function persistAndFinish(options: { declarationSigned: boolean; licenseNumber: string | null }) {
    if (!user) {
      setValidationError('Your session expired. Please log in again.');
      return;
    }

    setValidationError(null);

    try {
      await completeOnboarding.mutateAsync({
        userId: user.id,
        region: onboarding.region,
        district: onboarding.district,
        category: onboarding.category,
        skillTags: onboarding.skillTags,
        specialties: onboarding.specialties,
        availabilitySlots: onboarding.availabilitySlots,
        licenseNumber: options.licenseNumber,
        declarationSigned: options.declarationSigned,
      });
    } catch {
      // Error surfaced via completeOnboarding.error above.
      return;
    }

    onboarding.reset();
    router.replace('/(auth)/onboarding/complete');
  }

  function handleSecureVerification() {
    if (!canVerifyNow) return;
    persistAndFinish({ declarationSigned: true, licenseNumber: licenseNumber.trim() });
  }

  function handleCompleteLater() {
    persistAndFinish({ declarationSigned: false, licenseNumber: null });
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <OnboardingStepHeader
          title="IDENTITY ASSURANCE"
          onBack={() => router.back()}
          trailing={<MaterialCommunityIcons name="shield-check-outline" size={20} color={colors.success} />}
        />

        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>SECURITY PROGRESS</Text>
          <Text style={styles.progressValue}>{Math.round(progress * 100)}% Complete</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        <View style={styles.hubCard}>
          <View style={styles.hubIcon}>
            <MaterialCommunityIcons name="shield-lock-outline" size={22} color={colors.white} />
          </View>
          <View style={styles.hubText}>
            <Text style={styles.hubTitle}>Security Hub</Text>
            <Text style={styles.hubBody}>
              We verify all credentials against{' '}
              <Text style={styles.hubHighlight}>Official Council Databases</Text> to ensure the
              integrity of the clinical network.
            </Text>
          </View>
        </View>

        <Text style={styles.heading}>Verify Professional ID</Text>
        <Text style={styles.subtext}>
          Please enter your credentials below. This is a one-time verification process required
          for clinical access.
        </Text>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardLabel}>License / Student ID</Text>
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredBadgeText}>REQUIRED</Text>
            </View>
          </View>
          <Input
            placeholder="e.g., NMC-1234567"
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            autoCapitalize="characters"
            autoCorrect={false}
            leadingIcon={<MaterialCommunityIcons name="briefcase-outline" size={20} color={colors.textSecondary} />}
            trailingElement={
              licenseValid ? (
                <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />
              ) : null
            }
          />
          <View style={styles.encryptedRow}>
            <MaterialCommunityIcons name="lock-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.encryptedText}>Information is encrypted and securely transmitted.</Text>
          </View>

          <Pressable
            onPress={() => setConfirmed((prev) => !prev)}
            style={styles.confirmRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
          >
            <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
              {confirmed ? <MaterialCommunityIcons name="check" size={14} color={colors.white} /> : null}
            </View>
            <Text style={styles.confirmText}>
              I confirm that all information provided is accurate and understand that
              misrepresentation may be reported to professional councils.
            </Text>
          </Pressable>
        </View>

        <View style={styles.warningBanner}>
          <MaterialCommunityIcons name="alert-outline" size={16} color={colors.warning} />
          <Text style={styles.warningText}>CLINICAL ROLES LOCKED UNTIL VERIFIED</Text>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Button
          title="Secure Verification"
          variant="solid"
          disabled={!canVerifyNow || submitting}
          onPress={handleSecureVerification}
          style={styles.verifyButton}
        />
        <Pressable onPress={handleCompleteLater} disabled={submitting} style={styles.completeLater}>
          <Text style={styles.completeLaterText}>Complete Later</Text>
        </Pressable>

        <OnboardingStepFooter step={5} total={5} section="Identity Assurance" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.base,
  },
  progressLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  progressValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.primary,
  },
  progressTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  hubCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  hubIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 107, 107, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubText: {
    flex: 1,
  },
  hubTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.white,
    marginBottom: 2,
  },
  hubBody: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.85)',
  },
  hubHighlight: {
    color: colors.primary,
    fontFamily: fontFamily.medium,
  },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  subtext: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  requiredBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  requiredBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.success,
  },
  encryptedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  encryptedText: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  checkbox: {
    width: 20,
    height: 20,
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
  confirmText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.base,
    justifyContent: 'center',
  },
  warningText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.warning,
  },
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  verifyButton: {
    width: '100%',
  },
  completeLater: {
    alignItems: 'center',
    marginTop: spacing.base,
  },
  completeLaterText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
  },
});
