import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Input, OnboardingStepFooter, OnboardingStepHeader } from '@/components/ui';
import { SkillPicker, type SkillGroup } from '@/components/onboarding/SkillPicker';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { SKILL_CATEGORIES } from '@/constants/skills';
import { useOnboardingStore } from '@/stores/onboardingStore';

const GROUPS: SkillGroup[] = SKILL_CATEGORIES.map((category) => ({
  title: category.name,
  icon: category.icon,
  data: category.skills,
}));

export default function OnboardingSkills() {
  const router = useRouter();
  const setSkillTags = useOnboardingStore((state) => state.setSkillTags);
  const initialSkillTags = useOnboardingStore((state) => state.skillTags);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSkillTags));
  const [query, setQuery] = useState('');

  // Opens on the category the volunteer already has something in, so returning
  // to this step shows their own answers rather than the first card.
  const [activeGroup, setActiveGroup] = useState<string>(() => {
    const withSelection = GROUPS.find((group) =>
      group.data.some((skill) => initialSkillTags.includes(skill))
    );
    return withSelection?.title ?? GROUPS[0]?.title ?? '';
  });

  const groups = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return GROUPS;
    return GROUPS.map((group) => ({
      ...group,
      data: group.data.filter((skill) => skill.toLowerCase().includes(trimmed)),
    })).filter((group) => group.data.length > 0);
  }, [query]);

  const matchCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.data.length, 0),
    [groups]
  );

  function toggleSkill(skill: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });
  }

  function handleContinue() {
    setSkillTags(Array.from(selected));
    router.push('/(auth)/onboarding/category');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <OnboardingStepHeader
          title="ONBOARDING"
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/welcome'))}
        />

        <Text style={styles.heading}>My Expertise</Text>
        <Text style={styles.subtext}>
          Select every healthcare or support skill you can offer. This helps VHub match you with
          missions where you can make the biggest impact.
        </Text>

        <Input
          placeholder="Search skills..."
          value={query}
          onChangeText={setQuery}
          leadingIcon={
            <MaterialCommunityIcons name="magnify" size={18} color={colors.textSecondary} />
          }
          containerStyle={styles.search}
        />

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {query.trim() && groups.length === 0 ? (
            <Text style={styles.noMatches}>
              Nothing matches &quot;{query.trim()}&quot;. Try a shorter word.
            </Text>
          ) : (
            <>
              {query.trim() ? (
                <Text style={styles.matchCount}>
                  {matchCount === 1
                    ? `1 skill matches "${query.trim()}"`
                    : `${matchCount} skills match "${query.trim()}"`}
                </Text>
              ) : null}
              {/*
                ONBOARDING ONLY. The outreach skill picker still uses
                CategoryChecklist and is deliberately untouched — see the
                comment at the top of SkillPicker for why the same list wants a
                different shape when you are being asked what you can do rather
                than searching for something you already have in mind.
              */}
              <SkillPicker
                groups={groups}
                selected={selected}
                onToggle={toggleSkill}
                activeGroup={activeGroup}
                onChangeGroup={setActiveGroup}
                query={query}
              />
            </>
          )}
        </ScrollView>

        <Button
          title="Continue"
          variant="solid"
          onPress={handleContinue}
          style={styles.continueButton}
        />
        <OnboardingStepFooter step={1} total={5} section="Skill Configuration" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  subtext: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.base,
  },
  matchCount: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  noMatches: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    paddingVertical: spacing.xl,
    textAlign: 'center',
  },
  search: {
    marginBottom: spacing.base,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  continueButton: {
    marginTop: spacing.base,
  },
});
