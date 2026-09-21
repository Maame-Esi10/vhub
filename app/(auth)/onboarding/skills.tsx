import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Button,
  Input,
  OnboardingStepFooter,
  OnboardingStepHeader,
  RoleTypeExplainer,
} from '@/components/ui';
import { SkillPicker, type SkillGroup } from '@/components/onboarding/SkillPicker';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { SKILL_CATEGORIES, companionSkills } from '@/constants/skills';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { SkillSuggestBox } from '@/components/skills/SkillSuggestBox';
import type { SkillSuggestion } from '@/hooks/useSuggestSkills';

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
  /*
    THE SUGGESTION AND WHAT KIND IT IS ARE ONE PIECE OF STATE.

    Held together because the heading above the chips depends on both: a list
    of skills with no record of where it came from is exactly what let
    "Recommended for you" sit above five generic support skills that nothing
    had read.
  */
  const [suggestion, setSuggestion] = useState<SkillSuggestion | null>(null);

  // Opens on the category the volunteer already has something in, so returning
  // to this step shows their own answers rather than the first card.
  const [activeGroup, setActiveGroup] = useState<string>(() => {
    const withSelection = GROUPS.find((group) =>
      group.data.some((skill) => initialSkillTags.includes(skill))
    );
    return withSelection?.title ?? GROUPS[0]?.title ?? '';
  });

  const groups = useMemo(() => {
    /*
      RECOMMENDED GOES ON TOP; NOTHING IS TAKEN AWAY. The nine real categories
      follow untouched, so one sentence can never narrow what this volunteer is
      able to find -- and their skills are what the matcher reads, so a
      narrowed profile is a narrowed feed for as long as it stands.

      It also respects the search: a recommendation that does not match what is
      being typed would sit at the top contradicting the query.
    */
    const trimmed = query.trim().toLowerCase();
    const base = trimmed
      ? GROUPS.map((group) => ({
          ...group,
          data: group.data.filter((skill) => skill.toLowerCase().includes(trimmed)),
        })).filter((group) => group.data.length > 0)
      : GROUPS;

    /*
      Derived INSIDE the memo, not above it. `suggestion?.skills ?? []` builds
      a new array on every render, so as a dependency it changed every time and
      the memo never memoised anything.
    */
    const suggested = suggestion?.skills ?? [];
    const shortlist = trimmed
      ? suggested.filter((skill) => skill.toLowerCase().includes(trimmed))
      : suggested;

    /*
      COMPANIONS NEED NO GEMINI. Somebody who ticks three skills is usually not
      less capable than somebody who ticks twenty -- they read the list,
      recognised the three they would say out loud, and stopped. The rest goes
      unticked because nothing prompted them. constants/skills.ts holds the
      sets that genuinely travel together at an outreach, so this works
      offline, spends no quota and cannot invent anything.

      Gemini's shortlist comes first when there is one: it read what this
      person actually wrote, which is better evidence than what they have
      ticked so far.
    */
    const companions = companionSkills(Array.from(selected)).filter(
      (skill) => !shortlist.includes(skill) && (!trimmed || skill.toLowerCase().includes(trimmed))
    );

    const extras: SkillGroup[] = [];
    /*
      THE TWO SUGGESTION GROUPS SAY WHERE THEY CAME FROM (owner, 2026-09-21:
      "are the recommended based on what I entered or general recommendations?
      make a clear distinction" and "when i choose 2 skills, theres now an
      often chosen together... whats going on").

      Three different things can put a skill at the top of this list and they
      were all unlabelled. Gemini reading the sentence you wrote, the universal
      fallback when nothing read it, and a fixed table of skills that travel
      together at a real outreach. Each is useful and each is a different
      claim, so each now names its own basis in the one line under its heading.
    */
    if (shortlist.length > 0) {
      extras.push(
        suggestion?.basis === 'matched'
          ? {
              title: 'From what you wrote',
              icon: 'lightbulb-on-outline',
              data: shortlist,
              note: 'Picked by reading your description. Tap any that fit.',
            }
          : {
              title: 'Every outreach needs these',
              icon: 'account-group-outline',
              data: shortlist,
              note: 'General suggestions, not based on your description. Tap any that fit.',
            }
      );
    }
    if (companions.length > 0) {
      extras.push({
        title: 'Often chosen together',
        icon: 'link-variant',
        data: companions,
        note: 'People who picked what you picked usually do these too. Nothing is added unless you tap it.',
      });
    }

    if (extras.length === 0) return base;
    return [...extras, ...base];
  }, [query, suggestion, selected]);

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
          Pick everything you can offer, clinical or support. You can change this any time.
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
          {/*
            BOTH OF THESE SCROLL AWAY. They belong above the list in reading
            order, and putting them in the fixed header instead would leave a
            seventy-five-entry picker about a third of a screen tall.

            The explainer comes FIRST and before anything is chosen, because
            its job is to stop a volunteer reading "support" as "not for me" and
            ticking only clinical skills -- which is the decision this screen is
            about to ask them to make.
          */}
          {!query.trim() ? (
            <>
              <RoleTypeExplainer audience="volunteer" />
              <View style={styles.explainerGap} />
              <SkillSuggestBox
                editable
                label="Describe what you do"
                placeholder="e.g. I take blood pressure at community clinics"
                onSuggestions={setSuggestion}
              />
            </>
          ) : null}

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
  explainerGap: { height: spacing.lg },
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
