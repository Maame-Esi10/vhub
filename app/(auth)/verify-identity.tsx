import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, ErrorAlert, OnboardingStepFooter, OnboardingStepHeader } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useCompleteOnboarding } from '@/hooks';
// Direct import, not the hooks barrel: this reaches expo-document-picker, a
// NATIVE module, and the barrel is imported by essentially every screen.
import { useCredentialUpload } from '@/hooks/useMediaUpload';
import { CREDENTIAL_CONSENT_POINTS } from '@/constants/credential-guidelines';

/**
 * Step 5/5 of volunteer onboarding (design-refs/ID Verification.png). Kept
 * as its own top-level (auth) route, not nested under onboarding/, since
 * it's also the natural re-entry point for a volunteer who chose "Complete
 * Later" and comes back to verify afterward.
 *
 * No license number field: Ghana has no public licensing-registry API
 * (Nursing & Midwifery Council, Medical & Dental Council, Pharmacy
 * Council), so a self-entered number would prove nothing. Verification is
 * document-based with human review instead
 * (volunteer_profiles.verification_status).
 *
 * THE DOCUMENT IS NOW UPLOADED HERE (owner-approved, 2026-09-21).
 *
 * /api/verification-document still refuses a document until
 * `declaration_signed` is true, because a credential attached to no
 * declaration is evidence nobody has vouched for, and the declaration is
 * written by this screen's submit. That has always been a constraint on the
 * ORDER OF TWO SERVER CALLS, and it was read as a constraint on the order of
 * two SCREENS -- so signing happened here and uploading happened somewhere
 * else, and the somewhere else was a Settings screen the volunteer was
 * deposited on at the end of registering.
 *
 * The owner's words: "after I have selected my document I should be directed
 * to the finished onboarding screen, not do the identification in the settings
 * then take me to the settings page. Is this how to welcome a new user?"
 *
 * So one screen: sign, consent, choose the file. The submit writes the
 * declaration first and uploads second, in that order, which is the whole of
 * what the API ever required.
 *
 * TWO TICKS, AND THEY ARE NOT THE SAME TICK. The owner asked why she had to
 * confirm twice. They were two genuinely different agreements shown on two
 * screens with nothing saying so: one is "what I have told you is true", the
 * other is "you may store this document". Both are still needed -- consent is
 * written in the same statement as the document, so it cannot be inferred from
 * the declaration -- but each now says which it is, next to the other, where
 * the difference is visible.
 */
export default function VerifyIdentity() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);
  const onboarding = useOnboardingStore();
  const completeOnboarding = useCompleteOnboarding();

  const [confirmed, setConfirmed] = useState(false);
  const [consented, setConsented] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const credentialUpload = useCredentialUpload();

  // Consent is asked once and remembered server-side; somebody who already
  // agreed on an earlier upload is not asked again.
  const consentRecorded = !!volunteerProfile?.document_consent_at;
  const consentReady = consented || consentRecorded;

  const submitting = completeOnboarding.isPending || credentialUpload.isPending;
  // No combined message: validation renders inline, and the two call
  // failures go to ErrorAlert. See the render below.
  const progress = useMemo(
    () => (confirmed && consentReady ? 1 : confirmed ? 0.65 : 0.3),
    [confirmed, consentReady]
  );

  async function persistAndFinish(options: {
    declarationSigned: boolean;
    /** Opens the file picker after the declaration is written. */
    uploadDocument: boolean;
  }) {
    if (!user) {
      setValidationError('Your session expired. Please log in again.');
      return;
    }

    // GUARD: this screen is a step of the onboarding wizard and submits the
    // whole wizard payload from useOnboardingStore. That store is reset()
    // once onboarding completes, so if a volunteer reaches this screen from
    // anywhere OUTSIDE the wizard, every field below is blank -- and
    // submitting would wipe their saved category, skills, specialties,
    // availability, region and district. The now-null category would then
    // make useAuthGuard force them back through the entire wizard.
    //
    // An empty store plus an already-set category on the saved profile is
    // exactly that situation, so refuse rather than destroy their data. The
    // real fix is a standalone re-verification screen that doesn't reuse the
    // wizard's submit path; until it exists, nothing should link here.
    if (onboarding.category === null && volunteerProfile?.category != null) {
      setValidationError(
        'Your profile is already set up. To manage your identity verification, go to Settings and open Identity Verification.'
      );
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
        declarationSigned: options.declarationSigned,
      });
    } catch {
      // Error surfaced via completeOnboarding.error above.
      return;
    }

    onboarding.reset();

    /*
      THE UPLOAD RUNS AFTER THE DECLARATION IS WRITTEN, on this same press.
      That ordering is the API's rule and the only reason these were ever two
      screens.

      Best-effort, deliberately: the profile is saved by this point, so a
      failed or cancelled upload must not fail onboarding. Cancelling the file
      picker is a normal thing to do and is not an error at all. The finished
      screen reads the profile and states plainly whether a document is on
      file, so an upload that did not happen is reported rather than assumed.
    */
    if (options.declarationSigned && options.uploadDocument) {
      try {
        await credentialUpload.mutateAsync({
          userId: user.id,
          consent: consentRecorded ? undefined : true,
        });
      } catch {
        // Surfaced by credentialUpload.error; the finished screen says what is
        // outstanding either way.
      }
    }

    router.replace('/(auth)/onboarding/complete');
  }

  function handleSecureVerification() {
    if (!confirmed || !consentReady) return;
    persistAndFinish({ declarationSigned: true, uploadDocument: true });
  }

  function handleCompleteLater() {
    persistAndFinish({ declarationSigned: false, uploadDocument: false });
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <OnboardingStepHeader
          title="IDENTITY ASSURANCE"
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/onboarding/availability'))}
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
              Credentials are verified by{' '}
              <Text style={styles.hubHighlight}>document review from our team</Text> to ensure
              the integrity of the clinical network.
            </Text>
          </View>
        </View>

        <Text style={styles.heading}>Verify Your Credentials</Text>
        <Text style={styles.subtext}>
          Sign the declaration below. You will upload your licence, certificate or council
          registration on the next screen. This is a one-time process and only clinical roles
          require it.
        </Text>

        {/*
          THE FAKE UPLOAD CARD IS GONE (owner, 2026-09-21: "why is the upload
          docx card/tab there if the docx selection is not going on?").

          It was a card headed "Credential Document" with a NEXT STEP badge, an
          upload tray icon and a dashed placeholder -- every visual signal of a
          file picker, on a control that could not pick a file and was never
          meant to. The document genuinely cannot be uploaded here, because
          /api/verification-document refuses one while `declaration_signed` is
          false and the declaration is written by this very submit. But the
          answer to "the upload cannot happen yet" is a SENTENCE saying so, not
          a disabled-looking uploader that invites a tap and answers nothing.

          The ordering constraint is now stated in one line above the
          declaration, which is all it ever needed.
        */}
        {/*
          TWO AGREEMENTS, SIDE BY SIDE, EACH SAYING WHICH IT IS.

          They used to sit on two different screens, which is why the owner
          asked why she had to confirm twice. They are not the same
          confirmation: one is about the truth of what she has entered, the
          other is permission to store a file. Shown together, with a heading
          each, the difference is visible in the half-second anybody actually
          gives it.
        */}
        <View style={styles.card}>
          <Text style={styles.stepLabel}>1. YOUR DECLARATION</Text>
          <Text style={styles.stepBody}>
            This says the details you have given are true. It has to be on file before any
            document can be attached to it.
          </Text>

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

        <View style={styles.card}>
          <Text style={styles.stepLabel}>2. YOUR DOCUMENT</Text>
          <Text style={styles.stepBody}>
            A photo or scan of your licence, certificate or council registration. This is a
            different agreement from the one above: it is your permission for VHub to store the
            file.
          </Text>

          {consentRecorded ? (
            <View style={styles.consentDone}>
              <MaterialCommunityIcons name="check-circle-outline" size={16} color={colors.success} />
              <Text style={styles.consentDoneText}>
                You have already agreed to how your documents are stored.
              </Text>
            </View>
          ) : (
            <>
              {/*
                The points are listed, not hidden behind an arrow. On the
                standalone screen they collapse because that screen is revisited;
                this one is seen once, by somebody handing over a photograph of
                their nursing licence, and they are entitled to read what happens
                to it at the moment they do it.
              */}
              {CREDENTIAL_CONSENT_POINTS.map((point) => (
                <View key={point} style={styles.consentPointRow}>
                  <View style={styles.consentBullet} />
                  <Text style={styles.consentPointText}>{point}</Text>
                </View>
              ))}

              <Pressable
                onPress={() => setConsented((prev) => !prev)}
                style={styles.confirmRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consented }}
              >
                <View style={[styles.checkbox, consented && styles.checkboxChecked]}>
                  {consented ? (
                    <MaterialCommunityIcons name="check" size={14} color={colors.white} />
                  ) : null}
                </View>
                <Text style={styles.confirmText}>
                  I agree to VHub storing my document for verification.
                </Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.warningBanner}>
          <MaterialCommunityIcons name="alert-outline" size={16} color={colors.warning} />
          <Text style={styles.warningText}>CLINICAL ROLES LOCKED UNTIL VERIFIED</Text>
        </View>

        {validationError ? <Text style={styles.errorText}>{validationError}</Text> : null}
        {/* The onboarding submit and the credential upload are two calls on
            one press, so either can fail. Both are popups; the tick-the-boxes
            validation above them stays inline. */}
        <ErrorAlert
          error={completeOnboarding.error ?? credentialUpload.error}
          fallback="Could not finish setting up your profile. Please try again."
        />

        <Button
          title={submitting ? 'Saving...' : 'Sign and choose my document'}
          variant="solid"
          disabled={!confirmed || !consentReady || submitting}
          onPress={handleSecureVerification}
          style={styles.verifyButton}
        />
        <Pressable onPress={handleCompleteLater} disabled={submitting} style={styles.completeLater}>
          <Text style={styles.completeLaterText}>Skip for now</Text>
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
  stepLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.primary,
  },
  stepBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.base,
  },
  consentDone: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  consentDoneText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  consentPointRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  consentBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 7,
  },
  consentPointText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  // "30% COMPLET", with the final letter clipped off, came from here: two
  // text nodes in a space-between row with nothing telling either what to do
  // when they no longer fit. At a large system font they do not fit, and a
  // flex item that cannot shrink any further is simply cut off at the
  // container edge. Wrapping lets the value drop to its own line instead, and
  // the shrink floors stop either one being squeezed to nothing first.
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',

    // alignItems centres children within their line; alignContent places
    // the line itself, and defaults to flex-start. Without it a wrapping row
    // pins its single line to the TOP of the box.
    alignContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.base,
  },
  progressLabel: {
    flexShrink: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  progressValue: {
    flexShrink: 0,
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
  // Tinted rather than grey: this now describes something that happens next
  // rather than something that does not exist.
  nextStepBadge: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  nextStepBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.primary,
  },
  uploadPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.base,
  },
  uploadPlaceholderText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    textAlign: 'center',
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
