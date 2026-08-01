import { useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Avatar,
  Badge,
  ErrorState,
  ListSkeleton,
  formatEventDate,
  formatEventTimeRange,
} from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { usePublicOrganisationOutreaches, usePublicOrganisationProfile } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';
import type { Outreach } from '@/types/database';

/**
 * Public organisation profile (design-refs/Organization Public Profile.png).
 *
 * "Active Missions" and "Proven Impact" are the org's own open and completed
 * outreaches. The Figma stat row ("12k+ VOLUNTEERS · 4.8 RATING · 142
 * MISSIONS") is reduced to the one figure that has a real source: missions.
 * There is no volunteer-rates-organisation flow in the schema — event_reviews
 * runs org → volunteer only — and the roster counts sit behind
 * `applications_select_own_or_org`, which correctly hides them from a
 * browsing volunteer. Inventing either number would put fabricated social
 * proof next to real data.
 */
export default function PublicOrganisationProfile() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const organisationId = typeof id === 'string' ? id : undefined;
  const role = useAuthStore((state) => state.role);

  const profileQuery = usePublicOrganisationProfile(organisationId);
  const outreachesQuery = usePublicOrganisationOutreaches(organisationId);

  const organisation = profileQuery.data;
  const outreaches = useMemo(() => outreachesQuery.data ?? [], [outreachesQuery.data]);

  const active = outreaches.filter((outreach) => outreach.status === 'open');
  const past = outreaches.filter(
    (outreach) => outreach.status === 'completed' || outreach.status === 'closed'
  );

  if (profileQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ListSkeleton rows={3} rowHeight={120} />
      </SafeAreaView>
    );
  }

  if (profileQuery.isError || !organisation) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message={
              profileQuery.error instanceof Error
                ? profileQuery.error.message
                : 'This organisation could not be loaded.'
            }
            onRetry={() => profileQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const location = [organisation.district, organisation.region].filter(Boolean).join(', ');
  // Only volunteers have an outreach detail route to land on.
  const canOpenOutreach = role === 'volunteer';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEyebrow}>ORGANISATION</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {organisation.org_name}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.identityRow}>
            <Avatar name={organisation.org_name} uri={organisation.avatar_url} size={56} />
            <View style={styles.identityText}>
              <Text style={styles.orgName} numberOfLines={2}>
                {organisation.org_name}
              </Text>
              {organisation.org_type ? (
                <Text style={styles.orgType}>{organisation.org_type}</Text>
              ) : null}
              {location ? <Text style={styles.orgLocation}>{location}</Text> : null}
            </View>
          </View>

          <View style={styles.badgeRow}>
            <Badge
              label={organisation.verified ? 'Verified organisation' : 'Not yet verified'}
              tone={organisation.verified ? 'success' : 'neutral'}
              icon={organisation.verified ? 'shield-check' : undefined}
            />
            <Badge label={`${outreaches.length} published`} tone="navy" />
          </View>

          {organisation.website ? (
            <Pressable
              onPress={() => Linking.openURL(normaliseUrl(organisation.website!)).catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel={`Open ${organisation.website}`}
              style={styles.websiteRow}
            >
              <MaterialCommunityIcons name="web" size={16} color={colors.primary} />
              <Text style={styles.websiteText} numberOfLines={1}>
                {organisation.website}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {organisation.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mission profile</Text>
            <Text style={styles.body}>{organisation.description}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active missions</Text>
          {outreachesQuery.isLoading ? (
            <ListSkeleton rows={2} rowHeight={90} />
          ) : outreachesQuery.isError ? (
            <ErrorState
              title="Couldn't load outreaches"
              message={
                outreachesQuery.error instanceof Error
                  ? outreachesQuery.error.message
                  : 'Please try again.'
              }
              onRetry={() => outreachesQuery.refetch()}
            />
          ) : active.length === 0 ? (
            <Text style={styles.sectionEmpty}>
              This organisation has no open outreaches right now.
            </Text>
          ) : (
            active.map((outreach) => (
              <OutreachRow
                key={outreach.id}
                outreach={outreach}
                onPress={
                  canOpenOutreach
                    ? () => router.push(`/(volunteer)/outreach/${outreach.id}?from=/(volunteer)/feed`)
                    : undefined
                }
              />
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Proven impact</Text>
          {past.length === 0 ? (
            <Text style={styles.sectionEmpty}>No completed outreaches yet.</Text>
          ) : (
            past.map((outreach) => (
              <OutreachRow key={outreach.id} outreach={outreach} onPress={undefined} />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Adds a scheme so `Linking.openURL` doesn't reject "example.org". */
function normaliseUrl(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function OutreachRow({ outreach, onPress }: { outreach: Outreach; onPress?: () => void }) {
  const timeRange = formatEventTimeRange(outreach.start_time, outreach.end_time);
  const content = (
    <>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {outreach.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {formatEventDate(outreach.date)}
          {timeRange ? ` · ${timeRange}` : ''}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[outreach.location_name, outreach.district, outreach.region].filter(Boolean).join(', ') ||
            'Location to be confirmed'}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowSlots}>
          {outreach.slots_filled}/{outreach.slots_total}
        </Text>
        {onPress ? (
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
        ) : null}
      </View>
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={outreach.title}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerEyebrow: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 22,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  card: {
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
  },
  orgName: {
    fontFamily: fontFamily.bold,
    fontSize: 19,
    color: colors.textPrimary,
  },
  orgType: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
    marginTop: 2,
  },
  orgLocation: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.base,
  },
  websiteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
  },
  websiteText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sectionEmpty: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.85,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowSlots: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
