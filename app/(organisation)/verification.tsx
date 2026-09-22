import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { KEYBOARD_AVOID_BEHAVIOR } from '@/constants/keyboard';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Button,
  ErrorAlert,
  ErrorState,
  Input,
  ListSkeleton,
  ScreenHeader,
  Toast,
} from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { ORGANISATION_CONSENT_POINTS } from '@/constants/credential-guidelines';
import { useMyVerificationSubmission, useSubmitVerification } from '@/hooks';
import { useOrganisationDocumentUpload } from '@/hooks/useMediaUpload';
import { useAuthStore } from '@/stores/authStore';
import type { OrgVerificationState } from '@/types/database';
import { humanError } from '@/lib/errorMessage';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

/**
 * Where an organisation submits itself for verification.
 *
 * NO DESIGN EXISTS for this screen. It reuses the create-outreach wizard's
 * language: sectioned form, one card per group, the same Input and Button.
 *
 * Deliberately lightweight, per the brief — four contact facts, whatever
 * registration numbers the organisation actually holds, and the documents that
 * back them. No type-specific certificate rules and no external registry check:
 * Ghana has no public API to check a registration against, so this is evidence
 * for a human to read rather than a form to be validated into truth.
 */

const STATE_PRESENTATION: Record<
  OrgVerificationState,
  { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; tint: string; label: string; detail: string }
> = {
  unverified: {
    icon: 'shield-alert-outline',
    tint: colors.textSecondary,
    label: 'Not verified',
    detail:
      'You can prepare drafts, but an outreach cannot be published until VHub has verified your organisation.',
  },
  documents_submitted: {
    icon: 'clock-outline',
    tint: colors.warning,
    label: 'Waiting on review',
    detail: 'Your submission is with VHub. You will be notified as soon as it is decided.',
  },
  verified: {
    icon: 'shield-check',
    tint: colors.success,
    label: 'Verified',
    detail: 'Volunteers see the verified badge on your profile and on every outreach you publish.',
  },
  rejected: {
    icon: 'shield-remove-outline',
    tint: colors.danger,
    label: 'Not approved',
    detail: 'Read the reason below, update what is needed, and submit again.',
  },
  suspended: {
    icon: 'pause-octagon-outline',
    tint: colors.danger,
    label: 'Suspended',
    detail: 'This organisation cannot publish outreaches at the moment. Contact VHub.',
  },
  banned: {
    icon: 'block-helper',
    tint: colors.danger,
    label: 'Removed',
    detail: 'This organisation can no longer publish on VHub.',
  },
};

interface RegistrationDraft {
  label: string;
  number: string;
}

interface DocumentDraft {
  publicId: string;
  name: string;
}

export default function OrganisationVerification() {
  // The floating tab bar is absolute and reserves no space, so the last
  // element needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  const profile = useAuthStore((state) => state.profile);
  const submissionQuery = useMyVerificationSubmission();
  const submit = useSubmitVerification();
  const uploadDocument = useOrganisationDocumentUpload();

  const [contactPerson, setContactPerson] = useState('');
  const [officialEmail, setOfficialEmail] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [registrations, setRegistrations] = useState<RegistrationDraft[]>([{ label: '', number: '' }]);
  const [documents, setDocuments] = useState<DocumentDraft[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);

  const submission = submissionQuery.data;
  const state: OrgVerificationState = submission?.profile.verification_state ?? 'unverified';
  const presentation = STATE_PRESENTATION[state];
  const decidedAt = submission?.profile.verification_decided_at ?? null;
  const decidedOn =
    decidedAt && (state === 'verified' || state === 'rejected')
      ? new Date(decidedAt).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null;

  // Prefilled from whatever was submitted before, so a rejected organisation
  // fixes one field rather than retyping everything it already told us.
  // Documents are deliberately NOT prefilled: the previous files still exist,
  // but re-attaching them silently would let a resubmission look like new
  // evidence when nothing changed.
  useEffect(() => {
    if (!submission) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefills a resubmission from the previous one and every setter here preserves what has been typed
    setContactPerson((current) => current || submission.profile.contact_person || '');
    setOfficialEmail((current) => current || submission.profile.official_email || '');
    setPhysicalAddress((current) => current || submission.profile.physical_address || '');
    setWebsite((current) => current || submission.profile.website || '');
    setRegistrations((current) => {
      const alreadyEdited = current.some((row) => row.label || row.number);
      if (alreadyEdited || submission.registrations.length === 0) return current;
      return submission.registrations.map((row) => ({ label: row.label, number: row.number }));
    });
  }, [submission]);

  const canEdit = state === 'unverified' || state === 'rejected';
  const consentRecorded = !!submission?.profile.document_consent_at;

  /*
    ERRORS ARE DERIVED FROM STATE, NEVER SNAPSHOTTED. This is the same fix the
    Create Outreach wizard needed: an `errors` object written only on submit is
    stale for every field the moment the user starts correcting it, so a
    message stays on screen after the problem is gone.
  */
  const errors = useMemo(() => {
    const filledRegistrations = registrations.filter((row) => row.label.trim() && row.number.trim());
    return {
      contactPerson: contactPerson.trim() ? null : 'Give the name of a person we can contact.',
      officialEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(officialEmail.trim())
        ? null
        : 'Enter a working email address on your organisation’s own domain.',
      physicalAddress: physicalAddress.trim() ? null : 'Give the address where the organisation operates.',
      registrations:
        filledRegistrations.length > 0
          ? null
          : 'Add at least one registration, with both its name and its number.',
      documents: documents.length > 0 ? null : 'Attach at least one document that backs the above.',
    };
  }, [contactPerson, officialEmail, physicalAddress, registrations, documents]);

  const firstError = Object.values(errors).find((message) => message !== null) ?? null;

  function updateRegistration(index: number, patch: Partial<RegistrationDraft>) {
    setRegistrations((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleAttach() {
    const result = await uploadDocument.mutateAsync();
    if (result) {
      setDocuments((current) =>
        current.some((doc) => doc.publicId === result.publicId) ? current : [...current, result]
      );
    }
  }

  function handleSubmit() {
    setAttempted(true);
    if (firstError) return;

    submit.mutate(
      {
        contactPerson: contactPerson.trim(),
        officialEmail: officialEmail.trim(),
        physicalAddress: physicalAddress.trim(),
        ...(website.trim() ? { website: website.trim() } : {}),
        registrations: registrations
          .filter((row) => row.label.trim() && row.number.trim())
          .map((row) => ({ label: row.label.trim(), number: row.number.trim() })),
        documents: documents.map((doc) => ({ publicId: doc.publicId, label: doc.name })),
        ...(consented ? { consent: true } : {}),
      },
      {
        onSuccess: () => {
          setDocuments([]);
          setAttempted(false);
          setToast('Submitted. VHub will review it and let you know.');
        },
      }
    );
  }

  if (submissionQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Organisation Verification" fallback="/(organisation)/profile" />
        <View style={styles.stateWrap}>
          <ListSkeleton rows={3} rowHeight={96} />
        </View>
      </SafeAreaView>
    );
  }

  if (submissionQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Organisation Verification" fallback="/(organisation)/profile" />
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              humanError(submissionQuery.error, 'Could not load your verification details.')
            }
            onRetry={() => submissionQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Organisation Verification" fallback="/(organisation)/profile" />

      {/*
        THE REASON FIELD WAS BEHIND THE KEYBOARD (owner-reported, 2026-09-22).
        The app is edge-to-edge, so the window no longer resizes when the
        keyboard opens: it is an inset drawn over the top. Nothing shrinks and
        nothing scrolls by itself, so a field low on the page is simply covered.
        See constants/keyboard.ts for why the behaviour is 'padding' on both
        platforms rather than the iOS-only ternary.
      */}
      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_AVOID_BEHAVIOR}>
        <ScrollView contentContainerStyle={[styles.content, tabBarPadding]} showsVerticalScrollIndicator={false}>
          <View style={[styles.statusCard, { borderColor: presentation.tint }]}>
            <MaterialCommunityIcons name={presentation.icon} size={28} color={presentation.tint} />
            <View style={styles.statusText}>
              <Text style={styles.statusLabel}>{presentation.label}</Text>
              <Text style={styles.statusDetail}>{presentation.detail}</Text>
              {/*
                WHEN THE DECISION WAS MADE (owner, 2026-09-22: "where does the
                org see the reason from the admin, or it only sees the
                reject?").

                An approval's written reason is deliberately NOT shown here.
                The reason is required for both outcomes but they are written
                for different readers: a rejection's is addressed TO the
                organisation and is the only thing telling it what to fix,
                while an approval's is a note for the next admin explaining why
                thin evidence was accepted. Publishing that second kind would
                change what an admin can honestly write in it.

                What the organisation was missing is not the note; it is any
                acknowledgement that a person looked and when. That is this
                line, and it appears for an approval and a rejection alike.
              */}
              {decidedOn ? <Text style={styles.statusDecided}>Decided {decidedOn}</Text> : null}
            </View>
          </View>

          {state === 'rejected' && submission?.profile.verification_reason ? (
            <View style={styles.reasonCard}>
              <Text style={styles.reasonHeading}>Why it was not approved</Text>
              <Text style={styles.reasonBody}>{submission.profile.verification_reason}</Text>
            </View>
          ) : null}

          <View style={styles.explainCard}>
            <Text style={styles.explainText}>
              VHub verifies organisations so volunteers know an outreach is real before they give up a
              Saturday for it. Until yours is verified you can write and keep drafts, but you cannot
              publish. Everything you send here is read by a VHub administrator and by nobody else.
            </Text>
          </View>

          {canEdit ? (
            <>
              <Text style={styles.sectionHeading}>Who we should contact</Text>
              <Input
                label="Contact person"
                required
                value={contactPerson}
                onChangeText={setContactPerson}
                placeholder="Full name of the person responsible"
                error={attempted ? (errors.contactPerson ?? undefined) : undefined}
              />
              <Input
                label="Official email"
                required
                value={officialEmail}
                onChangeText={setOfficialEmail}
                placeholder="name@yourorganisation.org"
                autoCapitalize="none"
                keyboardType="email-address"
                error={attempted ? (errors.officialEmail ?? undefined) : undefined}
              />
              <Text style={styles.fieldHint}>
                An address on your own domain if you have one. This is not shown to volunteers. Your
                public enquiries address stays on your profile.
              </Text>
              <Input
                label="Physical address"
                required
                value={physicalAddress}
                onChangeText={setPhysicalAddress}
                placeholder="Street, town, region"
                multiline
                error={attempted ? (errors.physicalAddress ?? undefined) : undefined}
              />
              <Input
                label="Website or social page"
                value={website}
                onChangeText={setWebsite}
                placeholder="https://"
                autoCapitalize="none"
              />

              <Text style={styles.sectionHeading}>Registration</Text>
              <Text style={styles.sectionHint}>
                Whatever your organisation actually holds: Registrar-General, the NGO Board, a
                teaching-hospital affiliation, a district health directorate letter. Name the scheme in
                your own words; there is no fixed list.
              </Text>

              {registrations.map((row, index) => (
                <View key={index} style={styles.registrationRow}>
                  <Input
                    label={index === 0 ? 'Registered with' : undefined}
                    value={row.label}
                    onChangeText={(value) => updateRegistration(index, { label: value })}
                    placeholder="e.g. Registrar-General"
                  />
                  <Input
                    label={index === 0 ? 'Number' : undefined}
                    value={row.number}
                    onChangeText={(value) => updateRegistration(index, { number: value })}
                    placeholder="e.g. CG123456789"
                  />
                  {registrations.length > 1 ? (
                    <Pressable
                      onPress={() => setRegistrations((rows) => rows.filter((_, i) => i !== index))}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove registration ${index + 1}`}
                      style={styles.removeRow}
                    >
                      <MaterialCommunityIcons name="close" size={16} color={colors.danger} />
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}

              {attempted && errors.registrations ? (
                <Text style={styles.errorText}>{errors.registrations}</Text>
              ) : null}

              <Button
                title="Add another registration"
                variant="outline"
                onPress={() => setRegistrations((rows) => [...rows, { label: '', number: '' }])}
                style={styles.addButton}
              />

              <Text style={styles.sectionHeading}>Documents</Text>
              <Text style={styles.sectionHint}>
                A photo or PDF of each registration certificate or letter. Make sure the text is legible
                and the whole page is in frame. These are stored privately. Only a VHub administrator
                can open them, and only through a link that expires.
              </Text>

              {documents.map((doc) => (
                <View key={doc.publicId} style={styles.documentRow}>
                  <MaterialCommunityIcons name="file-lock-outline" size={20} color={colors.primary} />
                  <Text style={styles.documentName} numberOfLines={1}>
                    {doc.name}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setDocuments((current) => current.filter((d) => d.publicId !== doc.publicId))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${doc.name}`}
                    hitSlop={8}
                  >
                    <MaterialCommunityIcons name="close" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
              ))}

              {attempted && errors.documents ? (
                <Text style={styles.errorText}>{errors.documents}</Text>
              ) : null}

              <Button
                title={uploadDocument.isPending ? 'Uploading…' : 'Attach a document'}
                variant="outline"
                disabled={uploadDocument.isPending}
                onPress={() => void handleAttach()}
                style={styles.addButton}
              />
              {/* A failed upload is a popup, never a line under the button. */}
              <ErrorAlert error={uploadDocument.error} fallback="That document could not be uploaded." />

              {/*
                CONSENT AT THE POINT OF UPLOAD, not buried in terms — and not a
                decorative checkbox either: the API refuses the submission without
                it and remembers the answer, so this block is what unblocks the
                server. It disappears once recorded; asking again on every
                resubmission would train people to tap past it.
              */}
              {!consentRecorded ? (
                <View style={styles.consentCard}>
                  <Text style={styles.consentHeading}>Before you submit</Text>
                  {ORGANISATION_CONSENT_POINTS.map((point) => (
                    <View key={point} style={styles.consentRow}>
                      <MaterialCommunityIcons name="circle-small" size={20} color={colors.textSecondary} />
                      <Text style={styles.consentText}>{point}</Text>
                    </View>
                  ))}
                  <Pressable
                    onPress={() => setConsented((prev) => !prev)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: consented }}
                    style={styles.confirmRow}
                  >
                    <View style={[styles.checkbox, consented && styles.checkboxChecked]}>
                      {consented ? (
                        <MaterialCommunityIcons name="check" size={14} color={colors.white} />
                      ) : null}
                    </View>
                    <Text style={styles.consentAgree}>
                      I understand this, and I agree to VHub storing these documents for verification.
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {/* A refused submission is a popup, never a line under the button. */}
              <ErrorAlert error={submit.error} fallback="Could not send your details for verification." />
              {attempted && firstError ? (
                <Text style={styles.errorText}>Fix the marked fields above, then submit again.</Text>
              ) : null}

              <View style={styles.submitBlock}>
                <Button
                  title={submit.isPending ? 'Submitting…' : 'Submit for verification'}
                  onPress={handleSubmit}
                  disabled={submit.isPending || (!consentRecorded && !consented)}
                />
              </View>
            </>
          ) : (
            <View style={styles.submittedCard}>
              <Text style={styles.submittedHeading}>What you sent</Text>
              <Text style={styles.submittedLine}>
                {submission?.profile.contact_person ?? profile?.full_name ?? 'Contact not recorded'}
                {submission?.profile.official_email ? ` · ${submission.profile.official_email}` : ''}
              </Text>
              {submission?.registrations.map((row) => (
                <Text key={row.id} style={styles.submittedLine}>
                  {row.label}: {row.number}
                </Text>
              ))}
              <Text style={styles.submittedLine}>
                {submission?.documents.length ?? 0} document
                {(submission?.documents.length ?? 0) === 1 ? '' : 's'} attached
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /** Lets the KeyboardAvoidingView fill the screen under the header. */
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.base },
  stateWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.surfaceSubtle,
    marginTop: spacing.base,
  },
  statusText: { flex: 1, gap: spacing.xs },
  statusLabel: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  statusDecided: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statusDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  reasonCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#FEF2F2',
    gap: spacing.xs,
  },
  reasonHeading: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.danger },
  reasonBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  explainCard: { paddingVertical: spacing.sm },
  explainText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  sectionHeading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  fieldHint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionHint: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  registrationRow: {
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    marginBottom: spacing.md,
  },
  removeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.xs },
  removeText: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.danger },
  addButton: { marginTop: spacing.sm },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    marginBottom: spacing.sm,
  },
  documentName: { flex: 1, fontFamily: fontFamily.medium, fontSize: 14, color: colors.textPrimary },
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  consentCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  consentHeading: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  consentText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  confirmRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginTop: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  consentAgree: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  submitBlock: { marginTop: spacing.xl },
  submittedCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  submittedHeading: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
  submittedLine: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textSecondary },
});
