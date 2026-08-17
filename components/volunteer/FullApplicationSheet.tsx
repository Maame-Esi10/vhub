import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { MatchScoreBadge } from '@/components/volunteer/MatchScoreBadge';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

/** Matches the "Character limit: 300" counter in design-refs/Full Application Form.png. */
export const MOTIVATION_LIMIT = 300;

export interface FullApplicationSheetProps {
  visible: boolean;
  outreachTitle: string;
  /** The volunteer's own skills that the outreach asks for. Read-only. */
  matchingSkills: string[];
  /** Required skills the volunteer does not have — shown so the gap is honest. */
  missingSkills: string[];
  isPending: boolean;
  errorMessage?: string;
  onSubmit: (motivation: string) => void;
  onDismiss: () => void;
}

/**
 * The clinical Full Application form (design-refs/Full Application Form.png).
 *
 * Two deviations from that mockup, both because the underlying data doesn't
 * exist yet:
 *  - "92% MATCH / Clinical Qualification Match" uses the shared placeholder
 *    MatchScoreBadge — nothing scores an application before Phase 3.
 *  - The skill chips are read-only rather than an editable endorsement
 *    picker with "+ ADD". They are derived from the volunteer's saved
 *    skill_tags against the outreach's required_skills; a per-application
 *    skill list has nowhere to be stored in the 6-table schema, and letting
 *    someone hand-assert skills on a clinical application would undercut the
 *    verification gate that guards this form in the first place.
 */
export function FullApplicationSheet({
  visible,
  outreachTitle,
  matchingSkills,
  missingSkills,
  isPending,
  errorMessage,
  onSubmit,
  onDismiss,
}: FullApplicationSheetProps) {
  const [motivation, setMotivation] = useState('');
  const [declarationChecked, setDeclarationChecked] = useState(false);

  const trimmed = motivation.trim();
  const canSubmit = trimmed.length > 0 && declarationChecked && !isPending;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.header}>
              <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textPrimary} />
              </Pressable>
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>PROFESSIONAL APPLICATION</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {outreachTitle}
                </Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionLabel}>CANDIDATE ANALYSIS</Text>
              <MatchScoreBadge />
              <Text style={styles.analysisTitle}>Clinical Qualification Match</Text>
              <Text style={styles.analysisBody}>
                Ranking runs when the matching engine goes live. Until then the organisation reviews
                your application on your saved profile and credentials.
              </Text>

              <View style={styles.divider} />

              <Text style={styles.sectionLabel}>PROFESSIONAL SUMMARY</Text>
              <Text style={styles.fieldLabel}>Statement of Intent</Text>
              <View style={styles.textAreaWrap}>
                <TextAreaInput
                  value={motivation}
                  onChangeText={setMotivation}
                  placeholder="Detail your specific qualifications for this clinical role..."
                />
              </View>
              <View style={styles.counterRow}>
                <Text style={styles.counterHint}>Character limit: {MOTIVATION_LIMIT}</Text>
                <Text style={styles.counter}>
                  {motivation.length} / {MOTIVATION_LIMIT}
                </Text>
              </View>

              <View style={styles.divider} />

              <Text style={styles.sectionLabel}>CORE COMPETENCIES</Text>
              <Text style={styles.fieldLabel}>Relevant skills from your profile</Text>
              {matchingSkills.length > 0 ? (
                <View style={styles.chipRow}>
                  {matchingSkills.map((skill) => (
                    <View key={skill} style={[styles.chip, styles.chipMatched]}>
                      <MaterialCommunityIcons name="check" size={12} color={colors.success} />
                      <Text style={[styles.chipText, styles.chipTextMatched]}>{skill}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.noSkills}>
                  None of your saved skills match what this outreach asks for. You can still apply,
                  add skills from your profile to strengthen future applications.
                </Text>
              )}

              {missingSkills.length > 0 ? (
                <>
                  <Text style={styles.fieldLabelSpaced}>Asked for, not on your profile</Text>
                  <View style={styles.chipRow}>
                    {missingSkills.map((skill) => (
                      <View key={skill} style={styles.chip}>
                        <Text style={styles.chipText}>{skill}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              <View style={styles.divider} />

              <Pressable
                onPress={() => setDeclarationChecked((prev) => !prev)}
                accessibilityRole="checkbox"
                accessibilityLabel="Confirm my credentials are accurate and current"
                accessibilityState={{ checked: declarationChecked }}
                style={styles.declaration}
              >
                <View style={[styles.checkbox, declarationChecked && styles.checkboxChecked]}>
                  {declarationChecked ? (
                    <MaterialCommunityIcons name="check" size={14} color={colors.white} />
                  ) : null}
                </View>
                <Text style={styles.declarationText}>
                  I confirm the credentials and skills on my profile are accurate and current, and
                  that I am fit to perform this clinical role.
                </Text>
              </Pressable>

              {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            </ScrollView>

            <View style={styles.footer}>
              {!declarationChecked || trimmed.length === 0 ? (
                <Text style={styles.footerHint}>
                  {trimmed.length === 0
                    ? 'Write a short statement of intent to continue.'
                    : 'Confirm the declaration to continue.'}
                </Text>
              ) : null}
              <Button
                title={isPending ? 'Submitting...' : 'SUBMIT OFFICIAL APPLICATION'}
                onPress={() => onSubmit(trimmed)}
                disabled={!canSubmit}
                accessibilityLabel="Submit official application"
              />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** Local multiline field — the shared Input primitive is a single-line pill. */
function TextAreaInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      multiline
      maxLength={MOTIVATION_LIMIT}
      textAlignVertical="top"
      style={styles.textArea}
      accessibilityLabel="Statement of intent"
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    // `flex: 1` is load-bearing, not decoration. With only maxHeight the
    // sheet's height was `auto`, so it sized to its content — but its content
    // is a ScrollView, which measures as zero height when its parent is
    // unconstrained. The sheet collapsed and Apply Now showed nothing but the
    // dark backdrop. flex gives it a definite height for the ScrollView to
    // fill; maxHeight then caps it so the outreach behind stays partly
    // visible.
    flex: 1,
    maxHeight: '94%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    letterSpacing: 0.5,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerSpacer: {
    width: 22,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  analysisTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 19,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  analysisBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  fieldLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  fieldLabelSpaced: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  textAreaWrap: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  textArea: {
    minHeight: 120,
    padding: spacing.base,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  counterHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  counter: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  chipMatched: {
    borderColor: colors.success,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextMatched: {
    color: colors.success,
  },
  noSkills: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  declaration: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    minHeight: 44,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  declarationText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.base,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  footerHint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
