import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { MIN_PASSWORD_LENGTH } from './useAccountSecurity';

/**
 * Getting back into an account whose password has been forgotten.
 *
 * Deliberately separate from useAccountSecurity: that hook changes a password
 * for somebody who is SIGNED IN and can prove they know the current one. This
 * one is for somebody who is signed out and cannot prove anything except that
 * they can read the account's email. They are different problems with
 * different proofs, and conflating them is how an app ends up letting one
 * stand in for the other.
 *
 * ---------------------------------------------------------------------------
 * THE FLOW IS A SIX-DIGIT CODE, NOT A LINK, AND THAT IS A DEPARTURE FROM THE
 * DESIGN.
 *
 * `design-refs/Forgot Password.png` says "Enter your email to receive a
 * recovery link", and one screen is all it draws -- whatever happens after the
 * email arrives was never designed, in either approach.
 *
 * A link would have to reopen the app through a `vhub://` deep link, and the
 * app would then have to pull the tokens out of the URL fragment itself and
 * call setSession. Nothing in this app parses a deep link today: the one other
 * emailed link (the login-email change in useAccountSecurity) is verified
 * entirely on Supabase's side, so the app only has to reopen, not to read
 * anything. Password recovery is different -- the app genuinely needs the
 * session in order to set the new password -- so the link route means new
 * plumbing whose failure modes are all in places we cannot see: a scheme that
 * differs between the dev client and a real build, and Android mail clients
 * that treat custom schemes inconsistently.
 *
 * A code is typed into a screen we control. It works identically in the dev
 * client and in a production build, needs no redirect allowlist, and never
 * leaves the app. The layout the design does specify is unchanged; only the
 * word "link" becomes "code".
 *
 * WHAT THIS COSTS: the Supabase recovery email template must contain
 * `{{ .Token }}`. Supabase's default template only has the link, so until that
 * one line is added the email arrives with no code in it. See
 * docs/REPORT_NOTES.md.
 * ---------------------------------------------------------------------------
 */

/**
 * Sends the recovery email.
 *
 * SUCCEEDS WHETHER OR NOT THE ADDRESS HAS AN ACCOUNT, and the screen says
 * something that is true either way. That is Supabase's behaviour and it is
 * also the behaviour we want: an endpoint that answered differently for a
 * known address would let anybody test whether a particular nurse has signed
 * up here. The same reasoning as /api/document-url's flat 403.
 *
 * Supabase applies its own limit to how often it will send one of these (a
 * handful an hour on the free tier). That error is surfaced as-is rather than
 * softened, because "try again later" is the only honest thing to say and the
 * user needs to know the email is not simply lost.
 */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
    },
  });
}

export interface CompletePasswordResetParams {
  email: string;
  /** The six-digit code from the recovery email. */
  code: string;
  newPassword: string;
}

/**
 * Verifies the code and sets the new password, in that order and as one step.
 *
 * `verifyOtp` creates a real session -- at that instant the person is signed
 * in with the password they have forgotten. The new password is therefore set
 * immediately afterwards in the same mutation, so there is no state in which
 * the app has let somebody in on a recovery code and then left them there.
 *
 * The screen this runs from is inside (auth) but is NOT one of the guard's
 * AUTH_ENTRY_SCREENS (welcome/login/register), so the session appearing
 * mid-flow does not yank the user into their tab group before the password is
 * written. That exclusion already existed for the onboarding wizard, which has
 * exactly the same need.
 *
 * The length rule is checked here as well as on the screen because this hook
 * is the last thing between a typed password and the account: Supabase's own
 * minimum is a project setting, and a client that agrees with it by accident
 * is a client that will disagree with it after somebody changes it.
 */
export function useCompletePasswordReset() {
  return useMutation({
    mutationFn: async ({ email, code, newPassword }: CompletePasswordResetParams) => {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'recovery',
      });
      if (verifyError) {
        // Supabase says "Token has expired or is invalid" for a wrong code, a
        // used code and an expired one alike. Kept as one message on purpose:
        // telling somebody which of the three it was tells a stranger the same
        // thing.
        throw new Error('That code is not valid, or it has expired. Request a new one and try again.');
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
    },
  });
}
