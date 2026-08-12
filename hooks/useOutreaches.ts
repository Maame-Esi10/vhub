import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { ApiClientError, rankFeed } from '@/lib/api-client';
import type { Layer1MatchResult } from '@/lib/matching/layer1';
import { supabase } from '@/lib/supabase';
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
 * Ordered by event date ascending so the soonest event leads each status
 * group on the dashboard.
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
        .order('date', { ascending: true })
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
 * `organisation_profiles` is readable by every authenticated user
 * (organisation_profiles_select_authenticated, deliberately `using (true)` —
 * it holds no PII), so this embed is safe on volunteer-facing screens. The
 * org's `profiles` row is NOT joined here: that one is row-scoped and would
 * come back null for orgs the volunteer has never applied to.
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
