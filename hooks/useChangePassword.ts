import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const MIN_PASSWORD_LENGTH = 8;

export interface ChangePasswordParams {
  email: string;
  currentPassword: string;
  newPassword: string;
}

/**
 * Changes the signed-in user's password.
 *
 * Supabase's `updateUser({ password })` does NOT require the current password
 * — a live session is enough. That is a real weakness on a shared or
 * unattended phone: anyone holding an unlocked device with V-HUB open could
 * lock the owner out of their own account. So the current password is verified
 * first by signing in with it, and the change is refused if that fails.
 *
 * `signInWithPassword` on the SAME account the user is already signed into
 * returns a fresh session for that same user, so this neither signs them out
 * nor switches accounts — it is used purely as a proof-of-knowledge check.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async ({
      email,
      currentPassword,
      newPassword,
    }: ChangePasswordParams): Promise<void> => {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      }
      if (newPassword === currentPassword) {
        throw new Error('Your new password must be different from your current one.');
      }

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError) {
        // Deliberately not surfacing Supabase's own wording, which varies with
        // the failure and can read as though the ACCOUNT is wrong rather than
        // the one field the user actually mistyped.
        throw new Error('That current password is not correct.');
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        throw new Error(updateError.message || 'Could not change your password.');
      }
    },
  });
}
