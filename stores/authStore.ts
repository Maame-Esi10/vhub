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
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setVolunteerProfile: (volunteerProfile: VolunteerProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setAuthBootstrapping: (authBootstrapping: boolean) => void;
  /** Clears all auth state, e.g. on sign-out. */
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  volunteerProfile: null,
  role: null,
  loading: true,
  authBootstrapping: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile, role: profile?.role ?? null }),
  setVolunteerProfile: (volunteerProfile) => set({ volunteerProfile }),
  setLoading: (loading) => set({ loading }),
  setAuthBootstrapping: (authBootstrapping) => set({ authBootstrapping }),
  reset: () =>
    set({ user: null, profile: null, volunteerProfile: null, role: null, loading: false, authBootstrapping: false }),
}));
