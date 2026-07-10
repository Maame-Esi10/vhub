import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Input, OnboardingStepFooter, OnboardingStepHeader } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { MEDICAL_SPECIALTIES } from '@/constants/specialties';
import { useOnboardingStore } from '@/stores/onboardingStore';

export default function OnboardingSpecialties() {
  const router = useRouter();
  const setSpecialties = useOnboardingStore((state) => state.setSpecialties);
  const initialSpecialties = useOnboardingStore((state) => state.specialties);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSpecialties));
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return MEDICAL_SPECIALTIES;
    return MEDICAL_SPECIALTIES.filter((specialty) => specialty.toLowerCase().includes(trimmed));
  }, [query]);

  function toggle(specialty: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(specialty)) {
        next.delete(specialty);
      } else {
        next.add(specialty);
      }
      return next;
    });
  }

  function proceed(next: string[]) {
    setSpecialties(next);
    router.push('/(auth)/onboarding/availability');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <OnboardingStepHeader
          title="EXPERT ONBOARDING"
          onBack={() => router.back()}
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
    justifyContent: 'space-between',
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
