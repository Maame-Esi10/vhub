import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { EventReview, RemarkCount, VolunteerReviewSummary } from '@/types/database';

/**
 * The two sides of post-event feedback, and they are deliberately not the same
 * data (owner decision, 2026-08-05):
 *
 *   - the VOLUNTEER sees every review of themselves in full, notes included
 *   - an ORGANISATION sees only an aggregate, never an individual review
 *
 * A volunteer can act on specific feedback about a specific day; an
 * organisation only needs the shape of someone's record, and giving it more
 * would let one bad day or one grumpy reviewer follow a volunteer around.
 */

export const feedbackKeys = {
  all: ['feedback'] as const,
  mine: (volunteerId: string) => [...feedbackKeys.all, 'mine', volunteerId] as const,
  summary: (volunteerId: string) => [...feedbackKeys.all, 'summary', volunteerId] as const,
};

/** One review of the signed-in volunteer, with the event it belongs to. */
export interface MyEventReview extends EventReview {
  outreach: {
    id: string;
    title: string;
    date: string;
    role_type: string | null;
  } | null;
}

/**
 * Every review filed about the signed-in volunteer, newest event first.
 *
 * Read straight from Supabase: `event_reviews_select_org_or_volunteer` already
 * restricts this to `volunteer_id = auth.uid()` for a volunteer, so the query
 * cannot return anyone else's feedback however it is written.
 *
 * The reviewing organisation is deliberately NOT joined. The volunteer can see
 * which EVENT each review belongs to, which is what makes feedback actionable,
 * and the event already implies the organisation — but naming the reviewer
 * turns "this is how the day went" into "this person said this about you",
 * which is a different and more combative thing.
 */
export function useMyReviews(volunteerId: string | undefined) {
  return useQuery({
    queryKey: feedbackKeys.mine(volunteerId ?? 'unknown'),
    enabled: !!volunteerId,
    queryFn: async (): Promise<MyEventReview[]> => {
      const { data, error } = await supabase
        .from('event_reviews')
        .select(
          `
          *,
          outreach:outreaches (
            id,
            title,
            date,
            role_type
          )
        `
        )
        .eq('volunteer_id', volunteerId!)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message || 'Could not load your feedback. Please try again.');
      }
      return (data ?? []) as MyEventReview[];
    },
  });
}

/**
 * The aggregate an ORGANISATION may see about a volunteer.
 *
 * Reads `volunteer_review_summary`, which runs with owner rights so the counts
 * cover the volunteer's whole record rather than only the caller's own
 * reviews. The aggregate is the privacy boundary: no individual review, no
 * note, no reviewer, nothing that identifies who said what.
 */
export function useVolunteerReviewSummary(volunteerId: string | undefined) {
  return useQuery({
    queryKey: feedbackKeys.summary(volunteerId ?? 'unknown'),
    enabled: !!volunteerId,
    queryFn: async (): Promise<VolunteerReviewSummary | null> => {
      const { data, error } = await supabase
        .from('volunteer_review_summary')
        .select('*')
        .eq('volunteer_id', volunteerId!)
        .maybeSingle();

      if (error) {
        throw new Error(error.message || 'Could not load this volunteer’s review summary.');
      }
      if (!data) return null;

      const row = data as VolunteerReviewSummary & { remark_counts: unknown };
      return {
        ...row,
        // jsonb arrives as parsed JSON; normalise defensively so a screen
        // never maps over a non-array.
        remark_counts: Array.isArray(row.remark_counts)
          ? (row.remark_counts as RemarkCount[])
          : [],
      };
    },
  });
}
