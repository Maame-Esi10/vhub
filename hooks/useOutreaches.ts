import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { ApiClientError, rankFeed, setOutreachStatus } from '@/lib/api-client';
import type { Layer1MatchResult } from '@/lib/matching/layer1';
import { supabase } from '@/lib/supabase';
import { ALL_SKILLS } from '@/constants/skills';
import type {
  ApplicationStatus,
  Outreach,
  OutreachRoleType,
  OutreachStatus,
} from '@/types/database';

export const outreachKeys = {
  all: ['outreaches'] as const,
  byOrganisation: (organisationId: string) =>
    [...outreachKeys.all, 'organisation', organisationId] as const,
  detail: (outreachId: string) => [...outreachKeys.all, 'detail', outreachId] as const,
  byOrganisationPublic: (organisationId: string) =>
    [...outreachKeys.all, 'organisation-public', organisationId] as const,
  feed: (filters: FeedFilters) =>
    [...outreachKeys.all, 'feed', filters.region ?? 'all', filters.roleType ?? 'all'] as const,
  rankedFeed: (filters: FeedFilters) =>
    [...outreachKeys.all, 'ranked-feed', filters.region ?? 'all', filters.roleType ?? 'all'] as const,
  search: (filters: OutreachSearchFilters) =>
    [
      ...outreachKeys.all,
      'search',
      filters.query.trim().toLowerCase(),
      filters.region ?? 'all',
      filters.roleType ?? 'all',
      filters.window,
    ] as const,
};

/** Per-status applicant tally for one outreach, plus a `total` across all statuses. */
export type ApplicantCounts = Record<ApplicationStatus, number> & { total: number };

export interface OutreachWithCounts extends Outreach {
  applicantCounts: ApplicantCounts;
}

/** Narrow projection of `applications` used only to tally the dashboard counts. */
interface ApplicationStatusRow {
  outreach_id: string;
  status: ApplicationStatus;
}

function emptyApplicantCounts(): ApplicantCounts {
  return {
    pending: 0,
    accepted: 0,
    rejected: 0,
    waitlisted: 0,
    not_selected: 0,
    cancelled: 0,
    total: 0,
  };
}

/**
 * Lists the outreaches owned by one organisation, each annotated with its
 * per-status applicant counts.
 *
 * Two round-trips rather than a PostgREST aggregate embed
 * (`applications(count)`): that embed can only produce a single unfiltered
 * total, and the dashboard needs the counts broken down by status (pending is
 * the number that actually drives the org's next action). Fetching the bare
 * (outreach_id, status) pairs for this org's outreaches and reducing them
 * client-side keeps it at one extra query regardless of how many outreaches
 * exist. RLS (`applications_select_own_or_org`) already scopes that second
 * query to applications on this org's outreaches.
 *
 * NEWEST FIRST (owner, 2026-09-21: "Event ordering is backwards. Newest
 * first. An August event is sitting above my new October one").
 *
 * It was `date` ASCENDING, described here as "so the soonest event leads each
 * status group". That reasoning only holds for events still to come; applied
 * to a list that also contains everything already finished, ascending means
 * the organisation's oldest completed event is the first thing on the
 * dashboard and the one they just created is at the bottom. Descending puts
 * the event they are most likely to be thinking about at the top, which on
 * this screen is always the most recent one.
 */
export function useOrganisationOutreaches(organisationId: string | undefined) {
  return useQuery({
    queryKey: outreachKeys.byOrganisation(organisationId ?? 'unknown'),
    enabled: !!organisationId,
    queryFn: async (): Promise<OutreachWithCounts[]> => {
      const { data: outreaches, error } = await supabase
        .from('outreaches')
        .select('*')
        .eq('organisation_id', organisationId!)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message || 'Could not load your outreaches. Please try again.');
      }

      const rows = (outreaches ?? []) as Outreach[];
      if (rows.length === 0) {
        return [];
      }

      const { data: applications, error: applicationsError } = await supabase
        .from('applications')
        .select('outreach_id, status')
        .in(
          'outreach_id',
          rows.map((row) => row.id)
        );

      if (applicationsError) {
        throw new Error(
          applicationsError.message || 'Could not load applicant counts. Please try again.'
        );
      }

      const countsByOutreach = new Map<string, ApplicantCounts>();
      for (const row of rows) {
        countsByOutreach.set(row.id, emptyApplicantCounts());
      }

      for (const application of (applications ?? []) as ApplicationStatusRow[]) {
        const counts = countsByOutreach.get(application.outreach_id);
        if (!counts) continue;
        counts[application.status] += 1;
        counts.total += 1;
      }

      return rows.map((row) => ({
        ...row,
        applicantCounts: countsByOutreach.get(row.id) ?? emptyApplicantCounts(),
      }));
    },
  });
}

/** The organisation fields shown alongside an outreach on volunteer screens. */
export interface OutreachOrganisation {
  id: string;
  org_name: string;
  org_type: string | null;
  verified: boolean;
}

export interface OutreachWithOrganisation extends Outreach {
  organisation: OutreachOrganisation | null;
}

/**
 * `organisation_profiles` ROWS are readable by every authenticated user
 * (organisation_profiles_select_authenticated, still deliberately
 * `using (true)`), so this embed is safe on volunteer-facing screens. The org's
 * `profiles` row is NOT joined here: that one is row-scoped and would come back
 * null for orgs the volunteer has never applied to.
 *
 * THESE FOUR COLUMNS ARE THE PUBLIC ONES AND THE LIST IS NOW LOAD-BEARING.
 * The comment here used to say the table "holds no PII", which stopped being
 * true when verification shipped and added the official email, physical
 * address, contact person and the admin's verbatim rejection reason. Since
 * 2026-09-23 `authenticated` holds SELECT on the public columns ONLY, so
 * adding a column to this embed that is not in that grant list makes the whole
 * query fail with `permission denied for table organisation_profiles`
 * (SQLSTATE 42501) rather than quietly omitting it. The private columns come
 * back through `organisation_private_profiles`.
 */
const OUTREACH_WITH_ORGANISATION_SELECT = `
  *,
  organisation:organisation_profiles (
    id,
    org_name,
    org_type,
    verified
  )
`;

/** Single outreach by id. Readable by its owning org, or by anyone once it leaves `draft`. */
export function useOutreach(outreachId: string | undefined) {
  return useQuery({
    queryKey: outreachKeys.detail(outreachId ?? 'unknown'),
    enabled: !!outreachId,
    queryFn: async (): Promise<OutreachWithOrganisation> => {
      const { data, error } = await supabase
        .from('outreaches')
        .select(OUTREACH_WITH_ORGANISATION_SELECT)
        .eq('id', outreachId!)
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Could not load this outreach. Please try again.');
      }

      return data as unknown as OutreachWithOrganisation;
    },
  });
}

export interface FeedFilters {
  /** Ghana region name, or null for "all regions". */
  region: string | null;
  roleType: OutreachRoleType | null;
}

/**
 * The volunteer feed: every outreach an organisation has published.
 *
 * Newest first — Phase 3 replaces this ordering with the Layer 1 / Layer 2
 * match ranking. `status = 'open'` is an explicit filter, not a reliance on
 * RLS: `outreaches_select_open_or_own` hides drafts but still exposes closed
 * and completed events, which a volunteer can no longer join (and which
 * `applications_insert_own` now refuses).
 */
export function useOpenOutreaches(filters: FeedFilters) {
  return useQuery({
    queryKey: outreachKeys.feed(filters),
    queryFn: () => fetchOpenOutreaches(filters),
  });
}

/** The raw, unranked feed query. Shared by `useOpenOutreaches` and `useRankedFeed`'s fallback. */
async function fetchOpenOutreaches(filters: FeedFilters): Promise<OutreachWithOrganisation[]> {
  // `status = 'open'` is not on its own enough to mean "still happening".
  // Nothing moved an outreach out of `open` when its date passed, so past
  // events sat in the feed indefinitely and could still be applied to. A daily
  // lifecycle pass now closes them, but the date bound stays here regardless:
  // relying on a scheduled job to keep a query correct is fragile, and this
  // costs one predicate.
  //
  // `gte`, not `gt` — an event happening TODAY is still happening.
  const today = new Date().toISOString().slice(0, 10);

  let query = supabase
    .from('outreaches')
    .select(OUTREACH_WITH_ORGANISATION_SELECT)
    .eq('status', 'open')
    .gte('date', today);

  if (filters.region) {
    query = query.eq('region', filters.region);
  }
  if (filters.roleType) {
    query = query.eq('role_type', filters.roleType);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Could not load outreaches. Please try again.');
  }

  return (data ?? []) as unknown as OutreachWithOrganisation[];
}

/** One outreach in the ranked feed, carrying the score that put it where it is. */
export interface RankedFeedItem {
  outreach: OutreachWithOrganisation;
  /** 0-100, or null when the ranking service was unreachable and this is the unranked fallback. */
  matchScore: number | null;
  breakdown: Layer1MatchResult | null;
  /**
   * Which role of a multi-role outreach produced this score — the best one
   * open to this volunteer. Null in single-role mode.
   */
  bestRoleId?: string | null;
}

export interface RankedFeed {
  items: RankedFeedItem[];
  /** False when the API was unreachable and these are unranked, newest-first outreaches. */
  ranked: boolean;
  /** False when the server ranked with pure Layer 1 because Gemini was unavailable. Meaningless when `ranked` is false. */
  layer2Applied: boolean;
}

/**
 * The volunteer feed, ranked by the matching engine (`/api/match` mode
 * `rank_feed`): Layer 1 always, Gemini Layer 2 on top where it can help.
 *
 * Degrades in two independent steps, so the volunteer always sees events:
 *   1. Gemini unavailable -> the server still returns a Layer 1 ranking
 *      (`layer2Applied: false`). Handled server-side; nothing to do here.
 *   2. The API itself unreachable (offline, deploy down) -> falls back to the
 *      plain Supabase query, newest first, with `ranked: false` so the screen
 *      can say the list isn't personalised rather than silently showing a
 *      worse order and calling it a match ranking.
 * An auth error is NOT swallowed: that means the session is bad, which the
 * screen should surface rather than paper over.
 *
 * `staleTime` is what keeps this off the network while the volunteer scrolls
 * -- one request ranks the whole feed, and re-entering the tab inside the
 * window reuses it. Pull-to-refresh still forces a refetch.
 */
export function useRankedFeed(filters: FeedFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: outreachKeys.rankedFeed(filters),
    enabled: options?.enabled ?? true,
    staleTime: RANKED_FEED_STALE_TIME_MS,
    queryFn: async (): Promise<RankedFeed> => {
      try {
        const response = await rankFeed({ region: filters.region, roleType: filters.roleType });
        return {
          ranked: true,
          layer2Applied: response.layer2Applied,
          items: response.results.map((result) => ({
            outreach: result.outreach as OutreachWithOrganisation,
            matchScore: result.matchScore,
            breakdown: result.breakdown,
            bestRoleId: result.bestRoleId ?? null,
          })),
        };
      } catch (err) {
        if (err instanceof ApiClientError && !err.isAuthError) {
          const outreaches = await fetchOpenOutreaches(filters);
          return {
            ranked: false,
            layer2Applied: false,
            items: outreaches.map((outreach) => ({ outreach, matchScore: null, breakdown: null })),
          };
        }
        throw err;
      }
    },
  });
}

/** Five minutes: long enough that scrolling and tab-switching never re-rank, short enough that a newly published outreach shows up quickly. */
const RANKED_FEED_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Every published outreach belonging to one organisation, for the public
 * organisation profile's "Active Missions" and "Proven Impact" sections.
 * Drafts are excluded by `outreaches_select_open_or_own` for anyone who
 * isn't that organisation — the screen splits the rest by status itself.
 */
export function usePublicOrganisationOutreaches(organisationId: string | undefined) {
  return useQuery({
    queryKey: outreachKeys.byOrganisationPublic(organisationId ?? 'unknown'),
    enabled: !!organisationId,
    queryFn: async (): Promise<Outreach[]> => {
      const { data, error } = await supabase
        .from('outreaches')
        .select('*')
        .eq('organisation_id', organisationId!)
        .neq('status', 'draft')
        .order('date', { ascending: false });

      if (error) {
        throw new Error(error.message || 'Could not load this organisation’s outreaches.');
      }

      return (data ?? []) as Outreach[];
    },
  });
}

/** Bounds each search request. Doubled across the two, which is still a small page. */
const SEARCH_LIMIT = 50;

/** How long a term has to be before it is worth a round trip. */
export const MIN_SEARCH_LENGTH = 2;

/** How far ahead a search looks, measured from the day an outreach STARTS. */
export type OutreachSearchWindow = 'any' | 'today' | 'week' | 'month';

export interface OutreachSearchFilters {
  /** What the volunteer typed. Trimmed and sanitised before it reaches the query. */
  query: string;
  /** Ghana region name, or null for every region. */
  region: string | null;
  roleType: OutreachRoleType | null;
  window: OutreachSearchWindow;
}

/**
 * Characters that would be read as PostgREST filter GRAMMAR rather than as part
 * of what the volunteer typed.
 *
 * `.or()` takes a comma-separated list inside parentheses and `ilike` treats
 * `*` as its wildcard, so a search for "screening, eye (adults)" would be split
 * into several filters and either fail or, worse, succeed and mean something
 * nobody asked for. This is NOT about SQL injection: supabase-js parameterises
 * the values it sends, so the risk here is a broken or wrong query rather than
 * an unsafe one. Stripped rather than escaped because none of these characters
 * carries meaning in a search for an outreach, so there is nothing to preserve.
 */
const FILTER_GRAMMAR = /[,()*%\\"']/g;

/**
 * `YYYY-MM-DD` bounds for a search window, or null where that end is open.
 *
 * MEASURED FROM THE DAY AN OUTREACH STARTS, which is what `outreaches.date`
 * holds, and the screen's result line says "starting" for exactly that reason.
 * The alternative reading -- "runs at any point inside this week" -- would have
 * to consult `outreach_days`, a second query whose result arrives after the
 * first and would silently change the list under the volunteer's thumb. A
 * filter that reorders itself a second after it is tapped is worse than one
 * with a narrower meaning, as long as the meaning is stated.
 */
function searchWindowBounds(window: OutreachSearchWindow): { from: string; to: string | null } {
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  if (window === 'any') return { from, to: null };
  if (window === 'today') return { from, to: from };

  const end = new Date(today);
  end.setDate(end.getDate() + (window === 'week' ? 7 : 30));
  return { from, to: end.toISOString().slice(0, 10) };
}

/** Skills from the closed vocabulary whose name contains the term. */
function skillsMatching(term: string): string[] {
  const needle = term.toLowerCase();
  return ALL_SKILLS.filter((skill) => skill.toLowerCase().includes(needle));
}

/**
 * Keyword search over open, upcoming outreaches.
 *
 * WHY IT EXISTS. The feed filters by region and role type and orders by match,
 * which answers "what suits me". Nothing in the app could answer "where is the
 * eye screening in Kumasi": there was no keyword search anywhere, so finding a
 * specific thing meant scrolling the feed.
 *
 * TWO QUERIES, MERGED, RATHER THAN ONE CLEVER ONE. The text columns are matched
 * with `ilike` through `.or()`; the required skills are matched with an array
 * overlap in a SECOND request. Folding the array into the same `.or()` is
 * possible in principle and fragile in practice, because the array literal's
 * own commas collide with the comma that separates one filter from the next,
 * and the failure mode is a query that quietly matches the wrong rows. Two
 * bounded requests are cheaper than a subtle bug.
 *
 * THE SKILL SEARCH GOES THROUGH THE VOCABULARY, not through the column. Skills
 * are a closed list in constants/skills.ts, so the term is resolved to real
 * skill names on the client and the query then asks for outreaches requiring
 * any of them. That is what makes "triage" find an outreach whose description
 * never uses the word.
 *
 * NOT RANKED, DELIBERATELY. `/api/match`'s `rank_feed` mode ranks a region, not
 * an arbitrary list of ids, so there is no honest match score to put on these
 * cards. They are ordered by the soonest event instead, which is the useful
 * order for somebody looking for something specific to attend.
 */
export function useSearchOutreaches(filters: OutreachSearchFilters) {
  const term = filters.query.trim();
  const hasTerm = term.length >= MIN_SEARCH_LENGTH;
  const hasFilter =
    filters.region !== null || filters.roleType !== null || filters.window !== 'any';

  return useQuery({
    queryKey: outreachKeys.search(filters),
    // Nothing typed and nothing chosen is not an empty result; it is a screen
    // that has not been asked anything yet, and the screen says so.
    enabled: hasTerm || hasFilter,
    queryFn: async (): Promise<OutreachWithOrganisation[]> => {
      const { from, to } = searchWindowBounds(filters.window);

      const base = () => {
        let q = supabase
          .from('outreaches')
          .select(OUTREACH_WITH_ORGANISATION_SELECT)
          .eq('status', 'open')
          // `gte`, not `gt` -- an event happening TODAY is still happening.
          .gte('date', from);

        if (to) q = q.lte('date', to);
        if (filters.region) q = q.eq('region', filters.region);
        if (filters.roleType) q = q.eq('role_type', filters.roleType);
        return q;
      };

      const safe = term.replace(FILTER_GRAMMAR, ' ').trim();
      const requests = [];

      if (hasTerm && safe.length > 0) {
        const like = `*${safe}*`;
        requests.push(
          base()
            .or(
              [
                `title.ilike.${like}`,
                `description.ilike.${like}`,
                `location_name.ilike.${like}`,
                `district.ilike.${like}`,
                `region.ilike.${like}`,
              ].join(',')
            )
            .order('date', { ascending: true })
            .limit(SEARCH_LIMIT)
        );

        const skills = skillsMatching(safe);
        if (skills.length > 0) {
          requests.push(
            base()
              .overlaps('required_skills', skills)
              .order('date', { ascending: true })
              .limit(SEARCH_LIMIT)
          );
        }
      } else {
        // Filters only, no term: this is browsing rather than searching, and
        // the same query without the text predicate is exactly right for it.
        requests.push(base().order('date', { ascending: true }).limit(SEARCH_LIMIT));
      }

      const responses = await Promise.all(requests);
      const failure = responses.find((response) => response.error);
      if (failure?.error) {
        throw new Error(failure.error.message || 'Could not run that search. Please try again.');
      }

      // Merged by id: an outreach whose title AND required skills both match
      // comes back from both requests and must appear once.
      const byId = new Map<string, OutreachWithOrganisation>();
      for (const response of responses) {
        for (const row of (response.data ?? []) as unknown as OutreachWithOrganisation[]) {
          if (!byId.has(row.id)) byId.set(row.id, row);
        }
      }

      return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
    },
  });
}

export interface CreateOutreachParams {
  /** Must equal the signed-in org's auth uid — `outreaches_insert_own` RLS enforces it. */
  organisationId: string;
  title: string;
  description: string | null;
  /** ISO calendar date, `YYYY-MM-DD` (Postgres `date`). */
  date: string;
  /** 24-hour `HH:MM` (Postgres `time`), or null if unspecified. */
  startTime: string | null;
  endTime: string | null;
  region: string | null;
  district: string | null;
  locationName: string | null;
  requiredSkills: string[];
  requiredCategory: string | null;
  roleType: OutreachRoleType | null;
  slotsTotal: number;
  /** A new outreach is either saved as a `draft` or published `open` immediately. */
  status: Extract<OutreachStatus, 'draft' | 'open'>;
  /**
   * Cloudinary URL of the flyer image, or null. Client-writable (it is in
   * outreaches' INSERT and UPDATE grant lists) because an organisation sets
   * it on its own listing — see supabase/schema.sql.
   */
  flyerUrl?: string | null;
  /**
   * The venue photo's Cloudinary public_id, and the venue's coordinates.
   *
   * Client-writable for the same reason the flyer is: an organisation sets
   * them on its own listing, and all three are in outreaches' INSERT and
   * UPDATE grant lists (supabase/migrations/20260916_outreach_location.sql).
   *
   * The public_id, not a URL: a delivery URL carries a transformation and a
   * version, so storing one would make every future change of size or format
   * a data migration.
   */
  locationImageUrl?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
}

/**
 * Creates an outreach owned by the signed-in organisation.
 *
 * slots_filled is deliberately not sent: it is derived from accepted
 * applications by the `trg_applications_sync_slots_filled` trigger
 * (supabase/schema.sql) and defaults to 0.
 */
export function useCreateOutreach() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateOutreachParams): Promise<Outreach> => {
      const { data, error } = await supabase
        .from('outreaches')
        .insert({
          organisation_id: params.organisationId,
          title: params.title,
          description: params.description,
          date: params.date,
          start_time: params.startTime,
          end_time: params.endTime,
          region: params.region,
          district: params.district,
          location_name: params.locationName,
          required_skills: params.requiredSkills,
          required_category: params.requiredCategory,
          role_type: params.roleType,
          slots_total: params.slotsTotal,
          status: params.status,
          flyer_url: params.flyerUrl ?? null,
          location_image_url: params.locationImageUrl ?? null,
          location_lat: params.locationLat ?? null,
          location_lng: params.locationLng ?? null,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Could not create this outreach. Please try again.');
      }

      return data as Outreach;
    },
    onSuccess: (outreach) => {
      queryClient.invalidateQueries({
        queryKey: outreachKeys.byOrganisation(outreach.organisation_id),
      });
    },
  });
}

/**
 * The editable body of an outreach. Everything here is in `outreaches`' UPDATE
 * grant list (supabase/schema.sql); nothing derived is present.
 *
 * `slotsTotal` is OPTIONAL and must be omitted in multi-role mode, where the
 * outreach total is the sum of its roles and is maintained by trigger. Sending
 * a client value there is not merely redundant — it is a second source of truth
 * that the trigger overwrites, so the organisation would see its number change
 * by itself. `slots_filled`, `status`, `organisation_id` and the check-in
 * anchor are absent for the same reason they are absent from the grant list.
 */
export interface UpdateOutreachParams {
  outreachId: string;
  /** Only used to invalidate the right list cache; RLS is what actually authorises the write. */
  organisationId: string;
  title: string;
  description: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  region: string | null;
  district: string | null;
  locationName: string | null;
  requiredSkills: string[];
  requiredCategory: string | null;
  roleType: OutreachRoleType | null;
  slotsTotal?: number;
  flyerUrl: string | null;
}

/**
 * Edits a posted outreach.
 *
 * Until this existed an organisation could only close an outreach it had
 * mistyped, and — because a flyer can only be attached at creation — every
 * outreach posted before flyers shipped was permanently stuck on the navy
 * fallback band with no way to add one.
 */
export function useUpdateOutreach() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateOutreachParams): Promise<Outreach> => {
      const patch: Record<string, unknown> = {
        title: params.title,
        description: params.description,
        date: params.date,
        start_time: params.startTime,
        end_time: params.endTime,
        region: params.region,
        district: params.district,
        location_name: params.locationName,
        required_skills: params.requiredSkills,
        required_category: params.requiredCategory,
        role_type: params.roleType,
        flyer_url: params.flyerUrl,
      };

      // Present only in single-role mode — see the note on the params type.
      if (params.slotsTotal !== undefined) {
        patch.slots_total = params.slotsTotal;
      }

      const { data, error } = await supabase
        .from('outreaches')
        .update(patch)
        .eq('id', params.outreachId)
        .select()
        .single();

      if (error || !data) {
        throw new Error(updateOutreachMessage((error as PostgrestError | null)?.message ?? ''));
      }

      return data as Outreach;
    },
    onSuccess: (outreach, params) => {
      queryClient.invalidateQueries({
        queryKey: outreachKeys.byOrganisation(params.organisationId),
      });
      queryClient.invalidateQueries({ queryKey: outreachKeys.detail(outreach.id) });
      // The edit can move an outreach in or out of the volunteer feed — a
      // changed date, region or skill set all change how it ranks, and the
      // ranked feed caches for five minutes. Drop the whole outreach cache
      // rather than guessing which slices moved.
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
    },
  });
}

/**
 * The one database refusal an organisation can actually trigger from this form
 * is the `slots_filled <= slots_total` check, by cutting places below the
 * number already accepted. The form prevents it, but a stale screen could
 * still reach it, and "violates check constraint" explains nothing.
 */
function updateOutreachMessage(message: string): string {
  if (message.includes('slots_filled_le_total') || message.includes('slots_filled')) {
    return 'You have fewer places than volunteers already accepted. Raise the number of places, or reject someone first.';
  }
  return message || 'Could not save your changes. Please try again.';
}

export interface SaveOutreachParams extends UpdateOutreachParams {
  /**
   * `null` leaves the roles untouched — the common save, where only the details
   * changed. An ARRAY replaces them wholesale, and an EMPTY array is how an
   * outreach returns to single-role storage.
   */
  roles: {
    category: string;
    roleType: OutreachRoleType;
    minExperienceLevel: string | null;
    slotsTotal: number;
  }[] | null;
  /**
   * Every day the outreach runs on, `YYYY-MM-DD`, first day included.
   *
   * `null` leaves the days untouched — the common save, where only the details
   * changed. An ARRAY replaces the set: days already present keep their ids
   * (and therefore every commitment made against them), days no longer listed
   * are removed, and days nobody has committed to yet are the only ones that
   * CAN be removed. The database refuses to delete a day volunteers promised,
   * which aborts the whole save rather than half-applying it.
   */
  days: string[] | null;
}

/**
 * Saves the details AND the roles in ONE transaction.
 *
 * `useUpdateOutreach` + `useReplaceOutreachRoles` were two or three separate
 * requests, and every request is its own transaction, so a failure between them
 * left the outreach describing one thing and staffed as another — the reported
 * "The details saved, but the roles did not". Writing the fragile one first
 * narrowed that window but could not close it, and the role rewrite is itself a
 * delete followed by an insert, so a failure between THOSE lost the roles
 * outright.
 *
 * `save_outreach()` is a plpgsql function, and a function body is a single
 * transaction: the details update, the role delete and the role insert either
 * all commit or all roll back. It is SECURITY INVOKER, so RLS and every
 * column-level GRANT still apply exactly as they do to a direct call — it buys
 * atomicity, not privilege.
 */
export function useSaveOutreach() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SaveOutreachParams): Promise<Outreach> => {
      const { data, error } = await supabase.rpc('save_outreach', {
        p_outreach_id: params.outreachId,
        p_title: params.title,
        p_description: params.description,
        p_date: params.date,
        p_start_time: params.startTime,
        p_end_time: params.endTime,
        p_region: params.region,
        p_district: params.district,
        p_location_name: params.locationName,
        p_required_skills: params.requiredSkills,
        p_required_category: params.requiredCategory,
        p_role_type: params.roleType,
        // Undefined means multi-role, where the total is the sum of the roles
        // and is maintained by trigger; the function reads null as "leave it".
        p_slots_total: params.slotsTotal ?? null,
        p_flyer_url: params.flyerUrl,
        p_roles: params.roles
          ? params.roles.map((role) => ({
              category: role.category,
              role_type: role.roleType,
              min_experience_level: role.minExperienceLevel,
              slots_total: role.slotsTotal,
            }))
          : null,
        p_days: params.days,
      });

      if (error || !data) {
        throw new Error(updateOutreachMessage(error?.message ?? ''));
      }

      return data as Outreach;
    },
    onSuccess: (outreach, params) => {
      queryClient.invalidateQueries({
        queryKey: outreachKeys.byOrganisation(params.organisationId),
      });
      queryClient.invalidateQueries({ queryKey: outreachRoleKeysAll });
      queryClient.invalidateQueries({ queryKey: outreachDayKeysAll });
      // A changed date, region or skill set all change how this ranks, and the
      // ranked feed caches for five minutes. Drop the whole outreach cache
      // rather than guessing which slices moved.
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
    },
  });
}

/**
 * Imported as a literal rather than from `useOutreachRoles` to keep the
 * dependency one-way: that module already imports `outreachKeys` from here,
 * and importing back would make the two files circular.
 */
const outreachRoleKeysAll = ['outreach-roles'] as const;

/** Same one-way-dependency reason as `outreachRoleKeysAll` above — useOutreachDays imports from here. */
const outreachDayKeysAll = ['outreach-days'] as const;

export interface CompleteOrCancelParams {
  outreachId: string;
  organisationId: string;
  status: 'completed' | 'cancelled';
  /** Shown to volunteers verbatim when cancelling. */
  reason?: string;
}

/**
 * Marks an outreach completed, or cancels it and tells everyone with a live
 * application.
 *
 * Goes through `/api/outreach-status` rather than writing the column directly:
 * cancelling has to read other volunteers' push tokens and write notification
 * rows they own, which no organisation's JWT can do under RLS, and completing
 * has a precondition — the event must actually have finished — that no
 * constraint can express.
 */
export function useCompleteOrCancelOutreach() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CompleteOrCancelParams) =>
      setOutreachStatus(params.outreachId, params.status, { reason: params.reason }),
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({
        queryKey: outreachKeys.byOrganisation(params.organisationId),
      });
      queryClient.invalidateQueries({ queryKey: outreachKeys.detail(params.outreachId) });
      // A cancelled outreach leaves the feed and changes how it reads on every
      // volunteer's schedule, so the whole outreach cache goes.
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
    },
  });
}

export interface DeleteOutreachParams {
  outreachId: string;
  organisationId: string;
}

/**
 * Deletes an outreach outright.
 *
 * Only ever succeeds for one nobody has touched. `trg_outreaches_refuse_used_delete`
 * refuses the delete in the DATABASE when any application, attendance record or
 * review exists, because those belong to the volunteers rather than to the
 * organisation and a V-Score has to stay explainable from the events that
 * produced it. The screen offers Cancel instead in that case; this mapping
 * exists for the race where someone applies between the screen loading and the
 * button being pressed.
 */
export function useDeleteOutreach() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeleteOutreachParams): Promise<void> => {
      const { error } = await supabase.from('outreaches').delete().eq('id', params.outreachId);

      if (error) {
        throw new Error(
          error.message?.includes('Cancel it instead')
            ? 'Someone has applied to this outreach, so it can no longer be deleted. Cancel it instead.'
            : error.message || 'Could not delete this outreach. Please try again.'
        );
      }
    },
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({
        queryKey: outreachKeys.byOrganisation(params.organisationId),
      });
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
    },
  });
}

export interface UpdateOutreachStatusParams {
  outreachId: string;
  organisationId: string;
  status: OutreachStatus;
}

/** Publishes a draft, closes an open outreach, or marks one completed. */
export function useUpdateOutreachStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateOutreachStatusParams): Promise<Outreach> => {
      const { data, error } = await supabase
        .from('outreaches')
        .update({ status: params.status })
        .eq('id', params.outreachId)
        .select()
        .single();

      if (error || !data) {
        throw new Error(
          (error as PostgrestError | null)?.message ||
            'Could not update this outreach. Please try again.'
        );
      }

      return data as Outreach;
    },
    onSuccess: (outreach, params) => {
      queryClient.invalidateQueries({
        queryKey: outreachKeys.byOrganisation(params.organisationId),
      });
      queryClient.invalidateQueries({ queryKey: outreachKeys.detail(outreach.id) });
    },
  });
}
