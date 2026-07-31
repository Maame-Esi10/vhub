import { useState, type ReactNode } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

// Collapsing a section without this is an instant jump on Android.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface InfoSectionProps {
  icon: IconName;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Collapsible explainer card shared by the volunteer and organisation Info
 * Hubs. Extracted from the volunteer hub so the two screens cannot drift
 * apart visually — the organisation hub is explicitly meant to be the same
 * screen told from the other side of the match.
 */
export function InfoSection({
  icon,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: InfoSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen((value) => !value);
        }}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
      >
        <View style={styles.sectionIcon}>
          <MaterialCommunityIcons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={colors.textSecondary}
        />
      </Pressable>

      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

/** Body paragraph inside an InfoSection. */
export function InfoBody({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

/** Bold lead-in above a group of rows. */
export function InfoSubheading({ children }: { children: ReactNode }) {
  return <Text style={styles.subheading}>{children}</Text>;
}

/**
 * Numbered pill + label + explanation. `tone="penalty"` switches the pill
 * from coral to red for negative values.
 */
export function InfoWeightRow({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: 'default' | 'penalty';
}) {
  const penalty = tone === 'penalty';
  return (
    <View style={styles.weightRow}>
      <View style={[styles.weightPill, penalty && styles.penaltyPill]}>
        <Text style={[styles.weightPillText, penalty && styles.penaltyPillText]}>{value}</Text>
      </View>
      <View style={styles.weightText}>
        <Text style={styles.weightLabel}>{label}</Text>
        <Text style={styles.weightDetail}>{detail}</Text>
      </View>
    </View>
  );
}

/** Left label / right value row, divided by a hairline. */
export function InfoBandRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.bandRow}>
      <Text style={styles.bandName}>{label}</Text>
      <Text style={styles.bandRange}>{value}</Text>
    </View>
  );
}

/** Tinted aside for a caveat worth pulling out of the body copy. */
export function InfoCallout({ icon = 'information-outline', children }: { icon?: IconName; children: ReactNode }) {
  return (
    <View style={styles.callout}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.textSecondary} />
      <Text style={styles.calloutText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
  },
  pressed: {
    opacity: 0.8,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionBody: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  subheading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  weightRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  weightPill: {
    minWidth: 36,
    height: 26,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
  },
  weightPillText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: colors.primary,
  },
  penaltyPill: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  penaltyPillText: {
    color: colors.danger,
  },
  weightText: {
    flex: 1,
  },
  weightLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  weightDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bandName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  bandRange: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  callout: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  calloutText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
});
