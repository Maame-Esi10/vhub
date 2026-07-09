import { create } from 'zustand';

export type UserRole = 'volunteer' | 'organisation';

interface AuthState {
  user: unknown | null;
  profile: unknown | null;
  role: UserRole | null;
  loading: boolean;
  setUser: (user: unknown | null) => void;
  setProfile: (profile: unknown | null) => void;
  setRole: (role: UserRole | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  role: null,
  loading: true,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setRole: (role) => set({ role }),
  setLoading: (loading) => set({ loading }),
}));
