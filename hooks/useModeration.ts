import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { moderateAccount } from '@/lib/api-client';
import { adminActionKeys } from '@/hooks/useAdminActions';
import type { ModerationState, ProfileRole } from '@/types/database';

export const moderationKeys = {
  all: ['moderation'] as const,
  search: (term: string) => [...moderationKeys.all, 'search', term] as const,
};

export interface ModerationSearchRow {
  id: string;
  full_name: string;
  email: string | null;
  role: ProfileRole;
  region: string | null;
  moderation_state: ModerationState;
  moderation_reason: string | null;
}

/**
 * Finds an account to moderate, by name or email.
 *
 * SEARCH RATHER THAN A LIST, deliberately. Moderation starts with a specific
 * complaint about a specific person; a browsable roll of every account on the
 * platform invites looking through people for its own sake, and would be the
 * one screen in the app where an admin's reach over ordinary users is casual
 * rather than deliberate.
 *
 * Nothing is returned until at least two characters are typed, for the same
 * reason: an empty search is a directory.
 *
 * `moderation_state <> 'active'` rows are ALSO returned by an empty-ish search
 * — see `useModeratedAccounts` — because an admin needs to be able to find
 * everyone currently suspended without remembering their names.
 */
export function useAccountSearch(term: string) {
  const role = useAuthStore((state) => state.profile?.role);
  const trimmed = term.trim();

  return useQuery({
    queryKey: moderationKeys.search(trimmed),
    enabled: role === 'admin' && trimmed.length >= 2,
    queryFn: async (): Promise<ModerationSearchRow[]> => {
      const pattern = `%${trimmed}%`;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, region, moderation_state, moderation_reason')
        .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
        // Admins are excluded from the results rather than merely refused by
        // the endpoint: offering an action that will always fail is worse than
        // not offering it.
        .neq('role', 'admin')
        // A closed account is not a person any more. Its row survives so other
        // people's event history survives, but there is nobody to suspend and
        // nothing a suspension would stop.
        .is('closed_at', null)
        .order('full_name')
        .limit(25);

      if (error) throw new Error(error.message || 'Could not search accounts.');
      return (data ?? []) as ModerationSearchRow[];
    },
  });
}

/** Everyone currently suspended or banned, so a moderation can be found and undone. */
export function useModeratedAccounts() {
  const role = useAuthStore((state) => state.profile?.role);

  return useQuery({
    queryKey: [...moderationKeys.all, 'moderated'] as const,
    enabled: role === 'admin',
    queryFn: async (): Promise<ModerationSearchRow[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, region, moderation_state, moderation_reason')
        .neq('moderation_state', 'active')
        // Somebody suspended who then closed their account is gone; listing
        // them under "currently stopped" would offer a reinstatement that
        // restores nothing.
        .is('closed_at', null)
        .order('moderated_at', { ascending: false });

      if (error) throw new Error(error.message || 'Could not load moderated accounts.');
      return (data ?? []) as ModerationSearchRow[];
    },
  });
}

export interface ModerateParams {
  targetUserId: string;
  action: 'suspend' | 'ban' | 'reinstate';
  reason: string;
}

export function useModerateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetUserId, action, reason }: ModerateParams) =>
      moderateAccount(targetUserId, action, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: moderationKeys.all });
      void queryClient.invalidateQueries({ queryKey: adminActionKeys.all });
    },
  });
}
