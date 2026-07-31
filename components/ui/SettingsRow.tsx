import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface SettingsRowProps {
  icon: IconName;
  label: string;
  /** Muted text shown before the chevron, e.g. a current value or status. */
  value?: string;
  /** Omit to render a read-only status row: no chevron, not pressable. */
  onPress?: () => void;
}

/**
 * One row in a settings group — icon tile, label, optional trailing value,
 * chevron. Matches the row treatment in design-refs/Settings.png.
 *
 * `onPress` is optional so a group can carry a row that only reports state.
 * A row that looks tappable but leads nowhere (or somewhere harmful) is
 * worse than one that plainly doesn't move.
 */
export function SettingsRow({ icon, label, value, onPress }: SettingsRowProps) {
  const content = (
    <>
      <View style={styles.iconTile}>
        <MaterialCommunityIcons name={icon} size={20} color={colors.textPrimary} />
      </View>
      <Text style={styles.label}>{label}</Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {onPress ? (
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

/** Small letterspaced caption above a group of SettingsRows. */
export function SettingsGroupLabel({ children }: { children: string }) {
  return <Text style={styles.groupLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    minHeight: 64,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.8,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  value: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  groupLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
