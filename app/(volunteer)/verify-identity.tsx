import { useState } from 'react';
import {
  Image,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, ConfirmDialog, ErrorAlert, ScreenHeader } from '@/components/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CREDENTIAL_CONSENT_POINTS } from '@/constants/credential-guidelines';
import { useDocumentUrl } from '@/hooks/useDocumentUrl';
import { useSignDeclaration } from '@/hooks/useSignDeclaration';
// Imported from its own module, never the hooks barrel: useMediaUpload pulls in
// the native picker modules, and a barrel import would drag them into every
// screen that imports any hook. See the note in lib/cloudinary.ts.
import { useCredentialUpload, useDeleteCredential } from '@/hooks/useMediaUpload';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

// Collapsing a section without this is an instant jump on Android rather than
// an animation. Same guard InfoSection uses; both are no-ops if already set.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
    detail: 'Your documents are with the VHub team. We will let you know the outcome.',
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
  // The floating tab bar is absolute and reserves no space, so the last
  // element needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  const router = useRouter();
  /*
    THE ONBOARDING COMPLETION SCREEN WAS MERGED INTO THIS ONE (owner, 2026-09-11).

    THE SPLIT AS IT WAS. Finishing the wizard landed on
    app/(auth)/onboarding/complete.tsx — a "You're Ready!" celebration that
    carried, for anyone who had signed the declaration and was not yet
    verified, a card explaining that a credential document was the other half
    of getting verified and a button that pushed HERE to do it.

    WHY IT WAS BUILT THAT WAY. The declaration and the document cannot be
    submitted together: /api/verification-document refuses a document while
    declaration_signed is false, and the declaration is written by the wizard's
    own submit. So the upload genuinely cannot live on the wizard step before
    this. Splitting it across a celebration screen and this one was the way to
    put a gap between the two writes.

    WHY THAT WAS WRONG ANYWAY. The gap only had to be between two SERVER
    CALLS, not between two SCREENS — by the time anything is rendered here the
    declaration is already on file. So the split bought nothing and cost the
    thing that matters: the last thing a new volunteer saw was a screen
    congratulating them, with the one outstanding task on it as an optional
    card they could walk past without ever being told they had. Which is
    exactly what happened.

    Now the wizard lands here with `?from=onboarding`, and this screen carries
    the welcome, the upload and the way onward in one place. Everything below
    keyed on `fromOnboarding` is that: the celebration replaces the settings
    header, and the onward actions replace the back button.
  */
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromOnboarding = from === 'onboarding';
  /*
    WHERE THE POLICY LINK COMES BACK TO (owner-reported, 2026-09-22: "if I click
    read the full privacy in identity verification and I click back it should
    take me back to identity verification not home or settings").

    app/policy.tsx sits OUTSIDE every role group and its ScreenHeader falls back
    to '/', which the auth guard then resolves to whichever home the role has.
    That is the right answer only for somebody who arrived at the policy from
    nowhere in particular. Every caller now says where it is sending the reader
    from, and this one carries its OWN origin along inside that value, so a
    volunteer who came here from the inbox still lands back in the inbox two
    presses later rather than being dropped a level each time.
  */
  const policyHref =
    '/policy?from=' +
    encodeURIComponent(
      '/(volunteer)/verify-identity' + (from && from !== 'onboarding' ? `?from=${from}` : '')
    );
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);
  const signDeclaration = useSignDeclaration();
  const credentialUpload = useCredentialUpload();
  const deleteCredential = useDeleteCredential();
  const [confirmed, setConfirmed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [consented, setConsented] = useState(false);
  // Closed by default: see the note on the heading row below.
  const [consentPointsOpen, setConsentPointsOpen] = useState(false);

  // Consent is asked ONCE. Once the server has stamped it, the block goes away
  // — asking again on every replacement would train people to tap past it,
  // which is the opposite of informed.
  const consentRecorded = !!volunteerProfile?.document_consent_at;

  const hasDocument = !!volunteerProfile?.credential_document_id;
  /*
    THE DOCUMENT NO LONGER HAS A STORED ADDRESS, and that is the point of
    package B. A credential is a private Cloudinary asset; the database keeps
    only its name, and a link that actually fetches it exists for fifteen
    minutes at a time, issued by the server to a requester it has authorised.
    So the screen asks for one instead of reading a column.
  */
  const document = useDocumentUrl(user?.id, hasDocument);
  const status = volunteerProfile?.verification_status ?? 'unverified';
  const presentation = STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.unverified;
  const declarationSigned = volunteerProfile?.declaration_signed === true;

  /*
    WHERE BACK GOES, AND WHY IT DEPENDS ON THE STATUS (owner, 2026-09-22: "I
    think it should take me to home when I click back in the review, since I am
    done with the process").

    This screen has two jobs and the right exit is different for each. While
    there is something to DO here -- sign the declaration, send a document,
    replace one that was turned down -- it is a settings screen reached from
    Settings, and going back to where the row was tapped is correct. Once the
    document is in and waiting on a human, there is nothing left to do and
    nothing to come back for: the volunteer has finished, and the app should
    return them to the thing the app is for rather than to a menu.

    A `from` on the route still wins over this, which is what keeps the inbox
    route honest: somebody who opened their verification from a notification
    lands back in the inbox whatever their status is. See ScreenHeader.
  */
  const backFallback =
    status === 'documents_pending' ? '/(volunteer)/feed' : '/(volunteer)/profile';

  function handleSign() {
    if (!user || !confirmed) return;
    signDeclaration.mutate(user.id);
  }

  function handleShare() {
    Share.share({
      message: 'I just joined VHub to volunteer at medical outreaches across Ghana. Join me!',
    }).catch(() => {
      // no-op: share sheet dismissal/failure isn't actionable here
    });
  }

  const firstName = profile?.full_name?.trim().split(' ')[0] || 'volunteer';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {fromOnboarding ? null : (
        <ScreenHeader title="Identity Verification" fallback={backFallback} />
      )}

      <ScrollView contentContainerStyle={[styles.content, tabBarPadding]} showsVerticalScrollIndicator={false}>
        {fromOnboarding ? (
          <View style={styles.welcomeCard}>
            <MaterialCommunityIcons name="party-popper" size={26} color={colors.primary} />
            <Text style={styles.welcomeTitle}>You&apos;re in, {firstName}</Text>
            <Text style={styles.welcomeBody}>
              Your profile is active and you can start browsing outreaches straight away. There is
              one optional thing left, and this is the screen for it.
            </Text>
          </View>
        ) : null}
        <View style={[styles.statusCard, { backgroundColor: presentation.bg }]}>
          <MaterialCommunityIcons name={presentation.icon} size={28} color={presentation.fg} />
          <View style={styles.statusText}>
            <Text style={styles.statusLabel}>{presentation.label}</Text>
            <Text style={styles.statusDetail}>{presentation.detail}</Text>
          </View>
        </View>

        {/*
          THE REASON A DECISION WENT AGAINST THEM. There is deliberately no
          'rejected' verification status — a volunteer whose document was
          declined IS unverified, which is the state they are in and the thing
          they can act on. What they need is this, and without it a rejection
          is indistinguishable from never having uploaded anything.
        */}
        {status === 'unverified' &&
        volunteerProfile?.verification_reason &&
        volunteerProfile?.verification_decided_at ? (
          <View style={styles.reasonCard}>
            <Text style={styles.reasonHeading}>Your document was not approved</Text>
            <Text style={styles.reasonBody}>{volunteerProfile.verification_reason}</Text>
            <Text style={styles.reasonHint}>
              Upload a different document below and it goes back into the queue.
            </Text>
          </View>
        ) : null}

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

            {/* A failed signature is a popup, never a line under the button. */}
            <ErrorAlert error={signDeclaration.error} fallback="Could not save your declaration." />

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

        {/*
          OUT OF THE UPLOAD BRANCH. Somebody whose document has just been sent
          back is exactly the person who most needs to read what counts, and
          the link used to be rendered only when there was no document on file
          at all -- so it disappeared at the moment it became most useful. It
          goes away only once verification is settled.
        */}
        {status !== 'verified' ? (
          <Pressable
            onPress={() => router.push('/(volunteer)/credential-guidelines')}
            accessibilityRole="button"
            accessibilityLabel="Read what to send"
            style={({ pressed }) => [styles.guidelinesRow, pressed && styles.documentPressed]}
          >
            <MaterialCommunityIcons name="help-circle-outline" size={20} color={colors.primary} />
            <View style={styles.documentFileText}>
              <Text style={styles.documentFileTitle}>What should I send?</Text>
              <Text style={styles.documentFileHint}>
                What counts for your profession, and the four things that get a document sent back.
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        {/*
          THE BRANCH IS ON THE DOCUMENT, NOT ON THE STATUS (owner-reported,
          2026-09-22: after a rejection, "reason but no docx, the docx is not
          showing though").

          A rejection sets verification_status back to 'unverified' and
          deliberately KEEPS the file -- destroying it would leave the volunteer
          unable to see what they had sent and would erase the evidence behind a
          decision the audit trail had just recorded. But this branch asked
          "are you unverified?" and treated the answer as "do you have a
          document?", which are the same question only until the first
          rejection. So a rejected volunteer was shown the empty upload state,
          with "No document uploaded yet" sitting directly underneath a card
          explaining why the document they could not see had been turned down.
        */}
        {!hasDocument ? (
          <>
            <Text style={styles.body}>
              Upload your licence, degree certificate or council registration as a PDF or photo.
              A person on the VHub team reviews it, because Ghana has no public licensing-registry API,
              so a self-entered licence number would prove nothing.
            </Text>

            {!declarationSigned ? (
              <Text style={styles.gateNote}>Sign the declaration above first.</Text>
            ) : null}


            {/*
              CONSENT AT THE POINT OF UPLOAD, not buried in terms. Somebody
              handing over a photograph of their nursing licence is entitled to
              be told what happens to it at the moment they do it.

              It is not a decorative checkbox: the API refuses the upload
              without it and remembers the answer, so this block is the thing
              that unblocks the server, not just the button. It disappears once
              consent has been recorded — asking again every time would train
              people to tap past it.
            */}
            {!consentRecorded ? (
              <View style={styles.consentCard}>
                {/*
                  THE POINTS COLLAPSE; THE AGREEMENT DOES NOT (owner, 2026-09-14).
                  Five bullets of storage and retention detail pushed the
                  checkbox -- the control that actually unblocks the upload --
                  below the fold on a small phone, so the screen read as an
                  essay with no obvious next step.

                  Only the explanation is behind the arrow. The heading, the
                  checkbox and the policy link stay visible at all times,
                  because a consent control a reader has to go looking for is
                  worse than one they have to scroll past, and hiding the thing
                  being agreed to behind a tap is not consent worth recording.

                  It opens CLOSED. Anyone who wants the detail taps once; the
                  text is also reachable in full from the policy link below,
                  which is the canonical copy.
                */}
                <Pressable
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setConsentPointsOpen((open) => !open);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: consentPointsOpen }}
                  accessibilityLabel={
                    consentPointsOpen
                      ? 'Hide what happens to your document'
                      : 'Read what happens to your document'
                  }
                  hitSlop={8}
                  style={styles.consentHeadingRow}
                >
                  <Text style={styles.consentHeading}>Before you upload</Text>
                  <MaterialCommunityIcons
                    name={consentPointsOpen ? 'chevron-up' : 'chevron-down'}
                    size={22}
                    color={colors.textSecondary}
                  />
                </Pressable>

                {consentPointsOpen
                  ? CREDENTIAL_CONSENT_POINTS.map((point) => (
                      <View key={point} style={styles.consentRow}>
                        <MaterialCommunityIcons
                          name="circle-small"
                          size={20}
                          color={colors.textSecondary}
                        />
                        <Text style={styles.consentText}>{point}</Text>
                      </View>
                    ))
                  : null}

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
                    I understand this, and I agree to VHub storing my document for verification.
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => router.push(policyHref as Parameters<typeof router.push>[0])}
                  accessibilityRole="button"
                  accessibilityLabel="Read the privacy policy"
                  hitSlop={8}
                >
                  <Text style={styles.consentLink}>Read the full privacy policy</Text>
                </Pressable>
              </View>
            ) : null}

            {/*
              THE ABSENCE OF A DOCUMENT IS NOW STATED, NOT IMPLIED.

              The owner finished onboarding without uploading anything and was
              never told. That was not a validation bug in the ordinary sense —
              verification is genuinely optional, and blocking someone from
              using the app over it would be wrong, because an unverified
              volunteer can browse everything and join every support-role
              outreach. What was missing was the app SAYING SO. An upload
              button on its own is an invitation; it is not a statement that
              nothing has been received, and those read identically to someone
              who thinks they already did it.

              So this is an indication, deliberately, and not a gate.
            */}
            {/* Unconditional: this whole branch is the no-document case. */}
            <View style={styles.outstandingCard}>
              <MaterialCommunityIcons name="file-alert-outline" size={20} color={colors.warning} />
              <View style={styles.outstandingText}>
                <Text style={styles.outstandingTitle}>No document uploaded yet</Text>
                <Text style={styles.outstandingBody}>
                  You can browse every outreach and join support-role ones without this. It is
                  needed only for clinical roles, and you can come back to it at any time from
                  Settings.
                </Text>
              </View>
            </View>

            <Button
              title={credentialUpload.isPending ? 'Uploading...' : 'Choose a document'}
              variant="solid"
              disabled={
                !declarationSigned || credentialUpload.isPending || (!consentRecorded && !consented)
              }
              onPress={() =>
                user && credentialUpload.mutate({ userId: user.id, consent: consented || undefined })
              }
              style={styles.signButton}
            />
          </>
        ) : (
          <>
            <View style={styles.signedRow}>
              <MaterialCommunityIcons
                name={
                  status === 'verified'
                    ? 'check-circle'
                    : status === 'documents_pending'
                      ? 'file-check-outline'
                      : 'file-alert-outline'
                }
                size={18}
                color={
                  status === 'verified'
                    ? colors.success
                    : status === 'documents_pending'
                      ? colors.warning
                      : colors.danger
                }
              />
              {/*
                Three states, not two. The third is a volunteer whose document
                was declined and is still on file: they need to be told that
                what they are looking at is the one that was turned down, or the
                screen reads as though the decision applied to something else.
              */}
              <Text style={styles.signedText}>
                {status === 'verified'
                  ? 'Your credential has been reviewed and accepted.'
                  : status === 'documents_pending'
                    ? 'Your document has been received and is waiting on review.'
                    : 'This is the document that was reviewed. Replace it with a different one and it goes back into the queue.'}
              </Text>
            </View>

            {/*
              The document itself, which used to be invisible the moment it was
              uploaded: a volunteer could not check WHICH file they had sent,
              could not swap a wrong one, and could not take it back. That last
              one matters most — this is an identity document, and being unable
              to withdraw your own is the wrong default.
            */}
            <DocumentPreview
                url={document.data?.url ?? null}
                isImage={document.data?.isImage ?? false}
                isLoadingUrl={document.isLoading}
                loadError={document.isError}
                onRetryUrl={() => void document.refetch()}
                // A verified volunteer keeps the view and loses the controls:
                // the document is the evidence behind an approval a human
                // already made, so it cannot be swapped or withdrawn from here.
                canManage={status !== 'verified'}
                isReplacing={credentialUpload.isPending}
                isDeleting={deleteCredential.isPending}
                onReplace={() => user && credentialUpload.mutate({ userId: user.id })}
              onDelete={() => setConfirmingDelete(true)}
            />
          </>
        )}

        {/*
          THE WAY ONWARD, and the reason this screen can absorb the completion
          screen at all. Reached from Settings, this screen has a back button
          and needs nothing here. Reached at the end of onboarding there is
          nothing behind it — the wizard replaced itself — so it has to offer
          the exits the celebration screen used to: into the feed, or to the
          profile just built. The share action comes with them; it belongs to
          the moment somebody has just joined, not to a verification screen.
        */}
        {fromOnboarding ? (
          <View style={styles.onwardBlock}>
            <Button
              title="Find Your First Opportunity"
              variant="solid"
              onPress={() => router.replace('/(volunteer)/feed')}
              accessibilityLabel="Find your first opportunity"
            />
            <View style={styles.onwardRow}>
              <Button
                title="View Profile"
                variant="outline"
                onPress={() => router.replace('/(volunteer)/profile')}
                accessibilityLabel="View your profile"
                style={styles.onwardProfileButton}
              />
              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [styles.shareButton, pressed && styles.documentPressed]}
                accessibilityRole="button"
                accessibilityLabel="Share VHub"
              >
                <MaterialCommunityIcons
                  name="share-variant-outline"
                  size={20}
                  color={colors.textPrimary}
                />
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={confirmingDelete}
        icon="file-remove-outline"
        tone="destructive"
        title="Remove this document?"
        message="Your verification goes back to Not verified and the file is deleted, so nobody at VHub can read it. You can upload a different one whenever you like."
        confirmLabel="Remove document"
        cancelLabel="Keep it"
        busy={deleteCredential.isPending}
        onConfirm={() => {
          setConfirmingDelete(false);
          if (user) deleteCredential.mutate(user.id);
        }}
        onCancel={() => setConfirmingDelete(false)}
      />

      {/*
        ONE popup each, at the screen root, rather than a line of red text
        beside whichever button was pressed. The upload error had two render
        sites -- the first-upload branch and the replace branch -- which is
        exactly the sort of duplication a popup removes: the failure is the
        same failure whichever branch produced it.
      */}
      <ErrorAlert error={credentialUpload.error} fallback="That document could not be uploaded." />
      <ErrorAlert error={deleteCredential.error} fallback="That document could not be removed." />
    </SafeAreaView>
  );
}

interface DocumentPreviewProps {
  /** Null while the signed link is being fetched, or if fetching it failed. */
  url: string | null;
  /**
   * Whether the document is a photo. Comes from the server, which reads it off
   * the stored public_id — the signed link is a download endpoint and carries
   * no file extension to guess from any more.
   */
  isImage: boolean;
  isLoadingUrl: boolean;
  loadError: boolean;
  onRetryUrl: () => void;
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
  isImage,
  isLoadingUrl,
  loadError,
  onRetryUrl,
  canManage,
  isReplacing,
  isDeleting,
  onReplace,
  onDelete,
}: DocumentPreviewProps) {
  const busy = isReplacing || isDeleting;

  return (
    <View style={styles.documentCard}>
      {/*
        The link is fetched, not stored, so this screen has three states where
        it used to have one. Saying which is which matters: "we are getting you
        a link" and "your document is gone" look identical if both render as an
        empty box, and only one of them is worth worrying about.
      */}
      {!url ? (
        <Pressable
          onPress={loadError ? onRetryUrl : undefined}
          accessibilityRole={loadError ? 'button' : 'text'}
          accessibilityLabel={loadError ? 'Try again to open your document' : 'Preparing your document'}
          style={styles.documentFileRow}
        >
          <MaterialCommunityIcons
            name={loadError ? 'alert-circle-outline' : 'file-lock-outline'}
            size={24}
            color={loadError ? colors.danger : colors.textSecondary}
          />
          <View style={styles.documentFileText}>
            <Text style={styles.documentFileTitle}>
              {loadError ? 'Could not open your document' : 'Preparing your document'}
            </Text>
            <Text style={styles.documentFileHint}>
              {loadError
                ? 'Tap to try again.'
                : isLoadingUrl
                  ? 'It is stored privately, so VHub is unlocking it for you.'
                  : 'One moment.'}
            </Text>
          </View>
        </Pressable>
      ) : isImage ? (
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
          Your document is locked now that you are verified. Contact VHub if it needs updating.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  welcomeCard: {
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  welcomeTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  welcomeBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  outstandingCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    borderRadius: radius.md,
    padding: spacing.base,
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  outstandingText: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    gap: 2,
  },
  outstandingTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  outstandingBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  onwardBlock: {
    gap: spacing.md,
    marginTop: spacing.xxl,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  onwardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  onwardProfileButton: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  shareButton: {
    width: 48,
    height: 48,
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guidelinesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    marginTop: spacing.base,
    marginBottom: spacing.base,
  },
  consentCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  consentHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // alignItems centres children within their line; alignContent places the
    // line itself and defaults to flex-start, so a wrapping row pins to the top.
    alignContent: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
    gap: spacing.sm,
  },
  consentHeading: {
    flexShrink: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  consentText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  consentLink: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  consentAgree: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  reasonCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#FEF2F2',
    gap: spacing.xs,
    // The status card sits directly above and the two were touching, which
    // read as one two-tone box rather than as a state and the reason for it
    // (owner, 2026-09-22: "space btw the not verified box and your docx was
    // not approved").
    marginTop: spacing.base,
    marginBottom: spacing.lg,
  },
  reasonHeading: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.danger },
  reasonBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  reasonHint: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary },
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
