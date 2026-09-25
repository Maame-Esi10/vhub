import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { AuthUserMetadata } from '@/lib/auth-metadata';
import type { OrgType } from '@/constants/org-types';

export type SignUpParams =
  | { role: 'volunteer'; email: string; password: string; fullName: string }
  | {
      role: 'organisation';
      email: string;
      password: string;
      orgName: string;
      orgType: OrgType | null;
      description: string;
      website: string;
    };

export type SignUpResult =
  | { status: 'confirmationRequired' }
  | { status: 'created'; role: 'volunteer' | 'organisation' };

function buildMetadata(params: SignUpParams): AuthUserMetadata {
  if (params.role === 'volunteer') {
    return { role: 'volunteer', full_name: params.fullName.trim() };
  }
  return {
    role: 'organisation',
    full_name: params.orgName.trim(),
    org_type: params.orgType,
    description: params.description.trim() ? params.description.trim() : null,
    website: params.website.trim() ? params.website.trim() : null,
  };
}

export function useSignUp() {
  const setProfile = useAuthStore((state) => state.setProfile);
  const setVolunteerProfile = useAuthStore((state) => state.setVolunteerProfile);
  const setAuthBootstrapping = useAuthStore((state) => state.setAuthBootstrapping);

  return useMutation({
    mutationFn: async (params: SignUpParams): Promise<SignUpResult> => {
      // Stored as auth.users.user_metadata so the role/name/org fields
      // survive to first-login-after-confirmation if email confirmation is
      // required (see useAuthGuard's bootstrap-from-metadata fallback).
      const metadata = buildMetadata(params);

      // Set BEFORE calling signUp, not after awaiting it: Supabase's SDK can
      // emit the SIGNED_IN onAuthStateChange event as part of signUp's
      // internal session-saving, which may happen before the awaited
      // promise here resolves. Setting the flag only after would leave a
      // window where useAuthGuard's own concurrent fetch still races this
      // function's writes to authStore.profile/volunteerProfile. Cleared in
      // the finally block below regardless of outcome (including the
      // confirmation-required / no-session path, where it's a no-op since
      // no SIGNED_IN event fires without a session anyway).
      setAuthBootstrapping(true);

      try {
        const { data, error } = await supabase.auth.signUp({
          email: params.email.trim(),
          password: params.password,
          options: { data: metadata },
        });

        if (error) {
          throw error;
        }

        /*
          THE ADDRESS ALREADY HAS AN ACCOUNT (owner-reported 2026-09-25: "the
          6 digit for the new account never arrived").

          For an address that already belongs to a confirmed account, Supabase
          sends NO email and still answers success, so a stranger cannot use
          the sign-up form to learn who is registered. It marks the case with
          an empty `identities` list. The app did not look, so it moved to the
          code screen and waited for a code that was never going to be sent.
          An existing account is now said plainly, with the two ways forward.
        */
        if (data.user && !data.session && data.user.identities?.length === 0) {
          throw new Error(
            'An account with this email address already exists. Log in instead, or use Forgot password if you do not remember the password.'
          );
        }

        if (!data.session || !data.user) {
          // Email confirmation required — no authenticated session yet, so
          // RLS-guarded profile inserts would fail. useAuthGuard bootstraps
          // the profile rows from user_metadata on this user's first
          // authenticated session instead (after they click the email link
          // and log in).
          return { status: 'confirmationRequired' };
        }

        const userId = data.user.id;

        const { data: insertedProfile, error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            role: params.role,
            full_name: metadata.full_name,
            email: params.email.trim(),
          })
          .select()
          .single();

        if (profileError || !insertedProfile) {
          throw profileError ?? new Error('Could not create your profile. Please try again.');
        }

        setProfile(insertedProfile);

        if (params.role === 'volunteer') {
          const { data: insertedVolunteerProfile, error: volunteerProfileError } = await supabase
            .from('volunteer_profiles')
            .insert({ id: userId })
            .select()
            .single();

          if (volunteerProfileError || !insertedVolunteerProfile) {
            throw (
              volunteerProfileError ??
              new Error('Could not create your volunteer profile. Please try again.')
            );
          }

          setVolunteerProfile(insertedVolunteerProfile);
          return { status: 'created', role: 'volunteer' };
        }

        const { error: organisationProfileError } = await supabase.from('organisation_profiles').insert({
          id: userId,
          org_name: metadata.full_name,
          org_type: metadata.org_type ?? null,
          description: metadata.description ?? null,
          website: metadata.website ?? null,
        });

        if (organisationProfileError) {
          throw organisationProfileError;
        }

        return { status: 'created', role: 'organisation' };
      } finally {
        setAuthBootstrapping(false);
      }
    },
  });
}
