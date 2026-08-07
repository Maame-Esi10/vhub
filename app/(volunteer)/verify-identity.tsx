import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, ConfirmDialog, ScreenHeader } from '@/components/ui';
import { useSignDeclaration } from '@/hooks/useSignDeclaration';
// Imported from its own module, never the hooks barrel: useMediaUpload pulls in
// the native picker modules, and a barrel import would drag them into every
// screen that imports any hook. See the note in lib/cloudinary.ts.
import { useCredentialUpload, useDeleteCredential } from '@/hooks/useMediaUpload';
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
  const credentialUpload = useCredentialUpload();
  const deleteCredential = useDeleteCredential();
  const [confirmed, setConfirmed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const documentUrl = volunteerProfile?.credential_document_url ?? null;
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

        <Text style={styles.sectionHeading}>Credential document</Text>
        {status === 'unverified' ? (
          <>
            <Text style={styles.body}>
              Upload your licence, degree certificate or council registration as a PDF or photo.
              A person on the V-HUB team reviews it — Ghana has no public licensing-registry API,
              so a self-entered licence number would prove nothing.
            </Text>

            {!declarationSigned ? (
              <Text style={styles.gateNote}>Sign the declaration above first.</Text>
            ) : null}

            {credentialUpload.error ? (
              <Text style={styles.errorText}>{credentialUpload.error.message}</Text>
            ) : null}

            <Button
              title={credentialUpload.isPending ? 'Uploading...' : 'Choose a document'}
              variant="solid"
              disabled={!declarationSigned || credentialUpload.isPending}
              onPress={() => user && credentialUpload.mutate(user.id)}
              style={styles.signButton}
            />
          </>
        ) : (
          <>
            <View style={styles.signedRow}>
              <MaterialCommunityIcons
                name={status === 'verified' ? 'check-circle' : 'file-check-outline'}
                size={18}
                color={status === 'verified' ? colors.success : colors.warning}
              />
              <Text style={styles.signedText}>
                {status === 'verified'
                  ? 'Your credential has been reviewed and accepted.'
                  : 'Your document has been received and is waiting on review.'}
              </Text>
            </View>

            {/*
              The document itself, which used to be invisible the moment it was
              uploaded: a volunteer could not check WHICH file they had sent,
              could not swap a wrong one, and could not take it back. That last
              one matters most — this is an identity document, and being unable
              to withdraw your own is the wrong default.
            */}
            {documentUrl ? (
              <DocumentPreview
                url={documentUrl}
                // A verified volunteer keeps the view and loses the controls:
                // the document is the evidence behind an approval a human
                // already made, so it cannot be swapped or withdrawn from here.
                canManage={status !== 'verified'}
                isReplacing={credentialUpload.isPending}
                isDeleting={deleteCredential.isPending}
                onReplace={() => user && credentialUpload.mutate(user.id)}
                onDelete={() => setConfirmingDelete(true)}
              />
            ) : null}

            {credentialUpload.error ? (
              <Text style={styles.errorText}>{credentialUpload.error.message}</Text>
            ) : null}
            {deleteCredential.error ? (
              <Text style={styles.errorText}>{deleteCredential.error.message}</Text>
            ) : null}
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={confirmingDelete}
        icon="file-remove-outline"
        tone="destructive"
        title="Remove this document?"
        message="Your verification goes back to Not verified and the file is deleted, so nobody at V-HUB can read it. You can upload a different one whenever you like."
        confirmLabel="Remove document"
        cancelLabel="Keep it"
        busy={deleteCredential.isPending}
        onConfirm={() => {
          setConfirmingDelete(false);
          if (user) deleteCredential.mutate(user.id);
        }}
        onCancel={() => setConfirmingDelete(false)}
      />
    </SafeAreaView>
  );
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.gif'];

/** True when the stored URL points at something React Native can render inline. */
function isImageDocument(url: string): boolean {
  const path = url.split('?')[0]?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

interface DocumentPreviewProps {
  url: string;
  canManage: boolean;
  isReplacing: boolean;
  isDeleting: boolean;
  onReplace: () => void;
  onDelete: () => void;
}

/**
 * The uploaded document, with the two controls that were missing.
 *
 * A PDF cannot be rendered inline without a viewer dependency, and adding one
 * would cost a native rebuild for a screen most volunteers visit once — so a
 * non-image opens in the phone's own browser instead. An image is shown
 * directly, since that is the common case (people photograph certificates) and
 * it answers "did I send the right file?" without leaving the app.
 */
function DocumentPreview({
  url,
  canManage,
  isReplacing,
  isDeleting,
  onReplace,
  onDelete,
}: DocumentPreviewProps) {
  const isImage = isImageDocument(url);
  const busy = isReplacing || isDeleting;

  return (
    <View style={styles.documentCard}>
      {isImage ? (
        <Pressable
          onPress={() => void Linking.openURL(url)}
          accessibilityRole="imagebutton"
          accessibilityLabel="Open your credential document full size"
        >
          <Image source={{ uri: url }} style={styles.documentImage} resizeMode="cover" />
        </Pressable>
      ) : (
        <Pressable
          onPress={() => void Linking.openURL(url)}
          accessibilityRole="button"
          accessibilityLabel="Open your credential document"
          style={({ pressed }) => [styles.documentFileRow, pressed && styles.documentPressed]}
        >
          <MaterialCommunityIcons name="file-document-outline" size={24} color={colors.primary} />
          <View style={styles.documentFileText}>
            <Text style={styles.documentFileTitle}>Your document</Text>
            <Text style={styles.documentFileHint}>Tap to open it</Text>
          </View>
          <MaterialCommunityIcons name="open-in-new" size={18} color={colors.textSecondary} />
        </Pressable>
      )}

      {canManage ? (
        <View style={styles.documentActions}>
          <Button
            title={isReplacing ? 'Uploading...' : 'Replace'}
            variant="outline"
            disabled={busy}
            onPress={onReplace}
            style={styles.documentAction}
          />
          <Button
            title={isDeleting ? 'Removing...' : 'Remove'}
            variant="outline"
            disabled={busy}
            onPress={onDelete}
            style={styles.documentAction}
            textStyle={styles.documentDeleteLabel}
          />
        </View>
      ) : (
        <Text style={styles.documentLockedNote}>
          Your document is locked now that you are verified. Contact V-HUB if it needs updating.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  documentCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.md,
    marginTop: spacing.base,
    gap: spacing.md,
  },
  documentImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  documentFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
  },
  documentPressed: {
    opacity: 0.8,
  },
  documentFileText: {
    flex: 1,
  },
  documentFileTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  documentFileHint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  documentActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  documentAction: {
    flex: 1,
  },
  documentDeleteLabel: {
    color: colors.danger,
  },
  documentLockedNote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
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
  gateNote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.warning,
    marginTop: spacing.sm,
  },
});
