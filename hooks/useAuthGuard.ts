import { useEffect, useRef, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import type { AuthChangeEvent, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { createProfileRowsFromMetadata } from '@/lib/profileRows';
import { humanError } from '@/lib/errorMessage';
import { isAuthUserMetadata, type AuthUserMetadata } from '@/lib/auth-metadata';
import { ROLE_GROUP, ROLE_GROUPS, ROLE_HOME } from '@/lib/roleRoutes';
import { writeReturningUser } from '@/lib/launchState';
import type { Profile, VolunteerProfile } from '@/types/database';

/**
 * Screens within (auth) that should bounce an already-authenticated user
 * straight to their tab group. Onboarding/verify-identity are deliberately
 * excluded so a mid-onboarding session doesn't get yanked into the tabs
 * before the volunteer/organisation profile is complete. (A volunteer with
 * incomplete onboarding never reaches this check at all — the
 * onboardingIncomplete branch below returns first, and handles the entry
 * screens itself. That interaction was recorded here long before anyone drew
 * the consequence from it: because this check was unreachable for such a
 * volunteer, LOGIN had no rule moving them off it, and signing in did nothing
 * at all. Both branches must therefore keep handling the entry screens.)
 */
const AUTH_ENTRY_SCREENS = new Set(['welcome', 'login', 'register']);

/**
 * The role -> home route and role -> tab group maps live in lib/roleRoutes.ts
 * because the three tab layouts need exactly the same answer for their own
 * defence-in-depth redirects. Before, each spelled it out separately: a
 * ternary here and a hard-coded "send them to the other group" there, which
 * only worked while "not volunteer" could mean nothing but organisation.
 */

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
  /**
   * `cause` is the thing that was thrown or returned, kept so the failure can
   * be explained. It used to be discarded: the app knew exactly why it could
   * not sign somebody in and returned a bare status that threw the answer
   * away, which is why a failed bootstrap was unexplainable to the user AND
   * undiagnosable afterwards.
   */
  | { status: 'error'; cause: unknown };

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
  try {
    const { profile, volunteerProfile } = await createProfileRowsFromMetadata(
      user.id,
      user.email ?? null,
      metadata
    );
    return { status: 'bootstrapped', profile, volunteerProfile };
  } catch (cause) {
    return { status: 'error', cause };
  }
}

/**
 * Repairs a volunteer whose `profiles` row exists but whose
 * `volunteer_profiles` row does not — the state left behind when the second
 * of signup's/bootstrapProfileFromMetadata's two sequential, non-
 * transactional inserts is dropped (e.g. a lost connection on a flaky
 * mobile network). Upserts a stub row keyed on `id` so the gap is closed
 * instead of being rediscovered on every profile load; `category` stays
 * null so the existing onboarding-incomplete check below still routes the
 * volunteer into the wizard, whose final step (useCompleteOnboarding) now
 * upserts the real data over this stub.
 */
async function repairMissingVolunteerProfile(userId: string): Promise<VolunteerProfile | null> {
  const { data, error } = await supabase
    .from('volunteer_profiles')
    .upsert({ id: userId }, { onConflict: 'id' })
    .select()
    .maybeSingle();

  return error ? null : (data as VolunteerProfile | null);
}

/**
 * Same repair for organisations: a `profiles` row with role='organisation'
 * but no `organisation_profiles` row. org_name is NOT NULL with no DB
 * default, so the stub borrows profiles.full_name — useSignUp and
 * bootstrapProfileFromMetadata both set that to the org name at signup.
 * Best-effort: routing doesn't depend on organisation_profiles today, so a
 * failure here just leaves the gap for the next profile load to retry
 * rather than blocking navigation.
 */
async function repairMissingOrganisationProfile(userId: string, orgName: string): Promise<void> {
  await supabase.from('organisation_profiles').upsert({ id: userId, org_name: orgName }, { onConflict: 'id' });
}

async function resolveProfile(user: User): Promise<ProfileFetchOutcome> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return { status: 'error', cause: profileError };
  }

  if (!profile) {
    // No row yet — either mid email-confirmation (metadata carries what
    // useSignUp couldn't persist), or a genuinely unrecoverable state.
    return isAuthUserMetadata(user.user_metadata)
      ? bootstrapProfileFromMetadata(user, user.user_metadata)
      : { status: 'not_found' };
  }

  const typedProfile = profile as Profile;

  // `=== 'organisation'`, NOT `!== 'volunteer'`. It was the second form while
  // there were only two roles, and it would now hand an admin an
  // organisation_profiles row (and a repair attempt on every single load,
  // since the admin has no reason ever to have one). An admin has no child
  // profile table: everything about them is on `profiles`.
  if (typedProfile.role === 'organisation') {
    const { data: organisationProfile, error: organisationError } = await supabase
      .from('organisation_profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (organisationError) {
      return { status: 'error', cause: organisationError };
    }

    if (!organisationProfile) {
      // profiles row exists, organisation_profiles doesn't — repair rather
      // than leaving the org permanently short a child row.
      await repairMissingOrganisationProfile(user.id, typedProfile.full_name);
    }

    return { status: 'found', profile: typedProfile, volunteerProfile: null };
  }

  // An admin has no child profile row of either kind, so there is nothing more
  // to fetch and nothing to repair. Without this the volunteer fetch below
  // would find no row and "repair" one on every load — an admin would quietly
  // acquire a volunteer_profiles row, and with category null the
  // onboarding-incomplete rule would then park them on the welcome screen
  // forever.
  if (typedProfile.role === 'admin') {
    return { status: 'found', profile: typedProfile, volunteerProfile: null };
  }

  const { data: volunteerProfile, error: volunteerError } = await supabase
    .from('volunteer_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (volunteerError) {
    return { status: 'error', cause: volunteerError };
  }

  if (!volunteerProfile) {
    // profiles row exists, volunteer_profiles doesn't — repair instead of
    // returning null forever (which would otherwise bounce this volunteer
    // into the onboarding wizard on every load, and the wizard's old
    // .update()-only save used to fail outright against a nonexistent row).
    return {
      status: 'found',
      profile: typedProfile,
      volunteerProfile: await repairMissingVolunteerProfile(user.id),
    };
  }

  return {
    status: 'found',
    profile: typedProfile,
    volunteerProfile: volunteerProfile as VolunteerProfile,
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
  const {
    user,
    profile,
    volunteerProfile,
    loading,
    setUser,
    setProfile,
    setVolunteerProfile,
    setLoading,
    setAuthError,
  } = useAuthStore();
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
          // SAY SO. This used to sign somebody out in silence, which from the
          // login screen is indistinguishable from the button doing nothing.
          setAuthError(
            'Your account is missing its profile and we could not rebuild it. Please register again, or contact support if this keeps happening.'
          );
          try {
            await supabase.auth.signOut();
          } catch {
            // Sign-out itself failed (e.g. offline) — local state is
            // already cleared above, so the !user routing branch still
            // fires. Swallow rather than let this reject loadProfileForUser
            // and leave profileLoading stuck true forever.
          }
        } else if (outcome.status === 'error') {
          /*
            THE OUTCOME IS 'error', AND IT MEANS TWO DIFFERENT THINGS
            (owner-reported, 2026-09-14).

            (a) A FRESH SIGN-IN whose profile load or bootstrap failed. There
                is no profile in the store, the routing effect below will
                refuse to guess a home route, and the person is left holding a
                valid session on the login screen with nothing said. This is
                the reported bug: "Nothing happened. No error, no message."

            (b) A MID-SESSION BLIP for somebody whose profile is already
                loaded — a flaky network on a refetch. Here doing nothing is
                exactly right, and was always deliberate: treating "couldn't
                fetch" as "profile incomplete" would bounce an onboarded
                volunteer back into the onboarding wizard mid-session.

            The two are told apart by whether a profile is already in the
            store. Only (a) is a dead end, so only (a) speaks and signs out —
            leaving a session with no profile behind is what made the failure
            unrecoverable without reinstalling.
          */
          const hadProfile = useAuthStore.getState().profile !== null;

          // Always logged, both cases: this is the detail that makes a
          // support report answerable, and console output is for developers.
          console.warn('[auth] profile load failed:', outcome.cause);

          if (!hadProfile) {
            setAuthError(
              humanError(
                outcome.cause,
                'We signed you in but could not load your profile. Check your connection and try again.'
              )
            );
            try {
              await supabase.auth.signOut();
            } catch {
              // Same reasoning as the not_found branch above.
            }
          }
        }
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
      // Remembered for the NEXT launch's splash, which has to decide what to
      // draw before anything can know whether a session exists. See
      // lib/launchState.ts. Fire-and-forget: nothing here waits on it.
      void writeReturningUser(!!sessionUser);
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
      void writeReturningUser(!!sessionUser);

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

    // app/offline.tsx sits outside every route group on purpose: the offline
    // banner is rendered by the root layout and can be tapped from anywhere,
    // including the auth screens. Treated like (auth) by every rule below --
    // otherwise a signed-out user tapping it is thrown straight back to
    // welcome, and a half-onboarded volunteer can never see it at all.
    // Root-level routes that belong to nobody and are open to everybody,
    // signed in or not. `offline` is reachable from the banner on any screen
    // including the auth ones; `policy` is the privacy policy and terms, which
    // a person deciding whether to register has the most reason of anyone to
    // read. Bouncing either to welcome would be the app refusing to explain
    // itself.
    const atOffline = groupSegment === 'offline' || groupSegment === 'policy';

    if (!user) {
      if (!inAuthGroup && !atOffline) {
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
    const homeRoute = ROLE_HOME[profile.role];

    // A volunteer whose onboarding wizard was abandoned partway (app closed
    // before reaching verify-identity.tsx) has category still null in the
    // DB — every completion path (Secure Verification AND Complete Later)
    // writes it. They must not reach the tabs until it's set.
    //
    // They are sent to WELCOME, not straight into the wizard. Redirecting
    // into the wizard here did two bad things:
    //   * it hijacked the launch, so the splash handed off directly to "My
    //     Expertise" and the carousel appeared to be skipped entirely; and
    //   * because the redirect is a `replace`, the wizard opened on a
    //     single-entry stack with nothing behind it, and any attempt to back
    //     out to welcome was immediately bounced straight back in here —
    //     a trap with no exit and no sign-out.
    // Welcome is where the flow is designed to start, and it now offers a
    // "continue setting up" action for exactly this state, so resuming is
    // one tap away and arrives with welcome underneath it in the stack.
    const onboardingIncomplete = profile.role === 'volunteer' && volunteerProfile?.category == null;

    if (onboardingIncomplete) {
      /*
        LOGIN AND REGISTER ARE NOT RESTING PLACES, AND THAT WAS THE BUG
        (owner-reported 2026-09-14: "I tried to log in. Nothing happened.").

        This used to read "anywhere inside (auth) is fine" and leave the user
        exactly where they were. For the wizard steps and welcome that is
        right. For LOGIN it is not: login is the screen you are standing on at
        the moment you sign in, so "leave them alone" means the successful
        sign-in produces no visible result whatever. Nothing errored, so no
        message was shown either.

        It affected every newly registered volunteer, deterministically:
        `category` is null until the wizard's final step writes it, so a
        volunteer who has just confirmed their email is onboardingIncomplete by
        definition. The rule below that exists to move a signed-in user off an
        entry screen never ran, because this branch returns before it.

        WELCOME IS EXCLUDED from the pull, and must stay excluded: it is the
        destination, so redirecting from it to itself is an infinite loop.
      */
      const onEntryScreen = inAuthGroup && !!authScreen && AUTH_ENTRY_SCREENS.has(authScreen);
      const atWelcome = authScreen === 'welcome';

      /*
        THE WIZARD, NOT WELCOME (owner, 2026-09-21: "why doesn't the onboarding
        process begin right after the otp? It takes me back to the welcome
        screen with the buttons... this process is for someone who didn't leave
        the process halfway, not everyone").

        Exactly right. `confirm-email` replaces to the root on success, which
        lands here, and this sent every newly confirmed volunteer to welcome --
        a screen whose job is to introduce the app to somebody who has not
        signed up, wearing a "continue where you left off" action for somebody
        who did and then stopped. Neither describes a person who finished
        registering ten seconds ago. They had already been welcomed, they had
        already chosen a role, and they were shown a carousel and asked to
        press Continue to begin a thing they had just asked to begin.

        `/(auth)/onboarding` redirects to the wizard's first step, which is
        where they were always going. Resuming mid-wizard still works: the
        store keeps what has been answered.

        WELCOME STAYS EXCLUDED from the pull, and must. The wizard's back
        button goes to welcome, so pulling a user off welcome into the wizard
        would make that button do nothing and strand them with no way out
        except signing out. Somebody who deliberately navigates back to welcome
        is allowed to sit there; its resume action is still the way forward for
        them, and is now the only place that action is needed.
      */
      if ((!inAuthGroup && !atOffline) || (onEntryScreen && !atWelcome)) {
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

    // Inside a role group that is not yours -> back to your own home. Same
    // behaviour the two hand-written branches had for volunteer and
    // organisation; it now covers admin as well without a third and fourth
    // branch. Non-role groups ((auth), offline) are untouched: they are not in
    // ROLE_GROUPS, and both are handled above.
    if (groupSegment && ROLE_GROUPS.has(groupSegment) && groupSegment !== ROLE_GROUP[profile.role]) {
      router.replace(homeRoute);
    }
  }, [user, profile, volunteerProfile, loading, profileLoading, segments, router]);

  return { loading };
}
