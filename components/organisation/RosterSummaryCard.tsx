import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { SkillCoverage } from '@/lib/roster';

export interface RosterSummaryCardProps {
  /**
   * The role this card is for, on a multi-role outreach. Null in single-role
   * mode, where the card covers the whole outreach and needs no name.
   */
  roleTitle?: string | null;
  slotsFilled: number;
  slotsTotal: number;
  pendingCount: number;
  waitlistedCount: number;
  coverage: SkillCoverage;
  /** How many the one-tap action would accept. Zero hides the button. */
  acceptCount: number;
  /** How many the same tap would move onto the waitlist. */
  waitlistCount: number;
  /** How many are past the waitlist cap and stay pending. */
  leftPendingCount: number;
  onAcceptTop: () => void;
  isPending: boolean;
}

/**
 * The organisation's at-a-glance answer to "where does this roster stand, and
 * what happens if I tap the button?"
 *
 * Two things sit here that deliberately do not sit on the individual applicant
 * cards. Slot progress is a property of the event, not of any one applicant;
 * and skill coverage is a property of the TEAM — the one question a per-person
 * match score structurally cannot answer, since ten individually excellent
 * volunteers can still leave a required skill uncovered. Putting coverage
 * directly above the batch button is the point: it is the check an organiser
 * should make before accepting ten people by score alone.
 */
export function RosterSummaryCard({
  roleTitle,
  slotsFilled,
  slotsTotal,
  pendingCount,
  waitlistedCount,
  coverage,
  acceptCount,
  waitlistCount,
  leftPendingCount,
  onAcceptTop,
  isPending,
}: RosterSummaryCardProps) {
  const freeSlots = Math.max(0, slotsTotal - slotsFilled);
  const fillRatio = slotsTotal > 0 ? Math.min(1, slotsFilled / slotsTotal) : 0;
  const isFull = freeSlots === 0;
  const oversubscribed = pendingCount > freeSlots;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{roleTitle ?? 'Roster'}</Text>
        <Text style={styles.slots}>
          {slotsFilled} of {slotsTotal} filled
        </Text>
      </View>

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={`${slotsFilled} of ${slotsTotal} slots filled`}
      >
        <View style={[styles.fill, { width: `${fillRatio * 100}%` }, isFull && styles.fillComplete]} />
      </View>

      <View style={styles.countsRow}>
        <Text style={styles.count}>
          {pendingCount} pending · {waitlistedCount} waitlisted
        </Text>
        {isFull ? <Text style={styles.fullTag}>Full</Text> : null}
      </View>

      {coverage.required.length > 0 ? (
        <View style={styles.coverage}>
          <View style={styles.coverageHeader}>
            <Text style={styles.coverageLabel}>Skill coverage</Text>
            <Text style={styles.coverageCount}>
              {coverage.covered.length} of {coverage.required.length}
            </Text>
          </View>
          {/*
            Every required skill is listed, covered or not, rather than only the
            gaps. An organiser needs to see what the confirmed roster can
            actually do, not just what it is missing.
          */}
          <View style={styles.skillsRow}>
            {coverage.required.map((skill) => {
              const covered = coverage.covered.includes(skill);
              return (
                <View key={skill} style={[styles.skillChip, covered ? styles.skillCovered : styles.skillMissing]}>
                  <MaterialCommunityIcons
                    name={covered ? 'check-circle' : 'alert-circle-outline'}
                    size={11}
                    color={covered ? colors.success : colors.warning}
                  />
                  <Text style={[styles.skillLabel, covered ? styles.skillLabelCovered : styles.skillLabelMissing]}>
                    {skill}
                  </Text>
                </View>
              );
            })}
          </View>
          {coverage.missing.length > 0 ? (
            <Text style={styles.coverageHint}>
              No confirmed volunteer covers{' '}
              {coverage.missing.length === 1 ? 'this skill' : `these ${coverage.missing.length} skills`} yet.
            </Text>
          ) : null}
        </View>
      ) : null}

      {oversubscribed ? (
        <View style={styles.oversubscribed}>
          <MaterialCommunityIcons name="account-multiple-plus-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.oversubscribedText}>
            {pendingCount} {pendingCount === 1 ? 'volunteer wants' : 'volunteers want'}{' '}
            {freeSlots === 0 ? 'a place on a full roster' : `${freeSlots} remaining ${freeSlots === 1 ? 'slot' : 'slots'}`}.
          </Text>
        </View>
      ) : null}

      {roleTitle && pendingCount === 0 && waitlistedCount === 0 && slotsFilled === 0 ? (
        <Text style={styles.emptyRole}>Nobody has applied for this role yet.</Text>
      ) : null}

      {acceptCount > 0 || waitlistCount > 0 ? (
        <>
          <Pressable
            onPress={onAcceptTop}
            disabled={isPending}
            accessibilityRole="button"
            accessibilityLabel={
              acceptCount > 0
                ? `Accept the top ${acceptCount} ranked ${acceptCount === 1 ? 'applicant' : 'applicants'}${roleTitle ? ` for ${roleTitle}` : ''}`
                : `Waitlist the top ${waitlistCount} ranked applicants${roleTitle ? ` for ${roleTitle}` : ''}`
            }
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed, isPending && styles.actionDisabled]}
          >
            {isPending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <MaterialCommunityIcons name="account-check-outline" size={18} color={colors.white} />
                <Text style={styles.actionText}>
                  {acceptCount > 0 ? `Accept top ${acceptCount}` : `Waitlist top ${waitlistCount}`}
                  {roleTitle ? ` · ${roleTitle}` : ''}
                </Text>
              </>
            )}
          </Pressable>
          {/*
            Says what the tap will do BEFORE it happens, including the people it
            will NOT touch. A batch action whose scope is invisible is one an
            organiser cannot consent to.
          */}
          <Text style={styles.actionHint}>
            {[
              acceptCount > 0 ? `Accepts the ${acceptCount} best-ranked` : null,
              waitlistCount > 0 ? `waitlists the next ${waitlistCount}` : null,
              leftPendingCount > 0 ? `leaves ${leftPendingCount} pending` : null,
            ]
              .filter(Boolean)
              .join(', ')}
            . Nobody is rejected.
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // No outer margins. A component does not own the space around it — the
  // screen that places it does, so the same card can sit in a padded list
  // header without double-insetting.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    // Was `border`, which is lighter than the `surface` fill it outlines, so
    // the card looked borderless despite having one.
    borderColor: colors.borderOnSurface,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  slots: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  fillComplete: {
    backgroundColor: colors.success,
  },
  countsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  count: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  fullTag: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.success,
  },
  coverage: {
    marginTop: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  coverageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  coverageLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  coverageCount: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  skillCovered: {
    borderColor: colors.success,
    backgroundColor: colors.background,
  },
  skillMissing: {
    borderColor: colors.warning,
    backgroundColor: colors.background,
  },
  skillLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
  skillLabelCovered: {
    color: colors.success,
  },
  skillLabelMissing: {
    color: colors.warning,
  },
  coverageHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  oversubscribed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.base,
  },
  oversubscribedText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    marginTop: spacing.md,
  },
  actionPressed: {
    opacity: 0.85,
  },
  actionDisabled: {
    opacity: 0.6,
  },
  actionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.white,
  },
  emptyRole: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  actionHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
