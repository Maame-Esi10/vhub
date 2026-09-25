import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, OnboardingStepFooter, OnboardingStepHeader } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { GHANA_REGIONS } from '@/constants/ghana-locations';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { hasSpecialtyStep } from '@/constants/skillEligibility';

const DAYS = [
  { token: 'mon', label: 'M' },
  { token: 'tue', label: 'T' },
  { token: 'wed', label: 'W' },
  { token: 'thu', label: 'T' },
  { token: 'fri', label: 'F' },
  { token: 'sat', label: 'S' },
  { token: 'sun', label: 'S' },
] as const;

const SLOTS = [
  { token: 'morning', label: 'AM' },
  { token: 'afternoon', label: 'PM' },
  { token: 'evening', label: 'EVE' },
] as const;

export default function OnboardingAvailability() {
  const router = useRouter();
  const category = useOnboardingStore((state) => state.category);
  const initialRegion = useOnboardingStore((state) => state.region);
  const initialDistrict = useOnboardingStore((state) => state.district);
  const initialSlots = useOnboardingStore((state) => state.availabilitySlots);
  const setRegion = useOnboardingStore((state) => state.setRegion);
  const setDistrict = useOnboardingStore((state) => state.setDistrict);
  const setAvailabilitySlots = useOnboardingStore((state) => state.setAvailabilitySlots);

  const [region, setLocalRegion] = useState<string | null>(initialRegion);
  const [district, setLocalDistrict] = useState<string | null>(initialDistrict);
  const [slots, setSlots] = useState<Set<string>>(new Set(initialSlots));
  const [regionPickerVisible, setRegionPickerVisible] = useState(false);
  const [districtPickerVisible, setDistrictPickerVisible] = useState(false);

  const districts = useMemo(
    () => GHANA_REGIONS.find((r) => r.name === region)?.districts ?? [],
    [region]
  );

  function toggleSlot(day: string, slot: string) {
    const key = `${day}_${slot}`;
    setSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleContinue() {
    setRegion(region);
    setDistrict(district);
    setAvailabilitySlots(Array.from(slots));
    router.push('/(auth)/verify-identity');
  }

  const canContinue = !!region && !!district;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <OnboardingStepHeader
          title="ONBOARDING"
          onBack={() => (router.canGoBack() ? router.back() : router.replace(
                  hasSpecialtyStep(category) ? '/(auth)/onboarding/specialties' : '/(auth)/onboarding/skills'
                ))}
        />

        <Text style={styles.heading}>Precision Preferences</Text>
        <Text style={styles.subtext}>
          Set your service region and district, then tap the grid to mark exactly when you&apos;re
          free each week.
        </Text>

        <Text style={styles.sectionLabel}>SERVICE AREA</Text>
        <View style={styles.selectRow}>
          <Pressable
            onPress={() => setRegionPickerVisible(true)}
            style={[styles.selectField, styles.selectFieldHalf]}
            accessibilityRole="button"
            accessibilityLabel="Select region"
          >
            <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.selectText, !region && styles.selectPlaceholder]} numberOfLines={1}>
              {region ?? 'Region'}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            onPress={() => region && setDistrictPickerVisible(true)}
            style={[styles.selectField, styles.selectFieldHalf, !region && styles.selectFieldDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Select district"
            disabled={!region}
          >
            <MaterialCommunityIcons name="map-marker-radius-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.selectText, !district && styles.selectPlaceholder]} numberOfLines={1}>
              {district ?? 'District'}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, styles.gridLabel]}>WEEKLY SCHEDULE</Text>
        <Text style={styles.gridHint}>Tap blocks to select the times you&apos;re available.</Text>

        <View style={styles.grid}>
          <View style={styles.gridHeaderRow}>
            <View style={styles.gridSlotLabel} />
            {DAYS.map((day) => (
              <Text key={day.token} style={styles.gridDayLabel}>
                {day.label}
              </Text>
            ))}
          </View>
          {SLOTS.map((slot) => (
            <View key={slot.token} style={styles.gridRow}>
              <Text style={styles.gridSlotLabel}>{slot.label}</Text>
              {DAYS.map((day) => {
                const key = `${day.token}_${slot.token}`;
                const active = slots.has(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => toggleSlot(day.token, slot.token)}
                    style={[styles.gridCell, active && styles.gridCellActive]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`${day.token} ${slot.token}`}
                  />
                );
              })}
            </View>
          ))}
        </View>

        <Button
          title="Complete Profile"
          variant="solid"
          disabled={!canContinue}
          onPress={handleContinue}
          style={styles.continueButton}
        />
        <OnboardingStepFooter
          step={hasSpecialtyStep(category) ? 4 : 3}
          total={hasSpecialtyStep(category) ? 5 : 4}
          section="Availability and Region"
        />
      </ScrollView>

      <Modal
        visible={regionPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRegionPickerVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setRegionPickerVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Region</Text>
            <ScrollView style={styles.modalScroll}>
              {GHANA_REGIONS.map((r) => (
                <Pressable
                  key={r.name}
                  onPress={() => {
                    setLocalRegion(r.name);
                    setLocalDistrict(null);
                    setRegionPickerVisible(false);
                  }}
                  style={styles.modalOption}
                >
                  <Text style={styles.modalOptionText}>{r.name}</Text>
                  {region === r.name ? (
                    <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={districtPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDistrictPickerVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDistrictPickerVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>District</Text>
            <ScrollView style={styles.modalScroll}>
              {districts.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => {
                    setLocalDistrict(d);
                    setDistrictPickerVisible(false);
                  }}
                  style={styles.modalOption}
                >
                  <Text style={styles.modalOptionText}>{d}</Text>
                  {district === d ? (
                    <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  subtext: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  selectRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.base,
  },
  selectFieldHalf: {
    flex: 1,
  },
  selectFieldDisabled: {
    opacity: 0.5,
  },
  selectText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  selectPlaceholder: {
    color: colors.textSecondary,
  },
  gridLabel: {
    marginTop: spacing.xl,
  },
  gridHint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.base,
  },
  grid: {
    marginBottom: spacing.base,
  },
  gridHeaderRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  gridDayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  gridSlotLabel: {
    width: 32,
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  gridCell: {
    flex: 1,
    height: 32,
    marginHorizontal: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  gridCellActive: {
    backgroundColor: colors.primary,
  },
  continueButton: {
    marginTop: spacing.base,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 11, 15, 0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '70%',
  },
  modalTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  modalScroll: {
    maxHeight: 360,
  },
  modalOption: {
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
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalOptionText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },
});
