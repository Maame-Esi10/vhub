import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  AvailabilityGrid,
  Avatar,
  Button,
  ConfirmDialog,
  EditSectionCard,
  Input,
  MultiSelectField,
  ScreenHeader,
  SelectField,
} from '@/components/ui';
import { EXPERIENCE_LEVELS, VOLUNTEER_CATEGORIES } from '@/constants/categories';
import { GHANA_REGION_NAMES, getDistrictsForRegion } from '@/constants/ghana-locations';
import { skillSectionsFor } from '@/constants/skills';
import { MEDICAL_SPECIALTIES } from '@/constants/specialties';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useUpdateVolunteerProfile } from '@/hooks/useProfileEditor';
// Direct import, not the hooks barrel: this hook reaches the native picker
// modules. See the note in lib/cloudinary.ts.
import { useAvatarUpload, useRemoveAvatar } from '@/hooks/useMediaUpload';
import { useAuthStore } from '@/stores/authStore';
import type { ExperienceLevel, VolunteerCategory } from '@/types/database';



const SPECIALTY_SECTIONS = [{ title: 'Medical Specialties', data: [...MEDICAL_SPECIALTIES] }];

const BIO_MAX = 400;

/**
 * Volunteer "Edit Professional Profile", per design-refs/Edit Profile.png.
 *
 * Two additions to that PNG, both owner-approved: a BASIC DETAILS card
 * (full name + bio, which the design has no field for) and a split of the
 * design's single CLINICAL EXPERTISE section into specialties and skills.
 * The split matters beyond tidiness — `skill_tags` is what
 * lib/matching/layer1.ts scores the skills component against, so merging it
 * with `specialties` would quietly change matching results.
 */
export default function EditVolunteerProfile() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);
  const { mutateAsync, isPending, error } = useUpdateVolunteerProfile();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [bio, setBio] = useState(volunteerProfile?.bio ?? '');
  const [category, setCategory] = useState<VolunteerCategory | null>(
    volunteerProfile?.category ?? null
  );
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(
    volunteerProfile?.experience_level ?? null
  );
  const [region, setRegion] = useState<string | null>(profile?.region ?? null);
  const [district, setDistrict] = useState<string | null>(profile?.district ?? null);
  const [specialties, setSpecialties] = useState<string[]>(volunteerProfile?.specialties ?? []);
  const [skillTags, setSkillTags] = useState<string[]>(volunteerProfile?.skill_tags ?? []);
  const skillSections = useMemo(
    () =>
      skillSectionsFor(skillTags).map((category) => ({
        title: category.name,
        icon: category.icon,
        data: category.skills,
      })),
    [skillTags]
  );
  const [availability, setAvailability] = useState<string[]>(
    volunteerProfile?.availability_slots ?? []
  );
  const [discarding, setDiscarding] = useState(false);
  // Repurposed from a "coming soon" notice into the upload's error dialog —
  // the happy path needs no confirmation, since the new photo appears in the
  // Avatar above the moment the store updates.
  const [photoNotice, setPhotoNotice] = useState(false);
  const avatarUpload = useAvatarUpload();
  // Added for parity with the organisation screen: the two are the same
  // control over the same column, and only one of them having a way to
  // undo is the kind of difference nobody can explain later.
  const removeAvatar = useRemoveAvatar();
  const [removingPhoto, setRemovingPhoto] = useState(false);

  function handlePickAvatar() {
    if (!user) return;
    avatarUpload.mutate(user.id, {
      // A cancelled picker resolves with null and is not an error.
      onError: () => setPhotoNotice(true),
    });
  }
  const [nameError, setNameError] = useState<string | null>(null);

  const districtOptions = useMemo(
    () => (region ? getDistrictsForRegion(region).map((d) => ({ value: d, label: d })) : []),
    [region]
  );

  // Compared against the loaded values so "Cancel and Discard" only warns
  // when there is actually something to lose.
  const dirty =
    fullName !== (profile?.full_name ?? '') ||
    bio !== (volunteerProfile?.bio ?? '') ||
    category !== (volunteerProfile?.category ?? null) ||
    experienceLevel !== (volunteerProfile?.experience_level ?? null) ||
    region !== (profile?.region ?? null) ||
    district !== (profile?.district ?? null) ||
    !sameSet(specialties, volunteerProfile?.specialties ?? []) ||
    !sameSet(skillTags, volunteerProfile?.skill_tags ?? []) ||
    !sameSet(availability, volunteerProfile?.availability_slots ?? []);

  async function handleSave() {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setNameError('Your name is required.');
      return;
    }
    setNameError(null);

    if (!user) return;

    try {
      await mutateAsync({
        userId: user.id,
        fullName: trimmedName,
        region,
        district,
        category,
        experienceLevel,
        skillTags,
        specialties,
        availabilitySlots: availability,
        bio: bio.trim() || null,
      });
      router.replace('/(volunteer)/profile');
    } catch {
      // Surfaced inline from `error` below; the screen stays open so the
      // volunteer's edits aren't thrown away by a failed save.
    }
  }

  function handleCancel() {
    if (dirty) {
      setDiscarding(true);
    } else {
      router.replace('/(volunteer)/profile');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* onBack routes through handleCancel so backing out of a dirty form
          warns instead of silently discarding. */}
      <ScreenHeader title="Edit Professional Profile" onBack={handleCancel} fallback="/(volunteer)/profile" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarBlock}>
            <Pressable
              onPress={handlePickAvatar}
              disabled={avatarUpload.isPending}
              accessibilityRole="button"
              accessibilityLabel="Update profile photo"
              accessibilityState={{ disabled: avatarUpload.isPending }}
              style={styles.avatarPress}
            >
              <Avatar name={profile?.full_name ?? 'Volunteer'} uri={profile?.avatar_url} size={96} />
              <View style={styles.avatarBadge}>
                <MaterialCommunityIcons
                  name={avatarUpload.isPending ? 'progress-upload' : 'pencil'}
                  size={14}
                  color={colors.white}
                />
              </View>
            </Pressable>
            <Text style={styles.avatarCaption}>
              {avatarUpload.isPending ? 'Uploading...' : 'Update Profile Photo'}
            </Text>
            {profile?.avatar_url && !avatarUpload.isPending ? (
              <Pressable
                onPress={() => setRemovingPhoto(true)}
                accessibilityRole="button"
                accessibilityLabel="Remove profile photo"
                hitSlop={8}
              >
                <Text style={styles.avatarRemove}>Remove photo</Text>
              </Pressable>
            ) : null}
          </View>

          <EditSectionCard icon="account-outline" title="BASIC DETAILS">
            <Input
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your full name"
              autoCapitalize="words"
              error={nameError ?? undefined}
            />
            <View style={styles.fieldGap} />
            <Input
              label="About You"
              value={bio}
              onChangeText={(text) => setBio(text.slice(0, BIO_MAX))}
              placeholder="A short introduction for organisations reviewing your application."
              multiline
              numberOfLines={4}
            />
            <Text style={styles.counter}>
              {bio.length}/{BIO_MAX}
            </Text>
          </EditSectionCard>

          <EditSectionCard icon="medical-bag" title="PROFESSIONAL IDENTITY">
            <SelectField
              label="Professional Category"
              placeholder="Select your category"
              value={category}
              options={VOLUNTEER_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
              onSelect={(value) => setCategory(value as VolunteerCategory)}
            />
            <View style={styles.fieldGap} />
            {/*
              Experience is the one matching input with no onboarding step, so
              before this screen existed it stayed null for every volunteer and
              silently zeroed the Experience×10 component of the match score.
              It also genuinely changes over time, which is why it belongs on an
              editable profile rather than a one-off wizard.
            */}
            <SelectField
              label="Experience Level"
              placeholder="Select your experience level"
              value={experienceLevel}
              options={EXPERIENCE_LEVELS.map((e) => ({ value: e.value, label: e.label }))}
              onSelect={(value) => setExperienceLevel(value as ExperienceLevel)}
            />
            <Text style={styles.helper}>
              Counts toward how well you match each outreach, so keep it up to date as you gain
              experience.
            </Text>
            <View style={styles.fieldGap} />
            <SelectField
              label="Region"
              placeholder="Select your region"
              value={region}
              options={GHANA_REGION_NAMES.map((name) => ({ value: name, label: name }))}
              onSelect={(value) => {
                setRegion(value);
                // Districts are region-scoped, so a region change invalidates
                // any district already chosen.
                setDistrict(null);
              }}
              searchable
            />
            <View style={styles.fieldGap} />
            <SelectField
              label="District"
              placeholder="Select your district"
              value={district}
              options={districtOptions}
              onSelect={setDistrict}
              searchable
              disabled={!region}
              disabledHint="Choose a region first."
            />
          </EditSectionCard>

          <EditSectionCard icon="check-decagram" title="CLINICAL EXPERTISE">
            <MultiSelectField
              label="Specialties"
              placeholder="Add your specialties"
              selected={specialties}
              sections={SPECIALTY_SECTIONS}
              onChange={setSpecialties}
            />
          </EditSectionCard>

          <EditSectionCard icon="lightning-bolt-outline" title="SKILLS">
            <MultiSelectField
              label="Skills"
              placeholder="Add your skills"
              selected={skillTags}
              /*
                Built from the CURRENT selection, so a volunteer who still
                holds a skill that is no longer offered can see it under "No
                longer offered" and clear it deliberately. A picker that could
                not draw it would silently drop it the next time anything else
                was toggled.
              */
              sections={skillSections}
              onChange={setSkillTags}
            />
            <Text style={styles.helper}>
              These are matched against each outreach&apos;s required skills, so keep them current.
            </Text>
          </EditSectionCard>

          <EditSectionCard icon="calendar-blank-outline" title="WEEKLY AVAILABILITY">
            <AvailabilityGrid value={availability} onChange={setAvailability} />
          </EditSectionCard>

          {error ? (
            <Text style={styles.error}>
              {error instanceof Error ? error.message : 'Could not save. Please try again.'}
            </Text>
          ) : null}

          <Button
            title={isPending ? 'Saving…' : 'Save Professional Profile'}
            variant="solid"
            disabled={isPending}
            onPress={handleSave}
            style={styles.saveButton}
          />
          <Button
            title="Cancel and Discard"
            variant="outline"
            disabled={isPending}
            onPress={handleCancel}
            style={styles.cancelButton}
            textStyle={styles.cancelLabel}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={discarding}
        icon="alert-outline"
        tone="destructive"
        title="Discard your changes?"
        message="Anything you've edited on this screen will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        onConfirm={() => {
          setDiscarding(false);
          router.replace('/(volunteer)/profile');
        }}
        onCancel={() => setDiscarding(false)}
      />

      <ConfirmDialog
        visible={photoNotice}
        icon="alert-circle-outline"
        title="Photo not updated"
        message={avatarUpload.error?.message ?? 'Please try again.'}
        confirmLabel="Got It"
        cancelLabel="Close"
        onConfirm={() => setPhotoNotice(false)}
        onCancel={() => setPhotoNotice(false)}
      />

      <ConfirmDialog
        visible={removingPhoto}
        icon="trash-can-outline"
        tone="destructive"
        title="Remove your photo?"
        message="Your profile will show your initials instead. You can add a photo again at any time."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        busy={removeAvatar.isPending}
        onConfirm={() => {
          if (!user) return;
          removeAvatar.mutate(user.id, { onSuccess: () => setRemovingPhoto(false) });
        }}
        onCancel={() => setRemovingPhoto(false)}
      />
    </SafeAreaView>
  );
}

/** Order-insensitive comparison for the multi-select / availability arrays. */
function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((item) => set.has(item));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  avatarBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatarPress: {
    position: 'relative',
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 4,
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRemove: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  avatarCaption: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  fieldGap: {
    height: spacing.base,
  },
  counter: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  helper: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  saveButton: {
    marginTop: spacing.sm,
  },
  cancelButton: {
    marginTop: spacing.md,
    borderColor: colors.border,
  },
  cancelLabel: {
    color: colors.textSecondary,
  },
});
