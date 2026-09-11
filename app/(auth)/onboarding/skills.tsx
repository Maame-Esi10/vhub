import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Button,
  CategoryChecklist,
  Input,
  OnboardingStepFooter,
  OnboardingStepHeader,
} from '@/components/ui';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { SKILL_CATEGORIES } from '@/constants/skills';
import { useOnboardingStore } from '@/stores/onboardingStore';

interface SkillSection {
  title: string;
  icon: string;
  data: string[];
}

const SECTIONS: SkillSection[] = SKILL_CATEGORIES.map((category) => ({
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

  const sections = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return SECTIONS;
    return SECTIONS.map((section) => ({
      ...section,
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

        {/*
          With ninety skills across nine categories, the two things a volunteer
          wants to know while scrolling are how many they have already picked
          and whether their search found anything at all.
        */}
        <Text style={styles.selectionCount}>
          {selected.size} selected
          {query.trim()
            ? ` · ${sections.reduce((sum, section) => sum + section.data.length, 0)} match "${query.trim()}"`
            : ''}
        </Text>

        {/*
          The same collapsible category cards the picker uses, from the same
          component. This screen had its own flat SectionList before, which is
          how two screens that should look identical stop looking identical.
        */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {sections.length === 0 ? (
            <Text style={styles.noMatches}>
              Nothing matches &quot;{query.trim()}&quot;. Try a shorter word.
            </Text>
          ) : null}

          <CategoryChecklist
            sections={sections}
            selected={selected}
            onToggle={toggleSkill}
            searching={query.trim().length > 0}
          />
        </ScrollView>

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
  selectionCount: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  noMatches: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    paddingVertical: spacing.xl,
    textAlign: 'center',
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
  continueButton: {
    marginTop: spacing.sm,
  },
});
