import { useMutation } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { cancelEmailChange } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';

/**
 * Login credentials — the sign-in email and the password.
 *
 * Deliberately separate from useProfileEditor. That hook edits CONTACT
 * details (who volunteers write to); this one edits CREDENTIALS (what you
 * type to get in). Conflating them is how an app ends up letting a profile
 * edit silently change a login, or showing an address in Settings that no
 * longer opens the account.
 *
 * Nothing here writes to `profiles`. The sign-in address lives on
 * auth.users and moves only through Supabase Auth; profiles.email is a
 * display mirror, synced by syncProfileEmail() below AFTER confirmation.
 */

/**
 * Where Supabase sends the user once they click a confirmation link.
 *
 * Built from the app scheme (`vhub://`, app.json) so the link reopens the app
 * rather than stranding the user on a web page. This URL must also be added
 * to Supabase's redirect allowlist (Authentication -> URL Configuration) or
 * Supabase silently falls back to the project's Site URL.
 */
function emailChangeRedirectUrl(): string {
  return Linking.createURL('/account-security');
}

/**
 * Proves the person holding the device knows the current password.
 *
 * Supabase does NOT require this for either operation -- an active session is
 * enough. That is too weak here: an unlocked, unattended phone would be a
 * complete account takeover, since changing the login email is the one action
 * that locks the real owner out permanently. Re-authenticating costs one round
 * trip and closes that.
 *
 * signInWithPassword on the SAME account is a safe way to check: it either
 * refreshes the session the user already holds, or fails without touching it.
 */
async function reauthenticate(email: string, currentPassword: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (error) {
    throw new Error('That password is not correct.');
  }
}

export interface ChangeLoginEmailParams {
  newEmail: string;
  currentPassword: string;
}

/**
 * Starts a verified change of the sign-in address.
 *
 * The change does NOT take effect here. Supabase emails a confirmation link
 * and, with "Secure email change" enabled, sends one to the OLD address too
 * and requires both -- so a stolen session cannot quietly move the account to
 * an attacker's inbox. Until every link is clicked the old address still
 * signs in, which is what makes this unable to lock anyone out.
 */
export function useChangeLoginEmail() {
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async ({ newEmail, currentPassword }: ChangeLoginEmailParams) => {
      const currentEmail = user?.email;
      if (!currentEmail) throw new Error('You need to be signed in to change your email.');

      const target = newEmail.trim().toLowerCase();
      if (target === currentEmail.toLowerCase()) {
        throw new Error('That is already your login email.');
      }

      await reauthenticate(currentEmail, currentPassword);

      const { error } = await supabase.auth.updateUser(
        { email: target },
        { emailRedirectTo: emailChangeRedirectUrl() }
      );
      if (error) {
        // Supabase's own wording here is user-safe and specific ("A user with
        // this email address has already been registered"), so it is passed
        // through rather than flattened into a generic failure.
        throw new Error(error.message);
      }

      return { pendingEmail: target };
    },
  });
}

export interface ChangePasswordParams {
  currentPassword: string;
  newPassword: string;
}

/**
 * Changes the password, after proving the current one.
 *
 * Unlike the email change this applies immediately -- there is no address to
 * verify, and the session stays valid, so the user is not signed out.
 */
export function useChangePassword() {
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async ({ currentPassword, newPassword }: ChangePasswordParams) => {
      const email = user?.email;
      if (!email) throw new Error('You need to be signed in to change your password.');

      if (newPassword === currentPassword) {
        throw new Error('Your new password must be different from your current one.');
      }

      await reauthenticate(email, currentPassword);

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
    },
  });
}

/**
 * Withdraws a pending email change (e.g. it was sent to a typo'd address).
 *
 * Goes through the serverless API because only the Admin API can clear
 * `new_email`; see api/src/app/api/cancel-email-change/route.ts.
 */
export function useCancelEmailChange() {
  return useMutation({
    mutationFn: async () => cancelEmailChange(),
  });
}

/**
 * Copies the confirmed auth email into profiles.email.
 *
 * Called after the session reports a changed address, never before: running
 * it at request time would make Settings and the org's contact card display
 * an address that does not yet sign in, and would leave them permanently
 * wrong if the user never clicked the link.
 *
 * Best-effort -- a failure here means a stale display value, which must not
 * be allowed to surface as an error on a screen the user did not ask to be
 * on. The next successful sync corrects it.
 */
export async function syncProfileEmail(userId: string, email: string): Promise<void> {
  try {
    await supabase.from('profiles').update({ email }).eq('id', userId);
  } catch {
    // Intentionally swallowed; see doc comment.
  }
}

/** Password rule shared by this screen and the sign-up form. */
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordStrength = 'weak' | 'fair' | 'strong';

/**
 * Cheap, local strength read for the meter. Not a security control -- the
 * only enforced rule is MIN_PASSWORD_LENGTH; this exists to nudge, not block.
 */
export function passwordStrength(value: string): PasswordStrength {
  if (value.length < MIN_PASSWORD_LENGTH) return 'weak';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  if (value.length >= 12 && classes >= 3) return 'strong';
  if (classes >= 2) return 'fair';
  return 'weak';
}
