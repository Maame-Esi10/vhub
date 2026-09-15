import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { humanError } from '@/lib/errorMessage';
import { Text } from '@/components/ui/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar, EmptyState, ErrorState, FilterChips, ListSkeleton, SelectField, ModerationBanner, HintRow } from '@/components/ui';
import type { FilterChipOption, SelectOption } from '@/components/ui';
import { MatchBreakdownSheet, OutreachFeedCard } from '@/components/volunteer';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { GHANA_REGIONS } from '@/constants/ghana-locations';
import { VOLUNTEER_CATEGORIES } from '@/constants/categories';
import {
  unreadCount,
  useNotifications,
  useOutreachRoles,
  useOutreachDaysForMany,
  useOutreachRolesForMany,
  useRankedFeed,
  useOrganisationLogos,
} from '@/hooks';
import type { RankedFeedItem } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';
import type { OutreachRoleType } from '@/types/database';
import { tabBarClearance } from '@/components/ui/tabBarOptions';

type RoleFilter = OutreachRoleType | 'all';

const ROLE_FILTERS: FilterChipOption<RoleFilter>[] = [
  { value: 'all', label: 'All roles' },
  { value: 'support', label: 'Support' },
  { value: 'clinical', label: 'Clinical' },
];

const ALL_REGIONS = 'all';

const REGION_OPTIONS: SelectOption[] = [
  { value: ALL_REGIONS, label: 'All regions' },
  ...GHANA_REGIONS.map((region) => ({ value: region.name, label: region.name })),
];

export default function Feed() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);

  const [region, setRegion] = useState<string>(ALL_REGIONS);
  const [roleType, setRoleType] = useState<RoleFilter>('all');

  const filters = useMemo(
    () => ({
      region: region === ALL_REGIONS ? null : region,
      roleType: roleType === 'all' ? null : roleType,
    }),
    [region, roleType]
  );

  const feedQuery = useRankedFeed(filters);
  const feed = feedQuery.data;
  const items = feed?.items ?? [];

  /*
    Organisation logos for the whole list in one query. The logo lives on
    `profiles.avatar_url`, which the outreach's embedded organisation row
    cannot reach — `profiles` is row-scoped by RLS and would come back null for
    any organisation this volunteer has never applied to. `public_organisation_profiles`
    is the view that exists to expose an organisation's public face, so the ids
    are collected here and looked up together rather than per card.
  */
  const organisationLogos = useOrganisationLogos(
    items.map((item) => item.outreach.organisation?.id)
  );

  // Shares the cached notifications list with the Notifications screen, so
  // opening it and marking things read clears this dot without a refetch.
  const unread = unreadCount(useNotifications().data ?? []);

  /** The card whose match pill was tapped, or null when the sheet is closed. */
  const [breakdownFor, setBreakdownFor] = useState<RankedFeedItem | null>(null);

  // Roles for every card on screen, in ONE batched query — a per-card query
  // would turn one screen into fifty round trips.
  const visibleOutreachIds = useMemo(
    () => (feed?.items ?? []).map((item) => item.outreach.id),
    [feed?.items]
  );
  const feedRoles = useOutreachRolesForMany(visibleOutreachIds);
  // Same batching, same reason. Every outreach has at least one day row, so an
  // outreach missing from this map means the query has not landed yet — the
  // card falls back to `outreaches.date`, which is its first day.
  const feedDays = useOutreachDaysForMany(visibleOutreachIds);

  function dayStringsFor(outreachId: string): string[] | undefined {
    return feedDays.data?.[outreachId]?.map((day) => day.day);
  }

  function roleSummaryFor(outreachId: string): string | null {
    const roles = feedRoles.data?.[outreachId];
    if (!roles?.length) return null;
    return roles
      .map(
        (role) =>
          `${role.slots_total} ${VOLUNTEER_CATEGORIES.find((c) => c.value === role.category)?.label ?? role.category}`
      )
      .join(' · ');
  }

  // The roles of whichever outreach's breakdown is open, so the sheet can name
  // the role the score was computed against. Only fetched while the sheet is
  // open — the feed itself has no use for them.
  const breakdownRoles = useOutreachRoles(breakdownFor?.outreach.id);
  const breakdownRoleName = breakdownFor?.bestRoleId
    ? (VOLUNTEER_CATEGORIES.find(
        (c) =>
          c.value ===
          breakdownRoles.data?.find((role) => role.id === breakdownFor.bestRoleId)?.category
      )?.label ?? null)
    : null;

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? 'there';
  const filtersActive = region !== ALL_REGIONS || roleType !== 'all';

  const header = (
    <View>
      {/*
        A suspension the account cannot see is indistinguishable from the app
        being broken: the database refuses the write, the screen shows a
        constraint error, and the person tries again. Renders nothing at all
        for an active account, which is nearly everybody.
      */}
      <ModerationBanner />
      <View style={styles.headerRow}>
        <Avatar name={profile?.full_name ?? 'Volunteer'} uri={profile?.avatar_url} size={44} />
        <View style={styles.headerText}>
          <Text style={styles.greeting} numberOfLines={1}>
            Hello, {firstName}
          </Text>
          <Text style={styles.subGreeting}>
            {typeof volunteerProfile?.v_score === 'number'
              ? `V-Score ${Math.round(volunteerProfile.v_score)}`
              : 'Find outreaches that need you'}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/(volunteer)/notifications')}
          accessibilityRole="button"
          accessibilityLabel={
            unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
          }
          hitSlop={8}
          style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color={colors.textPrimary} />
          {/* Dot rather than a count: the exact number does not change what
              the user does next, and a two-digit badge overflows this circle. */}
          {unread > 0 && <View style={styles.bellDot} />}
        </Pressable>
      </View>

      {/*
        THE TWO THINGS NOBODY FINDS ON THEIR OWN. A volunteer had no way of
        knowing that the skills on their profile decide what this list shows,
        so a thin profile read as a quiet platform rather than a fixable
        setting -- and nobody opens the Info Hub unprompted, so the screen
        explaining clinical versus support reached only the people who least
        needed it.
      */}
      <View style={styles.hints}>
        <HintRow
          icon="tune-variant"
          text="Your skills and availability shape these matches."
          actionLabel="Edit profile"
          accessibilityLabel="Edit your profile to change what you are matched with"
          onPress={() => router.push('/(volunteer)/edit-profile')}
        />
        <HintRow
          icon="help-circle-outline"
          text="Clinical or support? How scores work?"
          actionLabel="Info Hub"
          accessibilityLabel="Open the Info Hub"
          onPress={() => router.push('/(volunteer)/info-hub')}
        />
      </View>

      <View style={styles.filters}>
        <SelectField
          label="Region"
          placeholder="All regions"
          value={region}
          options={REGION_OPTIONS}
          searchable
          onSelect={setRegion}
        />
        <FilterChips options={ROLE_FILTERS} value={roleType} onChange={setRoleType} />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {feed?.ranked ? 'Best matches for you' : 'Open opportunities'}
        </Text>
        {feed ? (
          <View style={styles.rankNote}>
            <MaterialCommunityIcons
              name={feed.ranked ? 'sort-descending' : 'wifi-off'}
              size={13}
              color={colors.textSecondary}
            />
            {/* Says which ordering the volunteer is actually looking at.
                Silently showing newest-first while implying it is a match
                ranking would misrepresent the engine. */}
            <Text style={styles.rankNoteText} numberOfLines={2}>
              {feed.ranked
                ? 'Ranked by how well each event fits your profile. Tap a match score to see why.'
                : "Couldn't reach the matching service, so these are newest first rather than ranked."}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (feedQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerPad}>{header}</View>
        <ListSkeleton rows={3} rowHeight={200} />
      </SafeAreaView>
    );
  }

  if (feedQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message={humanError(feedQuery.error, 'Please try again.')}
            onRetry={() => feedQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.outreach.id}
        ListHeaderComponent={header}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: tabBarClearance(insets.bottom) },
        ]}
        refreshControl={
          <RefreshControl refreshing={feedQuery.isRefetching} onRefresh={() => feedQuery.refetch()} />
        }
        renderItem={({ item }) => (
          <OutreachFeedCard
            outreach={item.outreach}
            organisationLogoUrl={
              item.outreach.organisation
                ? organisationLogos.data?.[item.outreach.organisation.id]
                : null
            }
            matchScore={item.matchScore}
            onPressScore={item.breakdown ? () => setBreakdownFor(item) : undefined}
            roleSummary={roleSummaryFor(item.outreach.id)}
            days={dayStringsFor(item.outreach.id)}
            onPress={() => router.push(`/(volunteer)/outreach/${item.outreach.id}?from=/(volunteer)/feed`)}
          />
        )}
        ListEmptyComponent={
          filtersActive ? (
            <EmptyState
              icon="filter-variant"
              title="Nothing matches these filters"
              message="No open outreaches in this region or role type right now. Try widening your search."
              actionLabel="Clear filters"
              onAction={() => {
                setRegion(ALL_REGIONS);
                setRoleType('all');
              }}
            />
          ) : (
            <EmptyState
              icon="calendar-search"
              title="No open outreaches yet"
              message="Organisations haven't published any outreaches you can join. Check back soon. New events appear here as soon as they open."
            />
          )
        }
      />

      <MatchBreakdownSheet
        visible={breakdownFor !== null}
        outreachTitle={breakdownFor?.outreach.title ?? ''}
        breakdown={breakdownFor?.breakdown ?? null}
        layer2Applied={feed?.layer2Applied ?? false}
        roleName={breakdownRoleName}
        onDismiss={() => setBreakdownFor(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hints: { paddingHorizontal: spacing.xl, gap: spacing.sm, marginBottom: spacing.base },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  headerPad: {
    paddingHorizontal: spacing.xl,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  headerText: {
    flex: 1,
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
    // Matches the button fill so the dot reads as sitting on top of the bell
    // rather than merging with the icon's outline.
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  pressed: {
    opacity: 0.7,
  },
  greeting: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.textPrimary,
  },
  subGreeting: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  filters: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.base,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  rankNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  rankNoteText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },
});
