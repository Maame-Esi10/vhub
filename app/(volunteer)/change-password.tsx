import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Input, ScreenHeader } from '@/components/ui';
import { MIN_PASSWORD_LENGTH, useChangePassword } from '@/hooks/useChangePassword';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

/**
 * Account Security -> Change Password.
 *
 * No Figma screen exists for this one (design-refs/ has Forgot Password but no
 * change-password), so it reuses the established visual language rather than
 * introducing a new one: ScreenHeader, pill Inputs with a show/hide toggle,
 * solid primary Button — the same composition as the login and edit-profile
 * screens.
 */
export default function ChangePassword() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const changePassword = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const email = profile?.email ?? null;
  const errorMessage = localError ?? changePassword.error?.message ?? null;

  function handleSubmit() {
    setLocalError(null);

    if (!email) {
      setLocalError('No email on file for this account, so the change cannot be verified.');
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      setLocalError('Fill in all three fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError('The two new passwords do not match.');
      return;
    }

    changePassword.mutate(
      { email, currentPassword, newPassword },
      {
        onSuccess: () => {
          // Cleared rather than left on screen: this screen is reachable from
          // Settings and may be backgrounded with the fields still filled.
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setDone(true);
        },
      }
    );
  }

  const revealToggle = (
    <Pressable
      onPress={() => setReveal((prev) => !prev)}
      accessibilityRole="button"
      accessibilityLabel={reveal ? 'Hide passwords' : 'Show passwords'}
      hitSlop={8}
    >
      <MaterialCommunityIcons
        name={reveal ? 'eye-off-outline' : 'eye-outline'}
        size={20}
        color={colors.textSecondary}
      />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Change Password" fallback="/(volunteer)/settings" />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {done ? (
          <View style={styles.successCard}>
            <MaterialCommunityIcons name="check-circle-outline" size={22} color={colors.success} />
            <Text style={styles.successText}>
              Your password has been changed. You&apos;ll use the new one next time you sign in.
            </Text>
          </View>
        ) : null}

        <Text style={styles.intro}>
          Your current password is required, so nobody can change it just by picking up your
          unlocked phone.
        </Text>

        <Input
          label="Current password"
          value={currentPassword}
          onChangeText={(text) => {
            setCurrentPassword(text);
            setDone(false);
          }}
          secureTextEntry={!reveal}
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          trailingElement={revealToggle}
        />

        <Input
          label="New password"
          value={newPassword}
          onChangeText={(text) => {
            setNewPassword(text);
            setDone(false);
          }}
          secureTextEntry={!reveal}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />

        <Input
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={(text) => {
            setConfirmPassword(text);
            setDone(false);
          }}
          secureTextEntry={!reveal}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          error={
            confirmPassword.length > 0 && confirmPassword !== newPassword
              ? 'These do not match.'
              : undefined
          }
        />

        <Text style={styles.hint}>At least {MIN_PASSWORD_LENGTH} characters.</Text>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Button
          title={changePassword.isPending ? 'Changing...' : 'Change password'}
          variant="solid"
          disabled={changePassword.isPending}
          onPress={handleSubmit}
          style={styles.submit}
        />

        {/* replace, not back(): inside a tab group back() lands on Home. */}
        <Pressable onPress={() => router.replace('/(volunteer)/settings')} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </ScrollView>
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
    gap: spacing.md,
  },
  intro: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderRadius: radius.md,
    padding: spacing.base,
  },
  successText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  submit: {
    width: '100%',
    marginTop: spacing.sm,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cancelText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
  },
});
