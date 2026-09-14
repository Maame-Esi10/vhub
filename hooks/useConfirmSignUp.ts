import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { isAuthUserMetadata } from '@/lib/auth-metadata';
import { createProfileRowsFromMetadata } from '@/lib/profileRows';

export interface ConfirmSignUpParams {
  email: string;
  /** The six-digit code from the confirmation email. */
  code: string;
}

/**
 * Confirms a new account with a code typed into the app, instead of a link
 * tapped in a mail client.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CODE REPLACED THE LINK AS THE PRIMARY PATH (owner, 2026-09-14).
 *
 * The link route sends a person OUT of V-HUB: mail app -> browser -> landing
 * page -> back to V-HUB by hand -> log in. Five steps across three apps, and
 * the app can see none of them. When it broke, what the owner experienced was
 * a confirmation page that said it had worked, followed by a login that did
 * nothing -- because the failure happened in a part of the journey that has no
 * way to report anything. A flow whose failures are invisible cannot be
 * debugged by the person using it, and that is what made this worth changing
 * rather than patching.
 *
 * The code never leaves the app. Every outcome lands on a screen we control,
 * which means every outcome can say something.
 *
 * IT ALSO REMOVES THE BOOTSTRAP GAMBLE, which is the deeper fix. With the
 * link, `signUp` returns no session, so the profile rows cannot be written at
 * registration; they are written much later, on first login, from metadata
 * stashed on auth.users. If that write fails the person is signed in with no
 * profile and no way forward. `verifyOtp` returns a REAL SESSION at the moment
 * the code is accepted, so the rows are created here, immediately, while
 * somebody is looking at a screen that can report a failure. Same reasoning
 * that puts the password reset's verify and update in one mutation.
 *
 * WHAT IT COSTS: the Supabase "Confirm signup" email template must contain
 * `{{ .Token }}`. The default template carries only the link, so until that
 * line is added the email arrives with no code in it -- exactly the
 * requirement the recovery template already has. See docs/REPORT_NOTES.md.
 * ---------------------------------------------------------------------------
 */
export function useConfirmSignUp() {
  const setProfile = useAuthStore((state) => state.setProfile);
  const setVolunteerProfile = useAuthStore((state) => state.setVolunteerProfile);
  const setAuthBootstrapping = useAuthStore((state) => state.setAuthBootstrapping);

  return useMutation({
    mutationFn: async ({ email, code }: ConfirmSignUpParams): Promise<void> => {
      // Set BEFORE verifyOtp, for the same reason useSignUp sets it before
      // signUp: the SDK can emit SIGNED_IN as part of saving the session, and
      // useAuthGuard's own profile fetch would then race the writes below.
      setAuthBootstrapping(true);

      try {
        const { data, error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: 'signup',
        });

        if (error) {
          // Supabase returns the same message for a wrong code, a used code
          // and an expired one. Kept as one sentence deliberately: telling
          // somebody which of the three it was tells a stranger the same
          // thing. Same rule as the password reset.
          throw new Error('That code is not valid, or it has expired. Ask for a new one and try again.');
        }

        const user = data.user;
        if (!user || !data.session) {
          throw new Error('We could not confirm your account just now. Please try again.');
        }

        // The account is confirmed at this point whatever happens next, so
        // nothing below may leave the person thinking it is not.
        const { data: existing, error: existingError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (existingError) throw existingError;

        if (existing) {
          // Already set up — a second confirmation, or a link tapped first.
          // Nothing to create; let the guard route them.
          return;
        }

        if (!isAuthUserMetadata(user.user_metadata)) {
          throw new Error(
            'Your account is confirmed, but we could not find the details you registered with. Please contact support.'
          );
        }

        const { profile, volunteerProfile } = await createProfileRowsFromMetadata(
          user.id,
          user.email ?? null,
          user.user_metadata
        );

        setProfile(profile);
        setVolunteerProfile(volunteerProfile);
      } finally {
        setAuthBootstrapping(false);
      }
    },
  });
}
