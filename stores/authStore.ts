import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import type { Profile, VolunteerProfile } from '@/types/database';

export type UserRole = Profile['role'];

interface AuthState {
  user: User | null;
  profile: Profile | null;
  /**
   * Populated only when profile.role === 'volunteer'. `category` is null
   * until the onboarding wizard's final step persists it, which is what
   * useAuthGuard uses to detect an incomplete/abandoned onboarding.
   */
  volunteerProfile: VolunteerProfile | null;
  role: UserRole | null;
  /** True until the initial session + profile fetch resolves. */
  loading: boolean;
  /**
   * True while useSignUp is actively creating profile rows for a brand-new
   * session. useAuthGuard's own onAuthStateChange handler checks this and
   * skips its concurrent profile fetch when set, so the two writers never
   * race to set authStore.profile/volunteerProfile from the same SIGNED_IN
   * event (whichever finished last used to silently win).
   */
  authBootstrapping: boolean;
  /**
   * Why the app could not finish signing somebody in, when that happened
   * AFTER their credentials were accepted.
   *
   * WHY THIS EXISTS (owner-reported, 2026-09-14: "I tried to log in. Nothing
   * happened. No error, no message."). signInWithPassword can succeed while
   * the profile load that follows it fails -- and the routing effect's
   * response to a missing profile is to stay put, deliberately, because it
   * must not guess a home route. The result was a person holding a valid
   * session, on the login screen, with the button no longer spinning and
   * nothing on screen at all. The sign-in genuinely had worked, so the login
   * screen's own error was null; the failure was one layer further in, and
   * that layer had no way to speak.
   *
   * Set by useAuthGuard, rendered by the login screen, cleared on the next
   * attempt and on any successful profile load.
   */
  authError: string | null;
  setUser: (user: User | null) => void;
  setAuthError: (authError: string | null) => void;
  setProfile: (profile: Profile | null) => void;
  setVolunteerProfile: (volunteerProfile: VolunteerProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setAuthBootstrapping: (authBootstrapping: boolean) => void;
  /** Clears all auth state, e.g. on sign-out. */
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  volunteerProfile: null,
  role: null,
  loading: true,
  authBootstrapping: false,
  authError: null,
  setUser: (user) => set({ user }),
  setAuthError: (authError) => set({ authError }),
  // A profile that loads is proof the failure it might have reported is over,
  // so the error clears with it rather than lingering into the next screen.
  setProfile: (profile) =>
    set(profile ? { profile, role: profile.role, authError: null } : { profile: null, role: null }),
  setVolunteerProfile: (volunteerProfile) => set({ volunteerProfile }),
  setLoading: (loading) => set({ loading }),
  setAuthBootstrapping: (authBootstrapping) => set({ authBootstrapping }),
  reset: () =>
    set({
      user: null,
      profile: null,
      volunteerProfile: null,
      role: null,
      loading: false,
      authBootstrapping: false,
      // NOT cleared: reset() runs on sign-out, and the sign-out that follows a
      // failed profile load is the very thing the message explains. Clearing
      // it here would erase the explanation a moment before the login screen
      // renders it -- which is the original bug with extra steps.
      authError: get().authError,
    }),
}));
