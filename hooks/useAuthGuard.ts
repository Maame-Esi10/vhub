import { useEffect, useRef, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import type { AuthChangeEvent, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { isAuthUserMetadata, type AuthUserMetadata } from '@/lib/auth-metadata';
import type { Profile, VolunteerProfile } from '@/types/database';

/**
 * Screens within (auth) that should bounce an already-authenticated user
 * straight to their tab group. Onboarding/verify-identity are deliberately
 * excluded so a mid-onboarding session doesn't get yanked into the tabs
 * before the volunteer/organisation profile is complete.
 */
const AUTH_ENTRY_SCREENS = new Set(['welcome', 'login', 'register']);

/** (auth) screens that make up the volunteer onboarding wizard itself. */
const ONBOARDING_SCREENS = new Set(['onboarding', 'verify-identity']);

/**
 * onAuthStateChange events that should trigger a profile (re)fetch.
 * TOKEN_REFRESHED fires automatically and frequently for an
 * already-onboarded, actively-browsing user — refetching on it risks a
 * transient network error being misread as "profile incomplete" mid-session
 * (see the 'error' outcome below). PASSWORD_RECOVERY/MFA_CHALLENGE_VERIFIED
 * aren't relevant to this app yet.
 */
const PROFILE_REFRESH_EVENTS = new Set<AuthChangeEvent>(['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION', 'USER_UPDATED']);

type ProfileFetchOutcome =
  | { status: 'found' | 'bootstrapped'; profile: Profile; volunteerProfile: VolunteerProfile | null }
  | { status: 'not_found' }
  | { status: 'error' };

/**
 * Creates the profiles/volunteer_profiles/organisation_profiles rows from
 * auth.users.user_metadata. This is the fallback path for a user who
 * registered while email confirmation was required (useSignUp couldn't
 * create these rows at signup time since there was no session) and is now
 * logging in for the first time after confirming.
 */
async function bootstrapProfileFromMetadata(
  user: User,
  metadata: AuthUserMetadata
): Promise<ProfileFetchOutcome> {
  const { data: insertedProfile, error: profileError } = await supabase
    .from('profiles')
    .insert({ id: user.id, role: metadata.role, full_name: metadata.full_name, email: user.email ?? null })
    .select()
    .single();

  if (profileError || !insertedProfile) {
    return { status: 'error' };
  }

  if (metadata.role !== 'volunteer') {
    const { error: organisationError } = await supabase.from('organisation_profiles').insert({
      id: user.id,
      org_name: metadata.full_name,
      org_type: metadata.org_type ?? null,
      description: metadata.description ?? null,
      website: metadata.website ?? null,
    });

    if (organisationError) {
      return { status: 'error' };
    }

    return { status: 'bootstrapped', profile: insertedProfile as Profile, volunteerProfile: null };
  }

  const { data: insertedVolunteerProfile, error: volunteerError } = await supabase
    .from('volunteer_profiles')
    .insert({ id: user.id })
    .select()
    .single();

  if (volunteerError || !insertedVolunteerProfile) {
    return { status: 'error' };
  }

  return {
    status: 'bootstrapped',
    profile: insertedProfile as Profile,
    volunteerProfile: insertedVolunteerProfile as VolunteerProfile,
  };
}

async function resolveProfile(user: User): Promise<ProfileFetchOutcome> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return { status: 'error' };
  }

  if (!profile) {
    // No row yet — either mid email-confirmation (metadata carries what
    // useSignUp couldn't persist), or a genuinely unrecoverable state.
    return isAuthUserMetadata(user.user_metadata)
      ? bootstrapProfileFromMetadata(user, user.user_metadata)
      : { status: 'not_found' };
  }

  const typedProfile = profile as Profile;

  if (typedProfile.role !== 'volunteer') {
    return { status: 'found', profile: typedProfile, volunteerProfile: null };
  }

  const { data: volunteerProfile, error: volunteerError } = await supabase
    .from('volunteer_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (volunteerError) {
    return { status: 'error' };
  }

  return {
    status: 'found',
    profile: typedProfile,
    volunteerProfile: (volunteerProfile as VolunteerProfile) ?? null,
  };
}

/**
 * Loads the Supabase session + profile into authStore and redirects based on
 * role: no session -> (auth)/welcome; incomplete volunteer onboarding ->
 * (auth)/onboarding; volunteer -> (volunteer) tabs; organisation ->
 * (organisation) tabs.
 */
export function useAuthGuard() {
  const segments = useSegments();
  const router = useRouter();
  const { user, profile, volunteerProfile, loading, setUser, setProfile, setVolunteerProfile, setLoading } =
    useAuthStore();
  const initialized = useRef(false);
  // True while a profile fetch triggered by an auth-state change is
  // in-flight. Distinct from `loading` (which only covers the very first
  // session check) — without this, the routing effect below can act on a
  // stale `profile: null` in the window between a session appearing and its
  // profile row being fetched, misrouting the user (e.g. to the volunteer
  // tabs during an organisation sign-up).
  const [profileLoading, setProfileLoading] = useState(false);
  // Dedupes concurrent loadProfileForUser calls for the same user: Supabase
  // fires an INITIAL_SESSION onAuthStateChange event independently of the
  // explicit getSession() call below, so on a cold start with an existing
  // session both can race to bootstrap the same user's profile rows,
  // double-inserting against the profiles.id unique constraint.
  const inFlightUserId = useRef<string | null>(null);

  useEffect(() => {
    async function loadProfileForUser(sessionUser: User) {
      if (inFlightUserId.current === sessionUser.id) {
        return;
      }
      inFlightUserId.current = sessionUser.id;
      setProfileLoading(true);

      try {
        const outcome = await resolveProfile(sessionUser);

        if (outcome.status === 'found' || outcome.status === 'bootstrapped') {
          setProfile(outcome.profile);
          setVolunteerProfile(outcome.volunteerProfile);
        } else if (outcome.status === 'not_found') {
          // Authenticated, but no profile row exists and there's no
          // user_metadata to bootstrap from — there is no safe in-app state
          // to land this user in. Sign out rather than silently
          // free-passing them into a tab group with a null profile; the
          // guard's own !user branch then redirects to welcome.
          setProfile(null);
          setVolunteerProfile(null);
          try {
            await supabase.auth.signOut();
          } catch {
            // Sign-out itself failed (e.g. offline) — local state is
            // already cleared above, so the !user routing branch still
            // fires. Swallow rather than let this reject loadProfileForUser
            // and leave profileLoading stuck true forever.
          }
        }
        // 'error' (a transient fetch failure, e.g. a flaky network
        // mid-session): deliberately leave the existing profile/
        // volunteerProfile untouched rather than treating "couldn't fetch"
        // as "profile incomplete" — otherwise a momentary network blip
        // could bounce an already-onboarded volunteer back into the
        // onboarding wizard mid-session.
      } catch {
        // resolveProfile itself is not expected to throw (every Supabase
        // call inside it is error-checked), but guard against it anyway so
        // an unexpected exception can never leave profileLoading stuck true
        // and permanently block the routing effect below.
      } finally {
        inFlightUserId.current = null;
        setProfileLoading(false);
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        await loadProfileForUser(sessionUser);
      } else {
        setProfile(null);
        setVolunteerProfile(null);
      }
      setLoading(false);
      initialized.current = true;
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);

      if (!PROFILE_REFRESH_EVENTS.has(event)) {
        // e.g. TOKEN_REFRESHED — session/user may still be updated above,
        // but skip the profile refetch entirely.
        if (!initialized.current) {
          setLoading(false);
          initialized.current = true;
        }
        return;
      }

      if (sessionUser) {
        // useSignUp is concurrently creating this same user's profile rows
        // for this exact SIGNED_IN event — let it own authStore.profile/
        // volunteerProfile for this event instead of racing it here.
        if (!useAuthStore.getState().authBootstrapping) {
          await loadProfileForUser(sessionUser);
        }
      } else {
        setProfile(null);
        setVolunteerProfile(null);
      }

      if (!initialized.current) {
        setLoading(false);
        initialized.current = true;
      }
    });

    return () => subscription.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading || profileLoading) return;

    const segmentList = segments as readonly string[];
    const groupSegment = segmentList[0];
    const atRoot = groupSegment === undefined;
    const inAuthGroup = groupSegment === '(auth)';
    const authScreen = segmentList[1];

    if (!user) {
      if (!inAuthGroup) {
        router.replace('/(auth)/welcome');
      }
      return;
    }

    // Authenticated, but profile hasn't loaded (or failed to) — stay put
    // rather than guessing a home route. loadProfileForUser's 'not_found'
    // branch signs the user out, which re-triggers this effect with
    // user === null shortly after.
    if (!profile) {
      return;
    }

    // Authenticated past this point.
    const homeRoute = profile.role === 'organisation' ? '/(organisation)/dashboard' : '/(volunteer)/feed';

    // A volunteer whose onboarding wizard was abandoned partway (app closed
    // before reaching verify-identity.tsx) has category still null in the
    // DB — every completion path (Secure Verification AND Complete Later)
    // writes it. Route them back into the wizard instead of the feed until
    // it's set, rather than silently skipping onboarding forever.
    const onboardingIncomplete = profile.role === 'volunteer' && volunteerProfile?.category == null;
    const inOnboardingFlow = inAuthGroup && !!authScreen && ONBOARDING_SCREENS.has(authScreen);

    if (onboardingIncomplete) {
      if (!inOnboardingFlow) {
        router.replace('/(auth)/onboarding');
      }
      return;
    }

    if (atRoot) {
      router.replace(homeRoute);
      return;
    }

    if (inAuthGroup && authScreen && AUTH_ENTRY_SCREENS.has(authScreen)) {
      router.replace(homeRoute);
      return;
    }

    if (profile.role === 'volunteer' && groupSegment === '(organisation)') {
      router.replace(homeRoute);
      return;
    }

    if (profile.role === 'organisation' && groupSegment === '(volunteer)') {
      router.replace(homeRoute);
    }
  }, [user, profile, volunteerProfile, loading, profileLoading, segments, router]);

  return { loading };
}
