import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export const platformStatsKeys = {
  all: ['platform-stats'] as const,
};

export interface MonthlyNoShows {
  /** `YYYY-MM`, oldest first. */
  month: string;
  reviews: number;
  noShows: number;
}

export interface PlatformStats {
  volunteers: number;
  organisations: number;
  verifiedVolunteers: number;
  verifiedOrganisations: number;
  /** Waiting on an admin: credential submissions plus organisation submissions. */
  backlog: { credentials: number; organisations: number; disputes: number };
  outreachesByStatus: Record<string, number>;
  /** Places filled ÷ places offered, across every event that has actually recruited. */
  fillRate: { filled: number; total: number } | null;
  noShowTrend: MonthlyNoShows[];
}

/** `YYYY-MM` for a date, in local time — the month a person would say it was. */
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The numbers behind the platform, for the admin overview.
 *
 * WHAT IS COUNTED, AND WHY EACH ONE. The brief asks for mobile-appropriate
 * statistics rather than a dashboard, and names the questions worth answering:
 *
 *  - **Fill rate** answers "does the matching work?". An event that recruits
 *    three of its ten places is a matching failure or a reach failure, and no
 *    other number on this screen would show it.
 *  - **No-shows over time** answers "does accountability work?". The absolute
 *    count means little; the direction over months is the whole point, which is
 *    why it is a trend rather than a single figure.
 *  - **The backlog** answers "is anybody waiting on me?" — the one number that
 *    is about the admin's own conduct rather than the platform's.
 *
 * COUNTED IN THE DATABASE, NOT IN JAVASCRIPT, wherever a count is all that is
 * needed: `head: true` with an exact count returns a number and no rows, so a
 * platform with ten thousand applications does not send ten thousand rows to a
 * phone to be counted there.
 *
 * The two that DO fetch rows — fill rate and the no-show trend — fetch two
 * columns each and are bounded: the fill rate reads only events that have
 * recruited, and the trend only the last six months.
 */
export function usePlatformStats() {
  const role = useAuthStore((state) => state.profile?.role);

  return useQuery({
    queryKey: platformStatsKeys.all,
    enabled: role === 'admin',
    // Statistics are a background fact, not a live feed. A minute of staleness
    // costs nothing and saves nine queries every time the tab is opened.
    staleTime: 60 * 1000,
    queryFn: async (): Promise<PlatformStats> => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      sixMonthsAgo.setHours(0, 0, 0, 0);

      const [
        volunteers,
        organisations,
        verifiedVolunteers,
        verifiedOrganisations,
        credentialBacklog,
        organisationBacklog,
        disputeBacklog,
        outreaches,
        reviews,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'volunteer'),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'organisation'),
        supabase
          .from('volunteer_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('verification_status', 'verified'),
        supabase
          .from('organisation_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('verification_state', 'verified'),
        supabase
          .from('volunteer_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('verification_status', 'documents_pending'),
        supabase
          .from('organisation_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('verification_state', 'documents_submitted'),
        supabase.from('disputes').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        // Status, and the two slot counts, for every event. Three small columns.
        supabase.from('outreaches').select('status, slots_total, slots_filled'),
        supabase
          .from('event_reviews')
          .select('attended, created_at')
          .gte('created_at', sixMonthsAgo.toISOString()),
      ]);

      const outreachRows = (outreaches.data ?? []) as {
        status: string;
        slots_total: number | null;
        slots_filled: number | null;
      }[];

      const outreachesByStatus: Record<string, number> = {};
      let filled = 0;
      let total = 0;
      for (const row of outreachRows) {
        outreachesByStatus[row.status] = (outreachesByStatus[row.status] ?? 0) + 1;
        // Drafts and cancelled events are excluded from the fill rate on
        // purpose: a draft never recruited anybody, and a cancelled event's
        // empty places are not a matching failure. Including either would drag
        // the rate down for reasons that have nothing to do with matching.
        if (row.status === 'draft' || row.status === 'cancelled') continue;
        filled += row.slots_filled ?? 0;
        total += row.slots_total ?? 0;
      }

      const reviewRows = (reviews.data ?? []) as { attended: boolean; created_at: string }[];
      const byMonth = new Map<string, { reviews: number; noShows: number }>();

      // Every month in the window is seeded, including empty ones. A trend with
      // quiet months missing reads as a line that jumped, when in fact nothing
      // happened.
      for (let index = 0; index < 6; index += 1) {
        const cursor = new Date(sixMonthsAgo);
        cursor.setMonth(cursor.getMonth() + index);
        byMonth.set(monthKey(cursor), { reviews: 0, noShows: 0 });
      }

      for (const row of reviewRows) {
        const key = monthKey(new Date(row.created_at));
        const bucket = byMonth.get(key);
        if (!bucket) continue;
        bucket.reviews += 1;
        if (row.attended === false) bucket.noShows += 1;
      }

      return {
        volunteers: volunteers.count ?? 0,
        organisations: organisations.count ?? 0,
        verifiedVolunteers: verifiedVolunteers.count ?? 0,
        verifiedOrganisations: verifiedOrganisations.count ?? 0,
        backlog: {
          credentials: credentialBacklog.count ?? 0,
          organisations: organisationBacklog.count ?? 0,
          disputes: disputeBacklog.count ?? 0,
        },
        outreachesByStatus,
        fillRate: total > 0 ? { filled, total } : null,
        noShowTrend: Array.from(byMonth.entries()).map(([month, value]) => ({ month, ...value })),
      };
    },
  });
}
