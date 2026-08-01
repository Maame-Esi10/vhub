import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar, EmptyState, ErrorState, FilterChips, ListSkeleton, SelectField } from '@/components/ui';
import type { FilterChipOption, SelectOption } from '@/components/ui';
import { MatchBreakdownSheet, OutreachFeedCard } from '@/components/volunteer';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { GHANA_REGIONS } from '@/constants/ghana-locations';
import { unreadCount, useNotifications, useRankedFeed } from '@/hooks';
import type { RankedFeedItem } from '@/hooks';
import { useAuthStore } from '@/stores/authStore';
import type { OutreachRoleType } from '@/types/database';

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

  // Shares the cached notifications list with the Notifications screen, so
  // opening it and marking things read clears this dot without a refetch.
  const unread = unreadCount(useNotifications().data ?? []);

  /** The card whose match pill was tapped, or null when the sheet is closed. */
  const [breakdownFor, setBreakdownFor] = useState<RankedFeedItem | null>(null);

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? 'there';
  const filtersActive = region !== ALL_REGIONS || roleType !== 'all';

  const header = (
    <View>
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
            message={feedQuery.error instanceof Error ? feedQuery.error.message : 'Please try again.'}
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
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={feedQuery.isRefetching} onRefresh={() => feedQuery.refetch()} />
        }
        renderItem={({ item }) => (
          <OutreachFeedCard
            outreach={item.outreach}
            matchScore={item.matchScore}
            onPressScore={item.breakdown ? () => setBreakdownFor(item) : undefined}
            onPress={() => router.push(`/(volunteer)/outreach/${item.outreach.id}`)}
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
              message="Organisations haven't published any outreaches you can join. Check back soon — new events appear here as soon as they open."
            />
          )
        }
      />

      <MatchBreakdownSheet
        visible={breakdownFor !== null}
        outreachTitle={breakdownFor?.outreach.title ?? ''}
        breakdown={breakdownFor?.breakdown ?? null}
        layer2Applied={feed?.layer2Applied ?? false}
        onDismiss={() => setBreakdownFor(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
