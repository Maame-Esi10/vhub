import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, ScreenHeader } from '@/components/ui';
import { useSignDeclaration } from '@/hooks/useSignDeclaration';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

/**
 * Standalone identity-verification status, reached from Settings.
 *
 * THIS IS NOT app/(auth)/verify-identity.tsx. That screen is step 5 of the
 * onboarding wizard: it submits the whole wizard payload from
 * useOnboardingStore, which is empty outside that flow, so reaching it from
 * Settings would blank a volunteer's saved category, skills, specialties and
 * availability — and the now-null category would then force them back through
 * the entire wizard. That hazard is why the Settings row was read-only, and
 * this screen is the fix it asked for: it shares no submit path with the
 * wizard and writes exactly one column.
 *
 * WHAT IT CANNOT DO, and why. It cannot move `verification_status` to
 * 'documents_pending'. That column is deliberately absent from
 * volunteer_profiles' UPDATE grant list, because a client able to set its own
 * status to 'verified' would defeat the clinical-role gate that reads it.
 * Advancing the status is service-role work, performed by whoever reviews the
 * documents. And there are no documents yet — credential upload waits on
 * Cloudinary (see docs/REPORT_NOTES.md), so a button claiming to "submit
 * documents" would move a status that means "documents received" on the
 * strength of nothing at all. The screen says so plainly instead.
 */

const STATUS_PRESENTATION = {
  verified: {
    icon: 'shield-check' as const,
    fg: colors.success,
    bg: 'rgba(34, 197, 94, 0.12)',
    label: 'Verified',
    detail: 'You can apply to clinical outreaches as well as support roles.',
  },
  documents_pending: {
    // shield-half-full, not a clock variant: MaterialCommunityIcons has no
    // shield-clock, and a half-filled shield reads as "part way" anyway.
    icon: 'shield-half-full' as const,
    fg: colors.warning,
    bg: 'rgba(245, 158, 11, 0.12)',
    label: 'In review',
    detail: 'Your documents are with the V-HUB team. We will let you know the outcome.',
  },
  unverified: {
    icon: 'shield-alert-outline' as const,
    fg: colors.textSecondary,
    bg: colors.surface,
    label: 'Not verified',
    detail: 'You can browse everything and join support-role outreaches right now.',
  },
};

export default function VolunteerVerifyIdentity() {
  const user = useAuthStore((state) => state.user);
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);
  const signDeclaration = useSignDeclaration();
  const [confirmed, setConfirmed] = useState(false);

  const status = volunteerProfile?.verification_status ?? 'unverified';
  const presentation = STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.unverified;
  const declarationSigned = volunteerProfile?.declaration_signed === true;

  function handleSign() {
    if (!user || !confirmed) return;
    signDeclaration.mutate(user.id);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Identity Verification" fallback="/(volunteer)/settings" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.statusCard, { backgroundColor: presentation.bg }]}>
          <MaterialCommunityIcons name={presentation.icon} size={28} color={presentation.fg} />
          <View style={styles.statusText}>
            <Text style={styles.statusLabel}>{presentation.label}</Text>
            <Text style={styles.statusDetail}>{presentation.detail}</Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>What verification unlocks</Text>
        <Text style={styles.body}>
          Full Applications to clinical outreaches. Support-role events never require it, so an
          unverified account is still a fully usable one.
        </Text>

        <Text style={styles.sectionHeading}>Your declaration</Text>
        {declarationSigned ? (
          <View style={styles.signedRow}>
            <MaterialCommunityIcons name="check-circle" size={18} color={colors.success} />
            <Text style={styles.signedText}>
              You have signed the accuracy declaration. There is nothing further to do here.
            </Text>
          </View>
        ) : (
          <>
            <Pressable
              onPress={() => setConfirmed((prev) => !prev)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmed }}
              style={styles.confirmRow}
            >
              <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
                {confirmed ? (
                  <MaterialCommunityIcons name="check" size={14} color={colors.white} />
                ) : null}
              </View>
              <Text style={styles.confirmText}>
                I confirm that all information provided is accurate and understand that
                misrepresentation may be reported to professional councils.
              </Text>
            </Pressable>

            {signDeclaration.error ? (
              <Text style={styles.errorText}>{signDeclaration.error.message}</Text>
            ) : null}

            <Button
              title={signDeclaration.isPending ? 'Saving...' : 'Sign declaration'}
              variant="solid"
              disabled={!confirmed || signDeclaration.isPending}
              onPress={handleSign}
              style={styles.signButton}
            />
          </>
        )}

        <Text style={styles.sectionHeading}>Credential documents</Text>
        <View style={styles.pendingCard}>
          <MaterialCommunityIcons name="tray-arrow-up" size={20} color={colors.textSecondary} />
          <Text style={styles.pendingText}>
            Document upload is not available yet. When it opens you will be able to submit a
            credential here, and the V-HUB team reviews it manually — Ghana has no public
            licensing-registry API, so a self-entered licence number would prove nothing.
          </Text>
        </View>
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
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  statusText: {
    flex: 1,
    gap: spacing.xs,
  },
  statusLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  statusDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  sectionHeading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  signedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  signedText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
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
    lineHeight: 18,
    color: colors.textSecondary,
  },
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  signButton: {
    width: '100%',
    marginTop: spacing.base,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  pendingText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
});
