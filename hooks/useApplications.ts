import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import {
  fetchWaitlistPositions,
  scoreMyApplication,
  setApplicationStatus,
  setApplicationStatusBatch,
  type BatchApplicationDecision,
  type BatchApplicationStatusResponse,
  type WaitlistPosition,
} from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { outreachKeys } from '@/hooks/useOutreaches';
import type { OutreachOrganisation } from '@/hooks/useOutreaches';
import type {
  Application,
  ApplicationStatus,
  ApplicationType,
  ExperienceLevel,
  Outreach,
  VerificationStatus,
  VolunteerCategory,
} from '@/types/database';

export const applicationKeys = {
  all: ['applications'] as const,
  byOutreach: (outreachId: string) => [...applicationKeys.all, 'outreach', outreachId] as const,
  byVolunteer: (volunteerId: string) => [...applicationKeys.all, 'volunteer', volunteerId] as const,
  mine: (volunteerId: string, outreachId: string) =>
    [...applicationKeys.all, 'mine', volunteerId, outreachId] as const,
};

/** Statuses an organisation may set on an application to its own outreach. */
export type OrganisationApplicationDecision = Extract<
  ApplicationStatus,
  'accepted' | 'rejected' | 'waitlisted' | 'pending'
>;

/** The volunteer identity fields an org is allowed to see for an applicant. */
export interface ApplicantProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  region: string | null;
  district: string | null;
  phone: string | null;
  email: string | null;
}

export interface ApplicantVolunteer {
  id: string;
  category: VolunteerCategory | null;
  skill_tags: string[] | null;
  specialties: string[] | null;
  experience_level: ExperienceLevel | null;
  availability_slots: string[] | null;
  bio: string | null;
  v_score: number;
  events_attended: number;
  verification_status: VerificationStatus;
  profile: ApplicantProfile | null;
}

export interface ApplicationWithVolunteer extends Application {
  volunteer: ApplicantVolunteer | null;
}

/**
 * Nested embed rather than three separate queries: `applications.volunteer_id`
 * FKs to `volunteer_profiles.id`, which itself FKs to `profiles.id`, so
 * PostgREST can resolve the whole chain in one request. Both hops are
 * unambiguous (exactly one FK between each pair), so the relationships are
 * named by table rather than by constraint name — that survives a schema
 * re-run that happens to rename a constraint.
 *
 * The org's read access to these two rows comes from the applicant clauses of
 * `profiles_select_authenticated` / `volunteer_profiles_select_authenticated`,
 * which only expose a volunteer to an org the volunteer has actually applied
 * to. `volunteer` can still come back null if RLS filters the embed, so every
 * consumer must treat it as optional.
 */
const APPLICATION_WITH_VOLUNTEER_SELECT = `
  *,
  volunteer:volunteer_profiles (
    id,
    category,
    skill_tags,
    specialties,
    experience_level,
    availability_slots,
    bio,
    v_score,
    events_attended,
    verification_status,
    profile:profiles (
      id,
      full_name,
      avatar_url,
      region,
      district,
      phone,
      email
    )
  )
`;

/**
 * Every application to one outreach, with the applicant's volunteer profile.
 *
 * Ordered best-match first. match_score is null until the Phase 3 `/api/match`
 * endpoint writes it (it is service-role write-only), so unscored applications
 * sort last via `nullsFirst: false` and fall back to oldest-application-first
 * — which is the fair default while scoring does not exist yet.
 */
export function useOutreachApplications(outreachId: string | undefined) {
  return useQuery({
    queryKey: applicationKeys.byOutreach(outreachId ?? 'unknown'),
    enabled: !!outreachId,
    queryFn: async (): Promise<ApplicationWithVolunteer[]> => {
      const { data, error } = await supabase
        .from('applications')
        .select(APPLICATION_WITH_VOLUNTEER_SELECT)
        .eq('outreach_id', outreachId!)
        .order('match_score', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(error.message || 'Could not load applicants. Please try again.');
      }

      return (data ?? []) as unknown as ApplicationWithVolunteer[];
    },
  });
}

export interface UpdateApplicationStatusParams {
  applicationId: string;
  /** Needed to invalidate the right applicant list — not sent to the server. */
  outreachId: string;
  status: OrganisationApplicationDecision;
}

/**
 * Accept / reject / waitlist an application (or move one back to pending).
 *
 * Accept, reject and waitlist all go through `/api/application-status` rather
 * than writing Supabase directly, because the decision has side effects only
 * the service role can perform: the Resend status email to the applicant, the
 * Expo push, and — when an accepted spot is later freed — promoting the
 * highest-match waitlisted applicant, which is another volunteer's row and so
 * is unreachable under this organisation's RLS.
 *
 * Reverting a decision back to `pending` stays a direct Supabase write: the
 * endpoint deliberately does not accept `pending` (there is no such thing as
 * an "un-decided" email to send), and the org's own RLS policy already
 * permits it.
 *
 * Either way only `status` moves. slots_filled is recomputed from accepted
 * applications by `trg_applications_sync_slots_filled` (supabase/schema.sql)
 * so two admins accepting concurrently can never double-count a slot, and
 * `slots_filled_le_total` rejects the accept that would overfill the event —
 * surfaced here, and by the endpoint, as the same readable message.
 */
export function useUpdateApplicationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateApplicationStatusParams): Promise<Application> => {
      if (params.status === 'pending') {
        const { data, error } = await supabase
          .from('applications')
          .update({ status: 'pending' })
          .eq('id', params.applicationId)
          .select()
          .single();

        if (error || !data) {
          throw new Error(applicationUpdateMessage(error));
        }

        return data as Application;
      }

      const response = await setApplicationStatus(params.applicationId, params.status);
      return response.application as unknown as Application;
    },
    onSuccess: (_application, params) => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.byOutreach(params.outreachId) });
      // The dashboard's per-status counts and the outreach's slots_filled both
      // move with this write, so refresh every outreach list/detail too.
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
    },
  });
}

export interface BatchDecideParams {
  outreachId: string;
  decisions: BatchApplicationDecision[];
}

/**
 * Accepts / waitlists / rejects many applicants in one request — the
 * organisation's one-tap response to an oversubscribed outreach.
 *
 * The decision list is built client-side by `planBatchAccept` (lib/roster.ts)
 * so the organisation acts on exactly the ranking it can see, and the order is
 * preserved all the way to the server, which fills the free slots in that order.
 *
 * A partial success is a SUCCESS, not an error: if the roster filled up while
 * the request was in flight, the volunteers who did get a place keep it and the
 * response's `failed` list names the ones who did not. Throwing here would
 * misreport a batch that mostly worked as a batch that did nothing.
 */
export function useBatchDecideApplications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: BatchDecideParams): Promise<BatchApplicationStatusResponse> =>
      setApplicationStatusBatch(params.outreachId, params.decisions),
    onSuccess: (_response, params) => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.byOutreach(params.outreachId) });
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
    },
  });
}

/** Postgres check-constraint violation (`slots_filled <= slots_total`). */
const CHECK_VIOLATION = '23514';
/** Postgres unique violation — here, `unique (outreach_id, volunteer_id)`. */
const UNIQUE_VIOLATION = '23505';
/** PostgREST/Postgres: row violates row-level security policy. */
const RLS_VIOLATION = '42501';

function applicationUpdateMessage(error: PostgrestError | null): string {
  if (error?.code === CHECK_VIOLATION) {
    return 'This outreach is already full. Close a slot or increase the total before accepting another volunteer.';
  }
  return error?.message || 'Could not update this application. Please try again.';
}

// ============================================================
// Volunteer side
// ============================================================

/**
 * An application as the volunteer sees it: the event they applied to, and who
 * is running it. Both embeds are readable — `outreaches_select_open_or_own`
 * exposes any non-draft outreach, and `organisation_profiles` is open to all
 * authenticated users.
 */
export interface VolunteerApplication extends Application {
  outreach: (Outreach & { organisation: OutreachOrganisation | null }) | null;
}

const VOLUNTEER_APPLICATION_SELECT = `
  *,
  outreach:outreaches (
    *,
    organisation:organisation_profiles (
      id,
      org_name,
      org_type,
      verified
    )
  )
`;

/**
 * Every application this volunteer has made, newest first. The tracker screen
 * groups them by status client-side rather than running one query per status.
 */
export function useVolunteerApplications(volunteerId: string | undefined) {
  return useQuery({
    queryKey: applicationKeys.byVolunteer(volunteerId ?? 'unknown'),
    enabled: !!volunteerId,
    queryFn: async (): Promise<VolunteerApplication[]> => {
      const { data, error } = await supabase
        .from('applications')
        .select(VOLUNTEER_APPLICATION_SELECT)
        .eq('volunteer_id', volunteerId!)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message || 'Could not load your applications. Please try again.');
      }

      return (data ?? []) as unknown as VolunteerApplication[];
    },
  });
}

/**
 * This volunteer's application to one specific outreach, or null if they
 * haven't applied. Drives the outreach detail screen's call to action, so it
 * is fetched directly rather than derived from `useVolunteerApplications` —
 * the detail screen is deep-linkable and may be the first thing that loads.
 */
export function useMyApplicationForOutreach(
  volunteerId: string | undefined,
  outreachId: string | undefined
) {
  return useQuery({
    queryKey: applicationKeys.mine(volunteerId ?? 'unknown', outreachId ?? 'unknown'),
    enabled: !!volunteerId && !!outreachId,
    queryFn: async (): Promise<Application | null> => {
      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .eq('volunteer_id', volunteerId!)
        .eq('outreach_id', outreachId!)
        .maybeSingle();

      if (error) {
        throw new Error(error.message || 'Could not check your application status.');
      }

      return (data as Application | null) ?? null;
    },
  });
}

/**
 * The signed-in volunteer's place in the queue for each outreach they are
 * waitlisted on, keyed by application id.
 *
 * Best-effort by design: it returns an empty map on failure rather than
 * throwing, because the applications screen must still render every
 * application if the position service is unreachable. A missing position shows
 * as no position — never as an error over the whole list.
 *
 * Refetched on mount rather than cached for long: the queue moves whenever
 * another applicant withdraws or is accepted, and a stale position is worse
 * than none.
 */
export function useMyWaitlistPositions(volunteerId: string | undefined) {
  return useQuery({
    queryKey: [...applicationKeys.all, 'waitlist-positions', volunteerId ?? 'unknown'] as const,
    enabled: !!volunteerId,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, WaitlistPosition>> => {
      try {
        const { positions } = await fetchWaitlistPositions();
        return new Map(positions.map((p) => [p.applicationId, p]));
      } catch (error) {
        console.warn(
          '[applications] could not load waitlist positions:',
          error instanceof Error ? error.message : error
        );
        return new Map();
      }
    },
  });
}

export interface CreateApplicationParams {
  outreachId: string;
  /** Must equal the signed-in volunteer's auth uid — `applications_insert_own` enforces it. */
  volunteerId: string;
  /** `quick_join` for one-tap support roles, `full` for the clinical application form. */
  type: ApplicationType;
  /** Statement of intent from the Full Application form. Null for quick joins. */
  motivation?: string | null;
}

/**
 * Applies to an outreach, then scores the new application.
 *
 * status/match_score are not sent on the insert: status defaults to
 * 'pending', and match_score is service-role write-only. The follow-up
 * `scoreMyApplication` call is what fills it in, running Layer 1 (+ Gemini
 * Layer 2) against the database's own copy of both profiles.
 *
 * That second call is deliberately BEST-EFFORT: the application already
 * exists and is valid without a score, so a scoring failure must not surface
 * as "your application failed" or roll anything back. An unscored application
 * simply sorts last in the organisation's list until the org's own
 * `scoreApplicants` run picks it up.
 */
export function useCreateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateApplicationParams): Promise<Application> => {
      const motivation = params.motivation?.trim() ? params.motivation.trim() : null;

      // A withdrawn application still occupies the UNIQUE (outreach_id,
      // volunteer_id) slot, so re-applying cannot INSERT — it would fail with
      // a unique violation whose message ("You've already applied to this
      // outreach") is nonsense to someone who just withdrew. Reactivate the
      // existing row instead.
      //
      // Not an .upsert(): PostgREST compiles ON CONFLICT DO UPDATE with every
      // payload column in the SET clause, and applications' UPDATE grant list
      // deliberately excludes outreach_id/volunteer_id, so the statement would
      // be rejected outright (42501). An explicit .update() names only the
      // granted columns.
      const { data: existing, error: existingError } = await supabase
        .from('applications')
        .select('id, status')
        .eq('outreach_id', params.outreachId)
        .eq('volunteer_id', params.volunteerId)
        .maybeSingle();

      if (existingError) {
        throw new Error(existingError.message || 'Could not check your application status.');
      }

      if (existing && existing.status !== 'cancelled') {
        throw new Error("You've already applied to this outreach.");
      }

      const { data, error } = existing
        ? await supabase
            .from('applications')
            .update({
              status: 'pending',
              type: params.type,
              motivation,
              cancellation_reason: null,
            })
            .eq('id', existing.id)
            .select()
            .single()
        : await supabase
            .from('applications')
            .insert({
              outreach_id: params.outreachId,
              volunteer_id: params.volunteerId,
              type: params.type,
              motivation,
            })
            .select()
            .single();

      if (error || !data) {
        throw new Error(applicationInsertMessage(error));
      }

      try {
        const scored = await scoreMyApplication(params.outreachId);
        return { ...(data as Application), match_score: scored.matchScore };
      } catch (scoringError) {
        console.warn(
          '[applications] could not score this application:',
          scoringError instanceof Error ? scoringError.message : scoringError
        );
        return data as Application;
      }
    },
    onSuccess: (application, params) => {
      queryClient.invalidateQueries({
        queryKey: applicationKeys.mine(params.volunteerId, params.outreachId),
      });
      queryClient.invalidateQueries({
        queryKey: applicationKeys.byVolunteer(params.volunteerId),
      });
      queryClient.invalidateQueries({ queryKey: applicationKeys.byOutreach(params.outreachId) });
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
    },
  });
}

function applicationInsertMessage(error: PostgrestError | null): string {
  if (error?.code === UNIQUE_VIOLATION) {
    return "You've already applied to this outreach.";
  }
  if (error?.code === RLS_VIOLATION) {
    // The insert policy folds three conditions together, so the code alone
    // can't say which one failed. The UI blocks the verification and
    // closed-event cases before getting here, so this is the backstop wording.
    return 'You are not eligible to apply to this outreach. Clinical outreaches need a verified profile, and closed outreaches no longer accept applications.';
  }
  return error?.message || 'Could not submit your application. Please try again.';
}

export interface CancelApplicationParams {
  applicationId: string;
  /** Needed only to invalidate the right caches. */
  volunteerId: string;
  outreachId: string;
  /** Optional withdrawal reason from the Figma "Withdrawal Process" screen. */
  reason?: string | null;
}

/**
 * Withdraws an application.
 *
 * Only `status` and the free-text `cancellation_reason` are written, and
 * status can only ever be written to 'cancelled' —
 * `applications_update_own_cancel` pins the volunteer to exactly that value.
 * cancelled_at and late_cancellation are stamped by the
 * `trg_applications_stamp_cancellation` BEFORE trigger (supabase/schema.sql),
 * which is also what decides whether the withdrawal counts as late (within 24
 * hours of the event start). Doing it there rather than here means a
 * volunteer can't backdate a withdrawal to dodge the bigger V-Score penalty,
 * and the returned row carries the values the trigger actually wrote.
 *
 * `/api/application-status` is then called with the same 'cancelled' status.
 * That second call is idempotent (the row is already cancelled, so it is a
 * no-op write) and exists purely to run the step this direct write cannot:
 * promoting the highest-match waitlisted applicant into the freed slot and
 * notifying them, which touches another volunteer's row and so needs the
 * service role. Best-effort — the withdrawal itself has already succeeded, so
 * a promotion failure must not be reported to the volunteer as a failed
 * withdrawal.
 */
export function useCancelApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CancelApplicationParams): Promise<Application> => {
      const { data, error } = await supabase
        .from('applications')
        .update({
          status: 'cancelled',
          cancellation_reason: params.reason?.trim() ? params.reason.trim() : null,
        })
        .eq('id', params.applicationId)
        .select()
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Could not withdraw your application. Please try again.');
      }

      try {
        await setApplicationStatus(params.applicationId, 'cancelled');
      } catch (promotionError) {
        console.warn(
          '[applications] withdrawal saved, but waitlist promotion could not run:',
          promotionError instanceof Error ? promotionError.message : promotionError
        );
      }

      return data as Application;
    },
    onSuccess: (_application, params) => {
      queryClient.invalidateQueries({
        queryKey: applicationKeys.byVolunteer(params.volunteerId),
      });
      queryClient.invalidateQueries({
        queryKey: applicationKeys.mine(params.volunteerId, params.outreachId),
      });
      queryClient.invalidateQueries({ queryKey: applicationKeys.byOutreach(params.outreachId) });
      // Withdrawing an accepted application frees a slot (slots_filled is
      // re-derived by trigger), so the feed and dashboard both move.
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
    },
  });
}
