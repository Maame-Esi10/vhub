import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tone?: 'neutral' | 'danger';
}

/** Small metric tile used on the organisation dashboard's summary grid. */
export function MetricCard({ label, value, icon, tone = 'neutral' }: MetricCardProps) {
  const tint = tone === 'danger' ? colors.danger : colors.primary;
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <MaterialCommunityIcons name={icon} size={16} color={tint} />
      </View>
      <Text style={[styles.value, tone === 'danger' && styles.valueDanger]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    minHeight: 88,
    justifyContent: 'space-between',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  value: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  valueDanger: {
    color: colors.danger,
  },
});
