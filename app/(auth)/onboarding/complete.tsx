import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

/**
 * The last screen of volunteer onboarding.
 *
 * THIS FILE EXISTED BEFORE, WAS DELETED ON 2026-09-11, AND IS BACK
 * DELIBERATELY (owner-approved, 2026-09-21). The reversal is worth stating
 * plainly, because the reason for the deletion was sound and is not being
 * discarded.
 *
 * It was deleted because it sat BETWEEN signing the declaration and uploading
 * the document. A volunteer therefore finished the wizard, was congratulated,
 * and was shown the one outstanding task as an optional-looking card on a
 * celebration screen, which is a very easy thing to walk past without ever
 * registering that you had something left to do. The fix at the time was to
 * remove the celebration and send them straight to the upload screen.
 *
 * That fixed the walking-past and created a worse ending: the upload screen is
 * a Settings screen, so the last thing a new volunteer saw was the app
 * depositing them in Settings. The owner's words: "is this how to welcome a
 * new user?"
 *
 * WHAT MAKES IT SAFE NOW is that the upload happens on the step BEFORE this
 * one. So this screen is no longer standing between somebody and an
 * outstanding task -- it is reporting the outcome of a task already attempted,
 * and it reads the profile to do it rather than assuming success. If the
 * document did not arrive, for any reason including the file picker being
 * cancelled, this says so in the same breath as the congratulations and offers
 * the way to fix it. A celebration that states what is missing is not the
 * thing that was removed.
 *
 * IT IS NOT AN ENTRY SCREEN, so `useAuthGuard` leaves it alone exactly as it
 * leaves the wizard steps alone, and the volunteer reaches their feed by
 * pressing the button rather than by being redirected mid-sentence.
 */
export default function OnboardingComplete() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);

  const firstName = (profile?.full_name ?? '').trim().split(' ')[0] || null;

  /*
    READ FROM THE PROFILE, NEVER FROM WHAT THE LAST SCREEN INTENDED.

    `credential_document_id` and `verification_status` are both server-only
    columns, so their presence is proof the upload endpoint actually ran. A
    flag passed through the navigation would only record that the app TRIED.
  */
  const documentOnFile = !!volunteerProfile?.credential_document_id;
  const declarationSigned = volunteerProfile?.declaration_signed === true;

  return (
    <SafeAreaView style={styles.container}>
      {/*
        A SCROLLER, because this column is centred and can outgrow the screen.
        It was a plain flex View: a 72px badge, a 26/32 heading, a lead
        paragraph, a three-row status card and up to two buttons. At the 1.3
        font scale the app supports, on a 360x640 handset, that overflows at
        BOTH ends because the column is centred, with nothing to scroll and no
        way to reach "Add my document now". A drag to reach it is just a press
        on whatever is under the thumb, which reads as the app going somewhere
        random rather than as a layout fault. `flexGrow: 1` keeps the centring
        at ordinary sizes, so nothing changes until it actually overflows.
      */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.badge}>
          <MaterialCommunityIcons name="check" size={38} color={colors.white} />
        </View>

        <Text style={styles.heading}>
          {firstName ? `You're all set, ${firstName}` : "You're all set"}
        </Text>
        <Text style={styles.lead}>
          Your profile is complete. VHub will start matching you to outreaches that suit your
          skills, your category and the days you are free.
        </Text>

        <View style={styles.statusCard}>
          <StatusRow done label="Profile complete" detail="Skills, category and availability saved." />
          <StatusRow
            done={declarationSigned}
            label={declarationSigned ? 'Declaration signed' : 'Declaration not signed'}
            detail={
              declarationSigned
                ? 'On file, so a document can be attached to it.'
                : 'You can sign it any time from Settings.'
            }
          />
          <StatusRow
            done={documentOnFile}
            label={documentOnFile ? 'Document received' : 'No document yet'}
            detail={
              documentOnFile
                ? 'An admin will review it. You will be told either way.'
                : 'Support roles are open to you now. Clinical roles need a document first.'
            }
          />
        </View>

        {/*
          THE MISSING DOCUMENT IS STATED AND DELIBERATELY DOES NOT BLOCK.

          An unverified volunteer can browse everything and Quick Join every
          support-role outreach, so a gate here would be wrong. Silence was the
          original bug; a sentence is the fix.
        */}
        <Button
          title="Browse outreaches"
          variant="solid"
          onPress={() => router.replace('/(volunteer)/feed')}
          style={styles.primaryButton}
        />

        {!documentOnFile ? (
          <Button
            title="Add my document now"
            variant="text"
            onPress={() =>
              router.replace('/(volunteer)/verify-identity?from=/(volunteer)/feed')
            }
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusRow({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail: string;
}) {
  return (
    <View style={styles.statusRow}>
      <MaterialCommunityIcons
        name={done ? 'check-circle' : 'clock-outline'}
        size={20}
        // Amber, not red: nothing here has gone wrong. An outstanding document
        // is a thing still to do, and colouring it as an error would tell a
        // brand new volunteer they had failed at registering.
        color={done ? colors.success : colors.warning}
      />
      <View style={styles.statusText}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusDetail}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    // `flexGrow`, not `flex`: this is a ScrollView contentContainer now, and
    // `flex: 1` there caps the content at the viewport height, which is the
    // one thing that would stop it scrolling.
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    justifyContent: 'center',
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    lineHeight: 32,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  lead: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  statusCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.base,
    marginTop: spacing.xl,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  statusText: {
    flex: 1,
  },
  statusLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  statusDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },
  primaryButton: {
    marginTop: spacing.xl,
  },
});
