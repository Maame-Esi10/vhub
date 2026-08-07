import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { submitEventReview } from '@/lib/api-client';
import type { VScoreReviewResponse } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { applicationKeys } from '@/hooks/useApplications';
import { publicProfileKeys } from '@/hooks/usePublicProfiles';
import type { EventReview } from '@/types/database';

export const eventReviewKeys = {
  all: ['event-reviews'] as const,
  byOutreach: (outreachId: string) => [...eventReviewKeys.all, 'outreach', outreachId] as const,
};

/**
 * Every review this organisation has already filed for one outreach, keyed by
 * volunteer id so the screen can show which volunteers are still outstanding
 * and pre-fill the form when a review is being edited.
 *
 * Read directly from Supabase rather than through the API:
 * `event_reviews_select_org_or_volunteer` already scopes the table to the
 * owning organisation, and reading needs no secret. Only the WRITE goes
 * through /api/vscore, because that is what recomputes v_score.
 */
export function useOutreachReviews(outreachId: string | undefined) {
  return useQuery({
    queryKey: eventReviewKeys.byOutreach(outreachId ?? 'unknown'),
    enabled: !!outreachId,
    queryFn: async (): Promise<Map<string, EventReview>> => {
      const { data, error } = await supabase
        .from('event_reviews')
        .select('*')
        .eq('outreach_id', outreachId!);

      if (error) {
        throw new Error(error.message || 'Could not load reviews for this outreach.');
      }

      const byVolunteer = new Map<string, EventReview>();
      for (const review of (data ?? []) as EventReview[]) {
        byVolunteer.set(review.volunteer_id, review);
      }
      return byVolunteer;
    },
  });
}

export interface SubmitEventReviewParams {
  outreachId: string;
  volunteerId: string;
  attended: boolean;
  /** 1–5, or null when not scored. A no-show is scored on neither. */
  reliabilityScore: number | null;
  clinicalScore: number | null;
  /** Slugs from `constants/review-remarks.ts`; `[]` clears any previously filed chips. */
  remarkChips: string[];
  notes: string | null;
}

/**
 * Files (or re-files) the post-event review and recomputes the volunteer's
 * V-Score.
 *
 * Both halves happen inside `/api/vscore`, not here: the V-Score formula
 * (new = 0.7×old + 0.3×event_outcome) must never be computed client-side, and
 * `volunteer_profiles.v_score` is not writable by an organisation under RLS.
 * The endpoint upserts the review and the new score together, so the two can
 * never drift apart — which is why this hook does not also write
 * `event_reviews` itself even though RLS would allow it.
 */
export function useSubmitEventReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SubmitEventReviewParams): Promise<VScoreReviewResponse> =>
      submitEventReview({
        outreachId: params.outreachId,
        volunteerId: params.volunteerId,
        attended: params.attended,
        reliabilityScore: params.reliabilityScore,
        clinicalScore: params.clinicalScore,
        remarkChips: params.remarkChips,
        notes: params.notes ?? undefined,
      }),
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({ queryKey: eventReviewKeys.byOutreach(params.outreachId) });
      // The volunteer's v_score just moved, so any screen showing their band
      // (public profile, applicant card) needs to refetch.
      queryClient.invalidateQueries({ queryKey: publicProfileKeys.volunteer(params.volunteerId) });
      queryClient.invalidateQueries({ queryKey: applicationKeys.byOutreach(params.outreachId) });
    },
  });
}
