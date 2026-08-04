import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Avatar,
  Button,
  ConfirmDialog,
  EditSectionCard,
  ErrorState,
  Input,
  ScreenHeader,
  SelectField,
} from '@/components/ui';
import { GHANA_REGION_NAMES, getDistrictsForRegion } from '@/constants/ghana-locations';
import { ORG_TYPES } from '@/constants/org-types';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useMyOrganisationProfile, useUpdateOrganisationProfile } from '@/hooks/useProfileEditor';
import { useAuthStore } from '@/stores/authStore';

const DESCRIPTION_MAX = 600;

/**
 * Organisation "Edit Organisation Profile".
 *
 * NOTE: design-refs/ has no edit design for the organisation side — the
 * closest frames (Organization Public Profile.png, Settings.png) are
 * read-only views. This screen is therefore built entirely from the
 * volunteer Edit Profile design's visual language: the same circular avatar
 * with a coral pencil badge, the same EditSectionCard grouping, the same
 * Input/SelectField primitives, and the same navy save / outline cancel
 * button pair. Nothing new was invented.
 */
export default function EditOrganisationProfile() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const orgQuery = useMyOrganisationProfile(user?.id);
  const { mutateAsync, isPending, error } = useUpdateOrganisationProfile();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [region, setRegion] = useState<string | null>(profile?.region ?? null);
  const [district, setDistrict] = useState<string | null>(profile?.district ?? null);
  const [discarding, setDiscarding] = useState(false);
  const [photoNotice, setPhotoNotice] = useState(false);
  const [errors, setErrors] = useState<{
    fullName?: string;
    orgName?: string;
    contactEmail?: string;
    contactPhone?: string;
  }>({});

  // Unlike the volunteer screen (whose data is already in authStore), the
  // organisation row is fetched, so the form seeds once the query resolves.
  const org = orgQuery.data;
  useEffect(() => {
    if (org) {
      setOrgName(org.org_name ?? '');
      setOrgType(org.org_type ?? null);
      setDescription(org.description ?? '');
      setWebsite(org.website ?? '');
      setContactEmail(org.contact_email ?? '');
      setContactPhone(org.contact_phone ?? '');
    }
  }, [org]);

  const districtOptions = useMemo(
    () => (region ? getDistrictsForRegion(region).map((d) => ({ value: d, label: d })) : []),
    [region]
  );

  // Memoised because every keystroke in any Input re-renders this whole
  // component. Rebuilt inline, these arrays were a fresh identity on each
  // render, so both SelectFields saw "new options" and re-rendered their
  // lists on every character typed -- the source of the typing lag on this
  // screen. districtOptions above was already memoised; these two were not.
  const regionOptions = useMemo(
    () => GHANA_REGION_NAMES.map((name) => ({ value: name, label: name })),
    []
  );
  const orgTypeOptions = useMemo(
    () => ORG_TYPES.map((t) => ({ value: t.value, label: t.label })),
    []
  );

  const dirty =
    fullName !== (profile?.full_name ?? '') ||
    region !== (profile?.region ?? null) ||
    district !== (profile?.district ?? null) ||
    orgName !== (org?.org_name ?? '') ||
    orgType !== (org?.org_type ?? null) ||
    description !== (org?.description ?? '') ||
    website !== (org?.website ?? '') ||
    contactEmail !== (org?.contact_email ?? '') ||
    contactPhone !== (org?.contact_phone ?? '');

  async function handleSave() {
    const trimmedName = fullName.trim();
    const trimmedOrg = orgName.trim();
    const trimmedEmail = contactEmail.trim();
    const trimmedPhone = contactPhone.trim();
    const nextErrors: typeof errors = {};
    if (!trimmedName) nextErrors.fullName = 'A contact name is required.';
    if (!trimmedOrg) nextErrors.orgName = 'Your organisation name is required.';
    // Both are optional — an organisation may prefer to be contacted only
    // through the app — so these validate shape only when something was typed.
    if (trimmedEmail && !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      nextErrors.contactEmail = 'Enter a valid email address.';
    }
    if (trimmedPhone && !/^\+?[\d\s-]{9,}$/.test(trimmedPhone)) {
      nextErrors.contactPhone = 'Enter a valid phone number, e.g. +233 24 123 4567.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (!user) return;

    try {
      await mutateAsync({
        userId: user.id,
        fullName: trimmedName,
        region,
        district,
        orgName: trimmedOrg,
        orgType,
        description: description.trim() || null,
        website: website.trim() || null,
        contactEmail: trimmedEmail || null,
        contactPhone: trimmedPhone || null,
      });
      router.replace('/(organisation)/profile');
    } catch {
      // Surfaced inline from `error` below; the screen stays open so edits
      // aren't thrown away by a failed save.
    }
  }

  function handleCancel() {
    if (dirty) {
      setDiscarding(true);
    } else {
      router.replace('/(organisation)/profile');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* onBack routes through handleCancel so backing out of a dirty form
          warns instead of silently discarding. */}
      <ScreenHeader title="Edit Organisation Profile" onBack={handleCancel} fallback="/(organisation)/profile" />

      {orgQuery.isLoading ? (
        <View style={styles.centred}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : orgQuery.isError ? (
        <ErrorState
          message="We couldn't load your organisation profile."
          onRetry={() => orgQuery.refetch()}
        />
      ) : (
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
                onPress={() => setPhotoNotice(true)}
                accessibilityRole="button"
                accessibilityLabel="Update organisation logo"
                style={styles.avatarPress}
              >
                <Avatar name={orgName || 'Organisation'} uri={profile?.avatar_url} size={96} />
                <View style={styles.avatarBadge}>
                  <MaterialCommunityIcons name="pencil" size={14} color={colors.white} />
                </View>
              </Pressable>
              <Text style={styles.avatarCaption}>Update Organisation Logo</Text>
            </View>

            <EditSectionCard icon="domain" title="ORGANISATION IDENTITY">
              <Input
                label="Organisation Name"
                value={orgName}
                onChangeText={setOrgName}
                placeholder="e.g. Ghana Health Outreach Foundation"
                autoCapitalize="words"
                error={errors.orgName}
              />
              <View style={styles.fieldGap} />
              <SelectField
                label="Organisation Type"
                placeholder="Select a type"
                value={orgType}
                options={orgTypeOptions}
                onSelect={setOrgType}
              />
            </EditSectionCard>

            {/*
              PUBLIC contact details: they go to organisation_profiles, which
              volunteers can read before applying, and are shown on the
              Organisation Public Profile. They are deliberately NOT
              profiles.email/profiles.phone — those are the account holder's
              private PII, kept row-scoped by policy, and the schema carries a
              standing instruction never to expose them through the discovery
              views. See supabase/migrations/20260804_org_public_contact_details.sql.

              Neither field is the login. That lives on auth.users and is
              changed only from Account & Security, which is why the helper
              below points there rather than offering an edit here.
            */}
            <EditSectionCard icon="account-outline" title="PRIMARY CONTACT">
              <Input
                label="Contact Name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Who volunteers will hear from"
                autoCapitalize="words"
                error={errors.fullName}
              />
              <View style={styles.fieldGap} />
              <Input
                label="Contact Email"
                value={contactEmail}
                onChangeText={setContactEmail}
                placeholder="enquiries@yourorganisation.org"
                autoCapitalize="none"
                keyboardType="email-address"
                error={errors.contactEmail}
              />
              <View style={styles.fieldGap} />
              <Input
                label="Contact Phone"
                value={contactPhone}
                onChangeText={setContactPhone}
                placeholder="+233 24 123 4567"
                keyboardType="phone-pad"
                error={errors.contactPhone}
              />
              <Text style={styles.helper}>
                Shown to volunteers so they can reach you. Both are optional.
                {profile?.email
                  ? ` You sign in as ${profile.email} — change that under Settings › Account & Security.`
                  : ''}
              </Text>
            </EditSectionCard>

            <EditSectionCard icon="map-marker-outline" title="BASE LOCATION">
              <SelectField
                label="Region"
                placeholder="Select your region"
                value={region}
                options={regionOptions}
                onSelect={(value) => {
                  setRegion(value);
                  // Districts are region-scoped, so a region change
                  // invalidates any district already chosen.
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

            <EditSectionCard icon="information-outline" title="ABOUT">
              <Input
                label="Description"
                value={description}
                onChangeText={(text) => setDescription(text.slice(0, DESCRIPTION_MAX))}
                placeholder="What your organisation does and the communities you serve."
                multiline
                numberOfLines={5}
              />
              <Text style={styles.counter}>
                {description.length}/{DESCRIPTION_MAX}
              </Text>
              <View style={styles.fieldGap} />
              <Input
                label="Website"
                value={website}
                onChangeText={setWebsite}
                placeholder="https://"
                autoCapitalize="none"
                keyboardType="url"
              />
            </EditSectionCard>

            {/*
              `verified` is intentionally read-only here: it's the trust badge
              volunteers judge outreaches by, so it's excluded from the
              organisation_profiles UPDATE grant and set only by a
              service-role review. Showing its state avoids the obvious
              "where do I tick verified?" question.
            */}
            <View style={styles.verifiedRow}>
              <MaterialCommunityIcons
                name={org?.verified ? 'check-decagram' : 'clock-outline'}
                size={18}
                color={org?.verified ? colors.success : colors.textSecondary}
              />
              <Text style={styles.verifiedText}>
                {org?.verified
                  ? 'Your organisation is verified.'
                  : 'Verification is reviewed by the V-HUB team and cannot be self-set.'}
              </Text>
            </View>

            {error ? (
              <Text style={styles.error}>
                {error instanceof Error ? error.message : 'Could not save. Please try again.'}
              </Text>
            ) : null}

            <Button
              title={isPending ? 'Saving…' : 'Save Organisation Profile'}
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
      )}

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
          router.replace('/(organisation)/profile');
        }}
        onCancel={() => setDiscarding(false)}
      />

      <ConfirmDialog
        visible={photoNotice}
        icon="camera-outline"
        title="Logo upload coming soon"
        message="Organisation logo uploads aren't switched on yet. Everything else on this screen saves normally."
        confirmLabel="Got It"
        cancelLabel="Close"
        onConfirm={() => setPhotoNotice(false)}
        onCancel={() => setPhotoNotice(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.lg,
  },
  verifiedText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
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
