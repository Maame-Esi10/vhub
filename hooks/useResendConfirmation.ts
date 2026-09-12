import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Asks Supabase to send the signup confirmation email again.
 *
 * WHY THIS EXISTS. The "Check your email" screen was a dead end: if the
 * message did not arrive there was no way forward from inside the app and no
 * way back into the account, because an unconfirmed address cannot log in.
 * The only remaining move was to register again with the same address, which
 * Supabase refuses. One button is the whole fix.
 *
 * IT REVEALS NOTHING, deliberately, and reports success either way — the same
 * rule the password-reset flow follows. `resend` fails for an address that is
 * already confirmed as well as for one that does not exist, and distinguishing
 * those in the UI would tell a stranger which addresses hold accounts. The one
 * error worth surfacing is a rate limit, because "wait a moment and try again"
 * is advice the person can actually act on.
 */
export function useResendConfirmation() {
  return useMutation({
    mutationFn: async (email: string): Promise<void> => {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });

      if (error && /rate|too many|seconds/i.test(error.message)) {
        throw new Error('Too many requests just now. Wait a minute and try again.');
      }
      // Every other outcome is reported as sent. See above.
    },
  });
}
