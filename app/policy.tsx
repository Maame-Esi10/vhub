import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FilterChips, ScreenHeader } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  PRIVACY_SECTIONS,
  PRIVACY_UPDATED,
  TERMS_SECTIONS,
  type PolicySection,
} from '@/constants/policy';

/**
 * The privacy policy and the terms, in one screen with two tabs.
 *
 * OUTSIDE EVERY ROLE GROUP, deliberately — the same placement as
 * app/offline.tsx. All three roles need it, and it is reached from three
 * different Settings screens and from the credential consent block; three
 * copies of the same route inside three groups would be three things to keep
 * in step for no gain.
 *
 * `?tab=terms` opens on the terms, so a link that means "read the terms" lands
 * there rather than on the privacy policy with an instruction to scroll.
 *
 * NO FIGMA DESIGN EXISTS. It reuses the Info Hub's language: a heading, a
 * paragraph, generous spacing, nothing decorative.
 */
type Tab = 'privacy' | 'terms';

export default function Policy() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [active, setActive] = useState<Tab>(tab === 'terms' ? 'terms' : 'privacy');

  const sections = active === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title={active === 'privacy' ? 'Privacy' : 'Terms'} fallback="/" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <FilterChips
          options={[
            { value: 'privacy', label: 'Privacy' },
            { value: 'terms', label: 'Terms' },
          ]}
          value={active}
          onChange={setActive}
        />

        {active === 'privacy' ? (
          <View style={styles.highlight}>
            <MaterialCommunityIcons name="map-marker-off-outline" size={22} color={colors.primary} />
            <Text style={styles.highlightText}>
              VHub reads your location once, at the moment you scan to check in, only to compare it
              with where the event is. The coordinates are never stored, and there is no record of
              where you have been.
            </Text>
          </View>
        ) : null}

        {sections.map((section) => (
          <Section key={section.heading} section={section} />
        ))}

        <Text style={styles.updated}>Last updated {PRIVACY_UPDATED}.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ section }: { section: PolicySection }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{section.heading}</Text>
      {section.paragraphs.map((paragraph) => (
        <Text key={paragraph} style={styles.paragraph}>
          {paragraph}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  highlight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
  },
  highlightText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  section: { gap: spacing.md },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 17, color: colors.textPrimary },
  paragraph: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  updated: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
});
