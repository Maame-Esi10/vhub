import { supabase } from '@/lib/supabase';
import type { AuthUserMetadata } from '@/lib/auth-metadata';
import type { Profile, VolunteerProfile } from '@/types/database';

/**
 * Creates the `profiles` row and its one child row for a newly registered
 * user, from the metadata stashed on `auth.users` at signup.
 *
 * THIS IS THE ONE IMPLEMENTATION, and it is one because there are now three
 * callers that must not drift: `useSignUp` (confirmation off -- signUp returns
 * a session, so the rows can be written immediately), `useConfirmSignUp` (the
 * six-digit code path -- verifyOtp returns a session, same thing one step
 * later), and `useAuthGuard`'s bootstrap (the fallback for a user who confirmed
 * through the emailed link and is now logging in for the first time). Three
 * copies of an insert whose column list is pinned by a GRANT is three places to
 * forget the same thing. Same argument as server/waitlist.ts.
 *
 * THE INSERT COLUMN LIST IS EXACTLY `id, role, full_name, email`, and it is not
 * a style choice: `profiles` carries a column-level INSERT grant listing those
 * four and nothing else, so adding a fifth here fails with `permission denied
 * for table profiles` (SQLSTATE 42501) rather than being silently dropped. See
 * CLAUDE.md on column-level GRANTs.
 *
 * IT THROWS RATHER THAN RETURNING A STATUS. Every caller needs the reason -- to
 * show it, to log it, or both -- and the previous arrangement returned a bare
 * `{ status: 'error' }` that discarded the underlying message entirely. That
 * discarding is what made a failed bootstrap unexplainable: the app knew
 * exactly why it could not sign somebody in and threw the answer away.
 */
export interface CreatedProfileRows {
  profile: Profile;
  volunteerProfile: VolunteerProfile | null;
}

export async function createProfileRowsFromMetadata(
  userId: string,
  email: string | null,
  metadata: AuthUserMetadata
): Promise<CreatedProfileRows> {
  const { data: insertedProfile, error: profileError } = await supabase
    .from('profiles')
    .insert({ id: userId, role: metadata.role, full_name: metadata.full_name, email })
    .select()
    .single();

  if (profileError || !insertedProfile) {
    throw profileError ?? new Error('Your account was created but its profile could not be set up.');
  }

  // AuthUserMetadata.role is SignupRole, so this is exhaustive: 'admin' can
  // never arrive here, because nobody signs up as one and the database refuses
  // a client-inserted admin row regardless.
  if (metadata.role === 'organisation') {
    const { error: organisationError } = await supabase.from('organisation_profiles').insert({
      id: userId,
      org_name: metadata.full_name,
      org_type: metadata.org_type ?? null,
      description: metadata.description ?? null,
      website: metadata.website ?? null,
    });

    if (organisationError) throw organisationError;

    return { profile: insertedProfile as Profile, volunteerProfile: null };
  }

  const { data: insertedVolunteerProfile, error: volunteerError } = await supabase
    .from('volunteer_profiles')
    .insert({ id: userId })
    .select()
    .single();

  if (volunteerError || !insertedVolunteerProfile) {
    throw (
      volunteerError ?? new Error('Your account was created but its volunteer profile could not be set up.')
    );
  }

  return {
    profile: insertedProfile as Profile,
    volunteerProfile: insertedVolunteerProfile as VolunteerProfile,
  };
}
