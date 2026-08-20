import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar, Badge, ConfirmDialog, VScoreBadge } from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { EXPERIENCE_LEVELS, VOLUNTEER_CATEGORIES } from '@/constants/categories';
import type { ApplicationWithVolunteer, OrganisationApplicationDecision } from '@/hooks';
import type { ApplicationStatus, VerificationStatus } from '@/types/database';

const APPLICATION_STATUS_TONE: Record<ApplicationStatus, BadgeTone> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  waitlisted: 'primary',
  not_selected: 'neutral',
  cancelled: 'neutral',
};

const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  waitlisted: 'Waitlisted',
  not_selected: 'Not selected',
  cancelled: 'Cancelled',
};

const VERIFICATION_TONE: Record<VerificationStatus, BadgeTone> = {
  verified: 'success',
  documents_pending: 'warning',
  unverified: 'neutral',
};

/**
 * The one line that says what a decided applicant's position actually IS, so
 * the buttons below it read as changes to that position rather than as an open
 * choice between three equal options.
 */
const SETTLED_NOTE: Partial<Record<ApplicationStatus, string>> = {
  accepted: 'On the roster. They have been told they are confirmed.',
  waitlisted: 'On the waitlist. They have been told their place in the queue.',
  rejected: 'Not selected. They have been told.',
};

const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  verified: 'Verified',
  documents_pending: 'Pending Docs',
  unverified: 'Unverified',
};

export interface ApplicantCardProps {
  application: ApplicationWithVolunteer;
  requiredSkills: string[];
  onDecide: (status: OrganisationApplicationDecision) => void;
  /** Opens the applicant's public profile. Omitted when the volunteer row was RLS-filtered. */
  onViewProfile?: () => void;
  /**
   * 1-based place in the waitlist queue, for waitlisted applicants only.
   * Derived from the live ranking (lib/roster.ts), never stored — the
   * promotion rule picks the highest-ranked waitlisted applicant, so any
   * position shown has to be computed the same way to stay true.
   */
  waitlistPosition?: number;
  isPending: boolean;
  errorMessage?: string;
}

/** One applicant row for the Applicant Vetting screen. */
export function ApplicantCard({
  application,
  requiredSkills,
  onDecide,
  onViewProfile,
  waitlistPosition,
  isPending,
  errorMessage,
}: ApplicantCardProps) {
  const volunteer = application.volunteer;
  const profile = volunteer?.profile ?? null;
  const name = profile?.full_name ?? 'Volunteer details unavailable';
  const categoryLabel = VOLUNTEER_CATEGORIES.find((c) => c.value === volunteer?.category)?.label;
  const experienceLabel = EXPERIENCE_LEVELS.find((e) => e.value === volunteer?.experience_level)?.label;
  const skillTags = volunteer?.skill_tags ?? [];
  const requiredSet = new Set(requiredSkills);
  const matchedSkills = skillTags.filter((skill) => requiredSet.has(skill));
  const otherSkills = skillTags.filter((skill) => !requiredSet.has(skill));
  const shownSkills = [...matchedSkills, ...otherSkills].slice(0, 5);
  const extraCount = skillTags.length - shownSkills.length;

  const isAccepted = application.status === 'accepted';
  const isSettled = isAccepted || application.status === 'waitlisted' || application.status === 'rejected';
  const [confirming, setConfirming] = useState<'waitlisted' | 'rejected' | null>(null);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Avatar name={name} uri={profile?.avatar_url} size={48} />
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {volunteer ? (
              <Badge
                label={VERIFICATION_LABEL[volunteer.verification_status]}
                tone={VERIFICATION_TONE[volunteer.verification_status]}
              />
            ) : null}
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>
            {[categoryLabel, experienceLabel].filter(Boolean).join(' · ') || 'No profile details yet'}
          </Text>
          {profile?.district || profile?.region ? (
            <Text style={styles.location} numberOfLines={1}>
              {[profile.district, profile.region].filter(Boolean).join(', ')}
            </Text>
          ) : null}
        </View>
        {volunteer ? <VScoreBadge score={volunteer.v_score} size="sm" /> : null}
      </View>

      <View style={styles.matchRow}>
        <Badge
          label={application.match_score != null ? `${Math.round(application.match_score)}% Match` : 'Not yet scored'}
          tone={application.match_score != null ? 'primary' : 'neutral'}
          icon={application.match_score != null ? 'star' : undefined}
        />
        <Badge label={APPLICATION_STATUS_LABEL[application.status]} tone={APPLICATION_STATUS_TONE[application.status]} />
        {application.status === 'waitlisted' && waitlistPosition != null ? (
          <Badge label={`#${waitlistPosition} in queue`} tone="neutral" />
        ) : null}
      </View>

      {shownSkills.length > 0 ? (
        <View style={styles.skillsRow}>
          {shownSkills.map((skill) => (
            <View key={skill} style={[styles.skillChip, requiredSet.has(skill) && styles.skillChipMatched]}>
              {requiredSet.has(skill) ? (
                <MaterialCommunityIcons name="check" size={11} color={colors.success} style={styles.skillIcon} />
              ) : null}
              <Text style={[styles.skillLabel, requiredSet.has(skill) && styles.skillLabelMatched]}>{skill}</Text>
            </View>
          ))}
          {extraCount > 0 ? <Text style={styles.moreSkills}>+{extraCount} more</Text> : null}
        </View>
      ) : null}

      {application.motivation ? (
        <View style={styles.motivation}>
          <Text style={styles.motivationLabel}>Statement of intent</Text>
          <Text style={styles.motivationText}>{application.motivation}</Text>
        </View>
      ) : null}

      {onViewProfile ? (
        <Pressable
          onPress={onViewProfile}
          accessibilityRole="button"
          accessibilityLabel={`View ${name}'s full profile`}
          style={styles.profileLink}
        >
          <Text style={styles.profileLinkText}>View full profile</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
        </Pressable>
      ) : null}

      {/* A volunteer who withdrew is no longer the org's to decide on — the
          decision buttons would just re-open a closed application. */}
      {application.status === 'cancelled' ? (
        <Text style={styles.withdrawn}>This volunteer withdrew their application.</Text>
      ) : (
        <>
          {/*
            THE CARD NOW SAYS WHERE THEY STAND BEFORE IT OFFERS TO MOVE THEM.

            It used to render three equal buttons and grey out only the one
            matching the current status, so an ACCEPTED volunteer still showed
            live "Waitlist" and "Reject" buttons that looked exactly like the
            ones on an undecided applicant. Both are legitimate — an
            organisation must be able to take someone off a roster — but they
            are not the same act as deciding a pending application: this person
            has been emailed, told they are confirmed, and has the event on
            their schedule. So the labels name the consequence and the tap asks
            first.
          */}
          {isSettled ? <Text style={styles.settledNote}>{SETTLED_NOTE[application.status]}</Text> : null}

          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => onDecide('accepted')}
              disabled={isPending || isAccepted}
              accessibilityRole="button"
              accessibilityLabel={isAccepted ? `${name} is already accepted` : `Accept ${name}`}
              style={[styles.actionButton, styles.acceptButton, (isPending || isAccepted) && styles.actionDisabled]}
            >
              <Text style={styles.acceptText}>{isAccepted ? 'Accepted' : 'Accept'}</Text>
            </Pressable>
            <Pressable
              onPress={() => (isAccepted ? setConfirming('waitlisted') : onDecide('waitlisted'))}
              disabled={isPending || application.status === 'waitlisted'}
              accessibilityRole="button"
              accessibilityLabel={
                isAccepted ? `Move ${name} off the roster to the waitlist` : `Waitlist ${name}`
              }
              style={[styles.actionButton, styles.waitlistButton, (isPending || application.status === 'waitlisted') && styles.actionDisabled]}
            >
              <Text style={styles.waitlistText}>
                {application.status === 'waitlisted' ? 'Waitlisted' : isAccepted ? 'To waitlist' : 'Waitlist'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => (isAccepted ? setConfirming('rejected') : onDecide('rejected'))}
              disabled={isPending || application.status === 'rejected'}
              accessibilityRole="button"
              accessibilityLabel={isAccepted ? `Remove ${name} from the roster` : `Reject ${name}`}
              style={[styles.actionButton, styles.rejectButton, (isPending || application.status === 'rejected') && styles.actionDisabled]}
            >
              <Text style={styles.rejectText}>
                {application.status === 'rejected' ? 'Rejected' : isAccepted ? 'Remove' : 'Reject'}
              </Text>
            </Pressable>
          </View>

          <ConfirmDialog
            visible={confirming !== null}
            icon={confirming === 'rejected' ? 'account-remove-outline' : 'account-clock-outline'}
            tone={confirming === 'rejected' ? 'destructive' : 'default'}
            title={
              confirming === 'rejected'
                ? `Remove ${name} from the roster?`
                : `Move ${name} to the waitlist?`
            }
            message={
              confirming === 'rejected'
                ? 'They were told they are confirmed and have this event on their schedule. They will be told it has changed, and their place frees up for the waitlist.'
                : 'They were told they are confirmed. They will be told they are back on the waitlist, and their place frees up for whoever is next.'
            }
            confirmLabel={confirming === 'rejected' ? 'Remove them' : 'Move them'}
            cancelLabel="Leave them"
            onConfirm={() => {
              const next = confirming;
              setConfirming(null);
              if (next) onDecide(next);
            }}
            onCancel={() => setConfirming(null)}
          />
        </>
      )}

      {isPending ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
          <Text style={styles.statusText}>Updating...</Text>
        </View>
      ) : null}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  identity: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  name: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  location: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  matchRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  skillChipMatched: {
    borderWidth: 1,
    borderColor: colors.success,
  },
  skillIcon: {
    marginRight: 2,
  },
  skillLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  skillLabelMatched: {
    color: colors.success,
  },
  moreSkills: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  // Real separation from the buttons it explains, and from the block above it.
  // A note jammed against the row it qualifies reads as a caption on the first
  // button rather than as a statement about the applicant.
  settledNote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: spacing.base,
    marginBottom: spacing.xs,
  },
  withdrawn: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.base,
  },
  motivation: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  motivationLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  motivationText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 36,
    marginTop: spacing.xs,
  },
  profileLinkText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.primary,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  acceptButton: {
    backgroundColor: colors.navy,
  },
  acceptText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.white,
  },
  waitlistButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  waitlistText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  rejectButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  rejectText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.danger,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  statusText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.sm,
  },
});
