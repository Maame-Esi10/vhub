import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Input, OnboardingStepFooter, OnboardingStepHeader } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { SPECIALTY_LIMIT, eligibleSpecialties } from '@/constants/skillEligibility';
import { useOnboardingStore } from '@/stores/onboardingStore';

export default function OnboardingSpecialties() {
  const router = useRouter();
  const setSpecialties = useOnboardingStore((state) => state.setSpecialties);
  const initialSpecialties = useOnboardingStore((state) => state.specialties);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSpecialties));
  const [query, setQuery] = useState('');
  const [hitLimit, setHitLimit] = useState(false);
  const category = useOnboardingStore((state) => state.category);
  /*
    A SPECIALTY IS A TRAINING PATH, SO ONLY ROLES THAT TRAIN IN ONE SEE THIS
    STEP (owner, 2026-09-25: "A first aider can't select skills like
    cardiologist"). Everyone else skips from skills straight to availability;
    the redirect below covers anyone who lands here anyway.
  */
  const options = useMemo(() => eligibleSpecialties(category), [category]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return options;
    return options.filter((specialty) => specialty.toLowerCase().includes(trimmed));
  }, [query, options]);

  function toggle(specialty: string) {
    if (selected.has(specialty)) {
      const next = new Set(selected);
      next.delete(specialty);
      setSelected(next);
      setHitLimit(false);
      return;
    }
    if (selected.size >= SPECIALTY_LIMIT) {
      setHitLimit(true);
      return;
    }
    const next = new Set(selected);
    next.add(specialty);
    setSelected(next);
  }

  function proceed(next: string[]) {
    setSpecialties(next);
    router.push('/(auth)/onboarding/availability');
  }

  if (options.length === 0) return <Redirect href="/(auth)/onboarding/availability" />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <OnboardingStepHeader
          title="EXPERT ONBOARDING"
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/onboarding/skills'))}
          trailing={
            <Pressable onPress={() => proceed([])} accessibilityRole="button" accessibilityLabel="Skip this step">
              <Text style={styles.skip}>SKIP</Text>
            </Pressable>
          }
        />

        <View style={styles.headingRow}>
          <Text style={styles.heading}>Precision Preferences</Text>
        </View>
        <Text style={styles.caption}>CLINICAL SPECIALTY SELECTION</Text>
        <Text style={styles.limitNote}>
          Optional. Choose up to {SPECIALTY_LIMIT} you have trained in ({selected.size} of{' '}
          {SPECIALTY_LIMIT} chosen).
        </Text>
        {hitLimit ? (
          <Text style={styles.limitError}>
            You have chosen {SPECIALTY_LIMIT}, the most allowed. Remove one to add another.
          </Text>
        ) : null}

        <Input
          placeholder="Search clinical specialties..."
          value={query}
          onChangeText={setQuery}
          leadingIcon={<MaterialCommunityIcons name="magnify" size={18} color={colors.textSecondary} />}
          containerStyle={styles.search}
        />

        <FlatList
          data={filtered}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = selected.has(item);
            return (
              <Pressable
                onPress={() => toggle(item)}
                style={[styles.row, isSelected && styles.rowSelected]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
              >
                <View style={styles.rowLeading}>
                  <View style={[styles.badge, isSelected && styles.badgeSelected]}>
                    <MaterialCommunityIcons
                      name="medical-bag"
                      size={16}
                      color={isSelected ? colors.primary : colors.textSecondary}
                    />
                  </View>
                  <Text style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}>{item}</Text>
                </View>
                <MaterialCommunityIcons
                  name={isSelected ? 'check-circle' : 'checkbox-blank-circle-outline'}
                  size={20}
                  color={isSelected ? colors.primary : colors.border}
                />
              </Pressable>
            );
          }}
        />

        <Button
          title="Confirm Selections"
          variant="solid"
          onPress={() => proceed(Array.from(selected))}
          style={styles.confirmButton}
        />
        <OnboardingStepFooter step={3} total={5} section="Clinical Specialty Selection" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  limitNote: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  limitError: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  skip: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.primary,
  },
  headingRow: {
    marginTop: spacing.sm,
  },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.base,
  },
  search: {
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.base,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',

    // alignItems centres children within their line; alignContent places
    // the line itself, and defaults to flex-start. Without it a wrapping row
    // pins its single line to the TOP of the box.
    alignContent: 'center',
    justifyContent: 'space-between',
    // Wraps instead of clipping when the row outgrows its width at a large
    // system font size. rowGap only applies between wrapped lines, so a row
    // that still fits on one is unaffected.
    flexWrap: 'wrap',
    rowGap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.xs,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
  },
  rowLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSelected: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
  },
  rowLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowLabelSelected: {
    color: colors.primary,
    fontFamily: fontFamily.semiBold,
  },
  confirmButton: {
    marginTop: spacing.sm,
  },
});
