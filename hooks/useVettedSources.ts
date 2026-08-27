import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { addVettedSource, removeVettedSource, type VettedSourceInput } from '@/lib/api-client';
import { adminActionKeys } from '@/hooks/useAdminActions';

export const vettedSourceKeys = {
  all: ['vetted-sources'] as const,
};

export interface VettedSource {
  id: string;
  name: string;
  url: string;
  source_type: string | null;
  rationale: string;
  added_by: string | null;
  created_at: string;
}

/**
 * The whitelist. SURFACE ONLY — nothing in the app reads it to fetch anything,
 * and no outreach is ever created from a source on it.
 */
export function useVettedSources() {
  const role = useAuthStore((state) => state.profile?.role);

  return useQuery({
    queryKey: vettedSourceKeys.all,
    enabled: role === 'admin',
    queryFn: async (): Promise<VettedSource[]> => {
      const { data, error } = await supabase
        .from('vetted_sources')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message || 'Could not load the vetted sources.');
      return (data ?? []) as VettedSource[];
    },
  });
}

export function useAddVettedSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (source: VettedSourceInput) => addVettedSource(source),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vettedSourceKeys.all });
      void queryClient.invalidateQueries({ queryKey: adminActionKeys.all });
    },
  });
}

export function useRemoveVettedSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => removeVettedSource(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vettedSourceKeys.all });
      void queryClient.invalidateQueries({ queryKey: adminActionKeys.all });
    },
  });
}
