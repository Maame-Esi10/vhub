import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { PASSWORD_RULES, checkPasswordRules, passwordStrength } from '@/lib/password';

export interface PasswordRequirementsProps {
  value: string;
  /**
   * Hide everything until the first keystroke. An empty field showing three
   * red crosses tells somebody off for not having started yet.
   */
  hideWhenEmpty?: boolean;
}

/**
 * The live checklist and strength meter under a new-password field.
 *
 * WHY A CHECKLIST AND NOT JUST A MESSAGE ON SUBMIT. The owner set a password
 * during registration and was told nothing at all — no length rule, no
 * feedback, no meter. An error that only appears after you press the button
 * makes you guess what was wanted and try again; a checklist that ticks itself
 * off as you type answers the question before it is asked, and is the reason
 * this is worth a component rather than a line of validation.
 *
 * The rules come from lib/password.ts, which is also what refuses the submit,
 * so the list can never promise something the form then rejects.
 */
export function PasswordRequirements({ value, hideWhenEmpty = true }: PasswordRequirementsProps) {
  if (hideWhenEmpty && value.length === 0) return null;

  const met = checkPasswordRules(value);
  const strength = passwordStrength(value);
  const allMet = PASSWORD_RULES.every((rule) => met[rule.id]);

  return (
    <View style={styles.container}>
      <View style={styles.rules}>
        {PASSWORD_RULES.map((rule) => {
          const ok = met[rule.id];
          return (
            <View key={rule.id} style={styles.rule}>
              <MaterialCommunityIcons
                name={ok ? 'check-circle' : 'circle-outline'}
                size={15}
                color={ok ? colors.success : colors.textSecondary}
              />
              <Text style={[styles.ruleText, ok && styles.ruleTextMet]}>{rule.label}</Text>
            </View>
          );
        })}
      </View>

      {/*
        The meter appears only once the rules are met. Before that it would be
        a second, competing verdict on the same field — and it would always
        read "Weak", which is discouraging rather than useful when the person
        is three characters into typing.
      */}
      {allMet ? (
        <View style={styles.meterRow}>
          <View style={styles.meterTrack}>
            <View
              style={[
                styles.meterFill,
                strength === 'weak' && styles.meterWeak,
                strength === 'fair' && styles.meterFair,
                strength === 'strong' && styles.meterStrong,
              ]}
            />
          </View>
          <Text style={styles.meterLabel}>
            {strength === 'strong' ? 'Strong' : strength === 'fair' ? 'Fair' : 'Weak'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  rules: {
    gap: spacing.xs,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ruleText: {
    // Shrinks and wraps rather than being squeezed narrower than its own
    // longest word at a large system font size.
    flexShrink: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  ruleTextMet: {
    color: colors.textPrimary,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  meterTrack: {
    flexGrow: 1,
    flexShrink: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  meterWeak: {
    width: '33%',
    backgroundColor: colors.danger,
  },
  meterFair: {
    width: '66%',
    backgroundColor: colors.warning,
  },
  meterStrong: {
    width: '100%',
    backgroundColor: colors.success,
  },
  meterLabel: {
    flexGrow: 0,
    flexShrink: 0,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
