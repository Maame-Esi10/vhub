import { create } from 'zustand';
import type { VolunteerCategory } from '@/types/database';

interface OnboardingState {
  skillTags: string[];
  category: VolunteerCategory | null;
  specialties: string[];
  region: string | null;
  district: string | null;
  availabilitySlots: string[];
  licenseNumber: string;
  declarationSigned: boolean;
  setSkillTags: (skillTags: string[]) => void;
  setCategory: (category: VolunteerCategory | null) => void;
  setSpecialties: (specialties: string[]) => void;
  setRegion: (region: string | null) => void;
  setDistrict: (district: string | null) => void;
  setAvailabilitySlots: (availabilitySlots: string[]) => void;
  setLicenseNumber: (licenseNumber: string) => void;
  setDeclarationSigned: (declarationSigned: boolean) => void;
  reset: () => void;
}

// experience_level has no onboarding step in the current 5-step flow (no
// spec or Figma screen covers it) — it stays null until a future
// profile-edit screen sets it. See docs/REPORT_NOTES.md.
const initialState = {
  skillTags: [],
  category: null,
  specialties: [],
  region: null,
  district: null,
  availabilitySlots: [],
  licenseNumber: '',
  declarationSigned: false,
};

/**
 * Scratch state for the multi-step volunteer onboarding wizard
 * (app/(auth)/onboarding/*). Steps are separate routed screens, so this
 * store is what carries selections between them. Reset on successful
 * submit (declaration step) or when a fresh onboarding flow starts.
 */
export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initialState,
  setSkillTags: (skillTags) => set({ skillTags }),
  setCategory: (category) => set({ category }),
  setSpecialties: (specialties) => set({ specialties }),
  setRegion: (region) => set({ region, district: null }),
  setDistrict: (district) => set({ district }),
  setAvailabilitySlots: (availabilitySlots) => set({ availabilitySlots }),
  setLicenseNumber: (licenseNumber) => set({ licenseNumber }),
  setDeclarationSigned: (declarationSigned) => set({ declarationSigned }),
  reset: () => set(initialState),
}));
