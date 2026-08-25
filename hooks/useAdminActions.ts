import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { AdminAction, AdminActionTargetType } from '@/types/database';

export const adminActionKeys = {
  all: ['admin-actions'] as const,
  list: () => [...adminActionKeys.all, 'list'] as const,
  forTarget: (targetType: AdminActionTargetType, targetId: string) =>
    [...adminActionKeys.all, 'target', targetType, targetId] as const,
};

/**
 * The audit trail, newest first.
 *
 * Read straight from Supabase rather than through the serverless API: the
 * `admin_actions_select_admin` policy already restricts the table to admins,
 * and reading needs no secret. The WRITES are the asymmetric half — the client
 * has no INSERT/UPDATE/DELETE privilege at all, so every admin decision from
 * package C onwards is recorded by the API on the service-role key.
 *
 * `enabled` on the role means a volunteer or organisation never fires the
 * query. They would get an empty array rather than an error (RLS filters, it
 * does not refuse), which is harmless but is a request for nothing.
 */
export function useAdminActions(limit = 100) {
  const role = useAuthStore((state) => state.profile?.role);

  return useQuery({
    queryKey: [...adminActionKeys.list(), limit] as const,
    enabled: role === 'admin',
    queryFn: async (): Promise<AdminAction[]> => {
      const { data, error } = await supabase
        .from('admin_actions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message || 'Could not load the admin activity log.');
      }
      return (data ?? []) as AdminAction[];
    },
  });
}

/**
 * Everything ever done to one organisation, volunteer, outreach or dispute —
 * the history strip the verification, moderation and dispute screens will each
 * want on their detail view. Backed by the (target_type, target_id,
 * created_at desc) index.
 */
export function useAdminActionsForTarget(
  targetType: AdminActionTargetType,
  targetId: string | null | undefined
) {
  const role = useAuthStore((state) => state.profile?.role);

  return useQuery({
    queryKey: adminActionKeys.forTarget(targetType, targetId ?? 'none'),
    enabled: role === 'admin' && !!targetId,
    queryFn: async (): Promise<AdminAction[]> => {
      const { data, error } = await supabase
        .from('admin_actions')
        .select('*')
        .eq('target_type', targetType)
        .eq('target_id', targetId as string)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message || 'Could not load the history for this record.');
      }
      return (data ?? []) as AdminAction[];
    },
  });
}
