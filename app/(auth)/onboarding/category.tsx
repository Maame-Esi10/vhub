import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Button, OnboardingStepFooter, OnboardingStepHeader } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import type { VolunteerCategory } from '@/types/database';
import { useOnboardingStore } from '@/stores/onboardingStore';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface CategoryCard {
  value: VolunteerCategory;
  label: string;
  description: string;
  icon: IconName;
}

const CATEGORY_CARDS: CategoryCard[] = [
  {
    value: 'nurse',
    label: 'Nurse',
    description: 'Registered or practicing nurse providing clinical care.',
    icon: 'hospital-box-outline',
  },
  {
    value: 'pharmacy_student',
    label: 'Pharmacy Student',
    description: 'Currently studying pharmacy or pharmaceutical sciences.',
    icon: 'pill',
  },
  {
    value: 'first_aider',
    label: 'First Aider',
    description: 'Trained in first aid and emergency response support.',
    icon: 'medical-bag',
  },
  {
    value: 'doctor',
    label: 'Doctor',
    description: 'Licensed medical doctor or physician.',
    icon: 'stethoscope',
  },
  {
    value: 'midwife',
    label: 'Midwife',
    description: 'Licensed midwife providing maternal and newborn care.',
    icon: 'baby-face-outline',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Other healthcare-adjacent skills or general support.',
    icon: 'account-outline',
  },
];

export default function OnboardingCategory() {
  const router = useRouter();
  const setCategory = useOnboardingStore((state) => state.setCategory);
  const initialCategory = useOnboardingStore((state) => state.category);
  const [selected, setSelected] = useState<VolunteerCategory | null>(initialCategory);

  function handleContinue() {
    if (!selected) return;
    setCategory(selected);
    router.push('/(auth)/onboarding/specialties');
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <OnboardingStepHeader
          title="ONBOARDING"
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/onboarding/skills'))}
        />

        <Text style={styles.caption}>PROFESSIONAL BACKGROUND</Text>
        <Text style={styles.heading}>Tell us your background</Text>
        <Text style={styles.subtext}>
          Select the role that best describes your professional expertise in the healthcare
          industry.
        </Text>

        <View style={styles.cardList}>
          {CATEGORY_CARDS.map((card) => {
            const isSelected = selected === card.value;
            return (
              <Pressable
                key={card.value}
                onPress={() => setSelected(card.value)}
                style={[styles.card, isSelected && styles.cardSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
              >
                <View style={[styles.badge, isSelected && styles.badgeSelected]}>
                  <MaterialCommunityIcons
                    name={card.icon}
                    size={22}
                    color={isSelected ? colors.primary : colors.textSecondary}
                  />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{card.label.toUpperCase()}</Text>
                  <Text style={styles.cardDescription}>{card.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Button
          title="Continue to Next Step"
          variant="solid"
          disabled={!selected}
          onPress={handleContinue}
          style={styles.continueButton}
        />
        <OnboardingStepFooter step={2} total={5} section="Professional Background" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  caption: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textPrimary,
    marginTop: spacing.base,
  },
  subtext: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.base,
  },
  cardList: {
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface,
    padding: spacing.base,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSelected: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 0.5,
    color: colors.textPrimary,
  },
  cardDescription: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },
  continueButton: {
    marginTop: spacing.xl,
  },
});
