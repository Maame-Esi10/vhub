import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useSignOut } from '@/hooks';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Shared sign-out control for the volunteer and organisation profile
 * screens. Confirms via the in-app ConfirmDialog (never a native Alert —
 * a system popup doesn't match V-HUB's styling), then clears the Supabase
 * session + authStore — useAuthGuard picks up the cleared `user` and
 * redirects to (auth)/welcome.
 */
export function SignOutButton() {
  const { signOut, signingOut } = useSignOut();
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    await signOut();
    // Closing after the await keeps the dialog on screen (with its spinner)
    // for the whole request, so there's no gap where the profile screen is
    // interactive again but the redirect hasn't happened yet.
    setConfirming(false);
  }

  return (
    <>
      <Pressable
        onPress={() => setConfirming(true)}
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

      <ConfirmDialog
        visible={confirming}
        icon="logout"
        tone="destructive"
        title="Sign out of V-HUB?"
        message="You'll need to sign in again to continue."
        confirmLabel="Sign Out"
        cancelLabel="Stay Signed In"
        busy={signingOut}
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(false)}
      />
    </>
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
