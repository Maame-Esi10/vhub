import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface EditSectionCardProps {
  icon: IconName;
  title: string;
  /** Optional coral action on the right of the header, e.g. "ADD NEW". */
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}

/**
 * The bordered, white section card used down the Edit Profile screens —
 * coral icon, small letterspaced uppercase title, optional right-hand
 * action. Taken from design-refs/Edit Profile.png, which groups the form
 * into PROFESSIONAL IDENTITY / CLINICAL EXPERTISE / WEEKLY AVAILABILITY
 * cards rather than one flat column of fields.
 */
export function EditSectionCard({
  icon,
  title,
  actionLabel,
  onAction,
  children,
}: EditSectionCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.primary} />
        <Text style={styles.title}>{title}</Text>
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            hitSlop={12}
            style={styles.action}
          >
            <MaterialCommunityIcons name="plus-circle" size={14} color={colors.primary} />
            <Text style={styles.actionLabel}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.primary,
  },
});
