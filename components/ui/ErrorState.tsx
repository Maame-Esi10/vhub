import {
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from './Button';
import { colors, fontFamily, spacing } from '@/constants/theme';

export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  title?: string;
}

/** Shared error treatment: message + Retry action. Used on every data screen. */
export function ErrorState({ message, onRetry, title = 'Something went wrong' }: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.danger} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Button
        title="Retry"
        variant="outline"
        onPress={onRetry}
        accessibilityLabel="Retry"
        style={styles.retry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: spacing.base,
    marginBottom: spacing.xs,
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retry: {
    minWidth: 140,
  },
});
