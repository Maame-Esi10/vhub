import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Input, OnboardingStepFooter, OnboardingStepHeader } from '@/components/ui';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { SKILL_CATEGORIES } from '@/constants/skills';
import { useOnboardingStore } from '@/stores/onboardingStore';

interface SkillSection {
  title: string;
  data: string[];
}

const SECTIONS: SkillSection[] = SKILL_CATEGORIES.map((category) => ({
  title: category.name,
  data: category.skills,
}));

export default function OnboardingSkills() {
  const router = useRouter();
  const setSkillTags = useOnboardingStore((state) => state.setSkillTags);
  const initialSkillTags = useOnboardingStore((state) => state.skillTags);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSkillTags));
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return SECTIONS;
    return SECTIONS.map((section) => ({
      title: section.title,
      data: section.data.filter((skill) => skill.toLowerCase().includes(trimmed)),
    })).filter((section) => section.data.length > 0);
  }, [query]);

  function toggleSkill(skill: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) {
        next.delete(skill);
      } else {
        next.add(skill);
      }
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
          Select every healthcare or support skill you can offer. This helps V-HUB match you with
          missions where you can make the biggest impact.
        </Text>

        <Input
          placeholder="Search skills..."
          value={query}
          onChangeText={setQuery}
          leadingIcon={<MaterialCommunityIcons name="magnify" size={18} color={colors.textSecondary} />}
          containerStyle={styles.search}
        />

        <SectionList
          sections={sections}
          keyExtractor={(item) => item}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowLeading}>
                <MaterialCommunityIcons name="checkbox-blank-circle-outline" size={18} color={colors.primary} />
                <Text style={styles.rowLabel}>{item}</Text>
              </View>
              <Switch
                value={selected.has(item)}
                onValueChange={() => toggleSkill(item)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>
          )}
        />

        <Button title="Continue" variant="solid" onPress={handleContinue} style={styles.continueButton} />
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
  search: {
    marginBottom: spacing.sm,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.base,
  },
  sectionHeader: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginTop: spacing.base,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.xs,
  },
  rowLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  rowLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  continueButton: {
    marginTop: spacing.sm,
  },
});
