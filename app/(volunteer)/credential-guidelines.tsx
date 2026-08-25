import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { VOLUNTEER_CATEGORIES } from '@/constants/categories';
import {
  CREDENTIAL_GENERAL_RULES,
  CREDENTIAL_GUIDELINES,
} from '@/constants/credential-guidelines';
import { useAuthStore } from '@/stores/authStore';

/**
 * What to send, and what makes it acceptable.
 *
 * THE VOLUNTEER'S OWN CATEGORY LEADS, and the rest are below it. A volunteer
 * opening this has one document to send, not seven; making them find their
 * profession in an alphabetical list is a small rudeness repeated on every
 * visit. The others stay on the page because categories can be changed, and
 * because somebody deciding what to claim needs to see what each one costs.
 *
 * NO REAL OR SAMPLE CREDENTIAL IMAGES. The brief says so and it is right: a
 * sample licence is either somebody's real one, or a forgery template with our
 * name on it. The illustrations here are generic icons.
 */
export default function CredentialGuidelines() {
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);
  const myCategory = volunteerProfile?.category ?? null;

  const ordered = myCategory
    ? [
        ...VOLUNTEER_CATEGORIES.filter((entry) => entry.value === myCategory),
        ...VOLUNTEER_CATEGORIES.filter((entry) => entry.value !== myCategory),
      ]
    : VOLUNTEER_CATEGORIES;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="What to send" fallback="/(volunteer)/verify-identity" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Verification is one document and one look at it by a person. These are the things that
          decide whether that look takes a minute or sends you back to try again.
        </Text>

        <Text style={styles.sectionHeading}>True of every document</Text>
        <View style={styles.rulesCard}>
          {CREDENTIAL_GENERAL_RULES.map((rule) => (
            <View key={rule.text} style={styles.ruleRow}>
              <MaterialCommunityIcons
                name={rule.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                size={18}
                color={colors.primary}
              />
              <Text style={styles.ruleText}>{rule.text}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionHeading}>By what you do</Text>

        {ordered.map((entry) => {
          const guideline = CREDENTIAL_GUIDELINES[entry.value];
          const mine = entry.value === myCategory;

          return (
            <View key={entry.value} style={[styles.categoryCard, mine && styles.categoryCardMine]}>
              <View style={styles.categoryHeader}>
                <View style={[styles.iconCircle, mine && styles.iconCircleMine]}>
                  <MaterialCommunityIcons
                    name={guideline.icon}
                    size={20}
                    color={mine ? colors.white : colors.primary}
                  />
                </View>
                <Text style={styles.categoryName}>{entry.label}</Text>
                {mine ? <Text style={styles.yoursTag}>Yours</Text> : null}
              </View>

              <Text style={styles.categoryWhat}>{guideline.what}</Text>
              <Text style={styles.categoryAccepted}>{guideline.accepted}</Text>
            </View>
          );
        })}

        <View style={styles.footerCard}>
          <Text style={styles.footerText}>
            If the only document you hold does not match any of these, send it anyway and say what it
            is. A reviewer would rather read an unusual document than refuse somebody who is genuinely
            qualified.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  intro: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
    marginTop: spacing.base,
  },
  sectionHeading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  rulesCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    gap: spacing.base,
  },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  ruleText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  categoryCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  categoryCardMine: { borderColor: colors.primary, backgroundColor: colors.surfaceSubtle },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  iconCircleMine: { backgroundColor: colors.primary },
  categoryName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.textPrimary },
  yoursTag: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  categoryWhat: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  categoryAccepted: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  footerCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
  },
  footerText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
});
