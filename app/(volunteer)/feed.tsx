import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Avatar, EmptyState, ErrorState, FilterChips, ListSkeleton, SelectField } from '@/components/ui';
import type { FilterChipOption, SelectOption } from '@/components/ui';
import { OutreachFeedCard } from '@/components/volunteer';
import { colors, fontFamily, spacing } from '@/constants/theme';
import { GHANA_REGIONS } from '@/constants/ghana-locations';
import { useOpenOutreaches } from '@/hooks';
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

  const feedQuery = useOpenOutreaches(filters);
  const outreaches = feedQuery.data ?? [];

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

      <Text style={styles.sectionTitle}>Open opportunities</Text>
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
        data={outreaches}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={feedQuery.isRefetching} onRefresh={() => feedQuery.refetch()} />
        }
        renderItem={({ item }) => (
          <OutreachFeedCard
            outreach={item}
            // Phase 3 swaps this null for the Layer 1 / Layer 2 score and
            // reorders the query by it; the card already renders both states.
            matchScore={null}
            onPress={() => router.push(`/(volunteer)/outreach/${item.id}`)}
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
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.base,
  },
});
