import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  EmptyState,
  ErrorState,
  FilterChips,
  ListSkeleton,
  ScreenHeader,
  SelectField,
} from '@/components/ui';
import type { FilterChipOption, SelectOption } from '@/components/ui';
import { OutreachFeedCard } from '@/components/volunteer';
import { GHANA_REGIONS } from '@/constants/ghana-locations';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  MIN_SEARCH_LENGTH,
  useOrganisationLogos,
  useOutreachDaysForMany,
  useSearchOutreaches,
} from '@/hooks';
import type { OutreachSearchWindow } from '@/hooks';
import { humanError } from '@/lib/errorMessage';
import type { OutreachRoleType } from '@/types/database';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

// Collapsing the filter panel without this is an instant jump on Android
// rather than an animation. Same guard InfoSection and Account & Security use;
// all of them are no-ops if it has already been set.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type RoleFilter = OutreachRoleType | 'all';

const ALL_REGIONS = 'all';

const REGION_OPTIONS: SelectOption[] = [
  { value: ALL_REGIONS, label: 'All regions' },
  ...GHANA_REGIONS.map((region) => ({ value: region.name, label: region.name })),
];

const ROLE_FILTERS: FilterChipOption<RoleFilter>[] = [
  { value: 'all', label: 'All roles' },
  { value: 'support', label: 'Support' },
  { value: 'clinical', label: 'Clinical' },
];

/*
  THE CHIPS SAY "STARTING", AND SO DOES THE RESULT LINE.

  The window is measured from `outreaches.date`, which is the day an outreach
  STARTS. Reading it as "runs at any point this week" would mean consulting
  `outreach_days`, a second query whose answer arrives after the list is already
  on screen and would then change it under the volunteer's thumb. A filter with
  a narrower meaning is fine; a filter that quietly means something other than
  its label is not. See `searchWindowBounds` in hooks/useOutreaches.ts.
*/
const WINDOW_FILTERS: FilterChipOption<OutreachSearchWindow>[] = [
  { value: 'any', label: 'Any date' },
  { value: 'today', label: 'Starting today' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'month', label: 'Next 30 days' },
];

/** How long the typing has to stop before a request goes out. */
const DEBOUNCE_MS = 350;

/**
 * Keyword search over open outreaches. design-refs/Search Results.png.
 *
 * WHY IT EXISTS. There was no keyword search anywhere in VHub. The feed filters
 * by region and role type and orders by match, which answers "what suits me" --
 * it has never been able to answer "where is the eye screening in Kumasi", so
 * finding one specific thing meant scrolling until it appeared.
 *
 * TWO DEPARTURES FROM THE DESIGN, both stated rather than quietly taken:
 *
 *   - THE MATCH PILL IS NOT DRAWN. The design puts a percentage on every
 *     result. `/api/match`'s rank_feed mode ranks a REGION, not an arbitrary
 *     list of ids, so there is no score to fetch for a text query, and
 *     MatchScoreBadge correctly refuses to invent one -- it renders "NOT RANKED
 *     YET" instead, which on this screen would be a row of identical pills
 *     reporting an outage that is not happening. The card takes
 *     `showMatchScore={false}` here.
 *   - "1.2 MILES AWAY" IS NOT SHOWN. An outreach stores a region, a district
 *     and a venue name, and no coordinates, so there is nothing to measure a
 *     distance from. The card shows the venue, which is the thing that tells a
 *     volunteer where to go.
 *
 * WHAT IS SEARCHED: the title, the description, the venue name, the district
 * and the region, plus the REQUIRED SKILLS by way of the vocabulary. Skills are
 * a closed list, so the term is resolved to real skill names before the query
 * runs, which is what makes "triage" find an outreach whose description never
 * uses the word.
 *
 * THE FILTERS ARE BEHIND THE HEADER BUTTON, closed by default, exactly as the
 * design has them. A search screen whose first offer is three filter controls
 * has buried the one control it is actually for.
 */
export default function Search() {
  const router = useRouter();
  // The floating tab bar is absolute and reserves no space, so the last card
  // needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();

  /*
    TWO PIECES OF STATE FOR ONE BOX. `term` is what is on screen and updates on
    every keystroke; `applied` is what has actually been searched for and lags
    behind it by DEBOUNCE_MS. Without the split, every letter typed is its own
    query key and therefore its own request.

    The debounce lives in the CHANGE HANDLER, not in an effect. An effect
    watching `term` and setting `applied` is the textbook shape for this and
    would be a thirteenth `set-state-in-effect` suppression; doing it here is
    the same behaviour with nothing to suppress. The effect below only clears
    the timer, and sets no state.
  */
  const [term, setTerm] = useState('');
  const [applied, setApplied] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [region, setRegion] = useState<string>(ALL_REGIONS);
  const [roleType, setRoleType] = useState<RoleFilter>('all');
  // Named dateWindow, not window: the global of that name exists in React
  // Native and shadowing it inside a component is a trap for the next reader.
  const [dateWindow, setDateWindow] = useState<OutreachSearchWindow>('any');

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  function handleChangeTerm(next: string) {
    setTerm(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setApplied(next), DEBOUNCE_MS);
  }

  /** Applies immediately, for the keyboard's own search key and the clear button. */
  function applyNow(next: string) {
    if (debounce.current) clearTimeout(debounce.current);
    setTerm(next);
    setApplied(next);
  }

  const filters = useMemo(
    () => ({
      query: applied,
      region: region === ALL_REGIONS ? null : region,
      roleType: roleType === 'all' ? null : roleType,
      window: dateWindow,
    }),
    [applied, region, roleType, dateWindow]
  );

  const searchQuery = useSearchOutreaches(filters);
  const results = useMemo(() => searchQuery.data ?? [], [searchQuery.data]);

  const filtersActive = region !== ALL_REGIONS || roleType !== 'all' || dateWindow !== 'any';
  const asked = applied.trim().length >= MIN_SEARCH_LENGTH || filtersActive;

  // Both fetched for the whole list in ONE query each, never one per card:
  // the logo lives on a row the outreach embed cannot reach, and the day rows
  // are what turn "Oct 3" into "4 days, Oct 3 to Oct 24" on a campaign.
  const logos = useOrganisationLogos(results.map((outreach) => outreach.organisation?.id));
  const days = useOutreachDaysForMany(results.map((outreach) => outreach.id));

  function clearEverything() {
    applyNow('');
    setRegion(ALL_REGIONS);
    setRoleType('all');
    setDateWindow('any');
  }

  const header = (
    <View>
      <View style={styles.searchField}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.primary} />
        <TextInput
          style={styles.searchInput}
          value={term}
          onChangeText={handleChangeTerm}
          onSubmitEditing={() => applyNow(term)}
          placeholder="Outreach, place or skill"
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search outreaches"
        />
        {term.length > 0 ? (
          <Pressable
            onPress={() => applyNow('')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear the search"
          >
            <MaterialCommunityIcons name="close-circle" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {filtersOpen ? (
        <View style={styles.filterPanel}>
          <SelectField
            label="Region"
            placeholder="All regions"
            value={region}
            options={REGION_OPTIONS}
            searchable
            onSelect={setRegion}
          />
          <FilterChips options={ROLE_FILTERS} value={roleType} onChange={setRoleType} />
          <FilterChips options={WINDOW_FILTERS} value={dateWindow} onChange={setDateWindow} />
        </View>
      ) : null}

      {asked && searchQuery.isSuccess ? (
        <Text style={styles.resultLine}>{describeResults(results.length, dateWindow)}</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Search"
        fallback="/(volunteer)/feed"
        trailing={
          <Pressable
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setFiltersOpen((open) => !open);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ expanded: filtersOpen }}
            accessibilityLabel={filtersOpen ? 'Hide filters' : 'Show filters'}
            style={({ pressed }) => [
              styles.filterButton,
              // Tinted while anything is narrowing the results, so a volunteer
              // seeing fewer results than expected can tell why without
              // opening the panel to look.
              filtersActive && styles.filterButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons
              name="tune-variant"
              size={20}
              color={filtersActive ? colors.white : colors.textPrimary}
            />
          </Pressable>
        }
      />

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, tabBarPadding]}
        ListHeaderComponent={header}
        // So a tap on a result lands on the card rather than being swallowed
        // by the keyboard dismissing itself.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <OutreachFeedCard
            outreach={item}
            organisationLogoUrl={logos.data?.[item.organisation?.id ?? ''] ?? null}
            days={days.data?.[item.id]?.map((day) => day.day)}
            showMatchScore={false}
            onPress={() =>
              router.push({
                pathname: '/(volunteer)/outreach/[id]',
                params: { id: item.id, from: '/(volunteer)/search' },
              })
            }
          />
        )}
        ListEmptyComponent={
          searchQuery.isLoading ? (
            <ListSkeleton rows={3} rowHeight={220} />
          ) : searchQuery.isError ? (
            <ErrorState
              message={humanError(searchQuery.error, 'Could not run that search.')}
              onRetry={() => searchQuery.refetch()}
            />
          ) : asked ? (
            <EmptyState
              icon="magnify-close"
              title="Nothing matched"
              message="No open outreach matches that. Try a shorter word, a place name, or widen the filters."
              actionLabel={filtersActive || term.length > 0 ? 'Clear search' : undefined}
              onAction={filtersActive || term.length > 0 ? clearEverything : undefined}
            />
          ) : (
            /*
              THE IDLE STATE IS NOT AN EMPTY RESULT. Nothing has been asked yet,
              and saying "nothing matched" before a question has been put is the
              app telling a volunteer their search failed when they have not
              made one.
            */
            <EmptyState
              icon="magnify"
              title="Search every open outreach"
              message="Type the name of an event, a town or a skill. Screening, Kumasi and triage all work."
              footnote="Only outreaches that are still open and still to come are searched."
            />
          )
        }
      />
    </SafeAreaView>
  );
}

/** "6 outreaches starting in the next 7 days", and the singular of it. */
function describeResults(count: number, dateWindow: OutreachSearchWindow): string {
  const noun = count === 1 ? 'outreach' : 'outreaches';
  switch (dateWindow) {
    case 'today':
      return `${count} ${noun} starting today`;
    case 'week':
      return `${count} ${noun} starting in the next 7 days`;
    case 'month':
      return `${count} ${noun} starting in the next 30 days`;
    case 'any':
      return `${count} ${noun} found`;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pressed: { opacity: 0.7 },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  /*
    Its own padded block with a real gap either side, rather than the controls
    running straight into the search box above and the first card below. Same
    treatment as the notifications screen's control block.
  */
  filterPanel: {
    gap: spacing.md,
    marginTop: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resultLine: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
});
