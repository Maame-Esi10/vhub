import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useSignOut } from '@/hooks';

/**
 * Shared sign-out control for the volunteer and organisation profile
 * screens. Confirms via a native Alert (destructive-adjacent action),
 * then clears the Supabase session + authStore — useAuthGuard picks up
 * the cleared `user` and redirects to (auth)/welcome.
 */
export function SignOutButton() {
  const { signOut, signingOut } = useSignOut();

  function handlePress() {
    Alert.alert('Sign out of V-HUB?', "You'll need to sign in again to continue.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={signingOut}
      accessibilityRole="button"
      accessibilityLabel="Sign out of V-HUB"
      style={({ pressed }) => [styles.button, pressed && styles.pressed, signingOut && styles.disabled]}
    >
      {signingOut ? (
        <ActivityIndicator size="small" color={colors.danger} />
      ) : (
        <MaterialCommunityIcons name="logout" size={18} color={colors.danger} />
      )}
      <Text style={styles.label}>{signingOut ? 'Signing Out…' : 'Sign Out'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 44,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.danger,
  },
});
