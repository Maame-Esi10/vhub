import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { outreachKeys } from '@/hooks/useOutreaches';
import type { ExperienceLevel, OutreachRole, OutreachRoleType, VolunteerCategory } from '@/types/database';

export const outreachRoleKeys = {
  all: ['outreach-roles'] as const,
  byOutreach: (outreachId: string) => [...outreachRoleKeys.all, 'outreach', outreachId] as const,
};

/**
 * The per-category role slots of one outreach.
 *
 * An EMPTY array is the meaningful, common answer: it means single-role mode,
 * where `outreaches.required_category` describes the requirement. Callers must
 * treat empty as "not a multi-role outreach" rather than as missing data —
 * that distinction is the whole compatibility story.
 *
 * Ordered by slot count descending so the largest requirement reads first,
 * then by category for a stable order between equal roles.
 */
export function useOutreachRoles(outreachId: string | undefined) {
  return useQuery({
    queryKey: outreachRoleKeys.byOutreach(outreachId ?? 'unknown'),
    enabled: !!outreachId,
    queryFn: async (): Promise<OutreachRole[]> => {
      const { data, error } = await supabase
        .from('outreach_roles')
        .select('*')
        .eq('outreach_id', outreachId!)
        .order('slots_total', { ascending: false })
        .order('category', { ascending: true });

      if (error) {
        throw new Error(error.message || 'Could not load the roles for this outreach.');
      }

      return (data ?? []) as OutreachRole[];
    },
  });
}

/**
 * Roles for MANY outreaches at once, keyed by outreach id.
 *
 * One `.in()` query rather than one per card: the feed renders up to fifty
 * outreaches, and a per-card query would turn a single screen into fifty round
 * trips. An outreach absent from the map is in single-role mode.
 *
 * The key is the SORTED id list, so two renders with the same outreaches in a
 * different order share a cache entry instead of refetching.
 */
export function useOutreachRolesForMany(outreachIds: readonly string[]) {
  const key = [...outreachIds].sort().join(',');

  return useQuery({
    queryKey: [...outreachRoleKeys.all, 'many', key] as const,
    enabled: outreachIds.length > 0,
    queryFn: async (): Promise<Record<string, OutreachRole[]>> => {
      const { data, error } = await supabase
        .from('outreach_roles')
        .select('*')
        .in('outreach_id', outreachIds as string[])
        .order('slots_total', { ascending: false })
        .order('category', { ascending: true });

      if (error) {
        throw new Error(error.message || 'Could not load outreach roles.');
      }

      const byOutreach: Record<string, OutreachRole[]> = {};
      for (const row of (data ?? []) as OutreachRole[]) {
        byOutreach[row.outreach_id] = [...(byOutreach[row.outreach_id] ?? []), row];
      }
      return byOutreach;
    },
  });
}

/** A role as the create/edit form holds it, before it has a database id. */
export interface RoleDraft {
  category: VolunteerCategory;
  roleType: OutreachRoleType;
  /** Null means any level. */
  minExperienceLevel: ExperienceLevel | null;
  slotsTotal: number;
}

export interface ReplaceOutreachRolesParams {
  outreachId: string;
  roles: RoleDraft[];
}

/**
 * Replaces an outreach's roles wholesale.
 *
 * Delete-then-insert rather than a diff. The roles of a draft outreach are a
 * short list the organisation is still composing, so a diff would add
 * complexity for no gain — and an upsert is actively wrong here, because the
 * natural key is (outreach_id, category, min_experience_level) rather than the
 * primary key, so PostgREST could not resolve the conflict target.
 *
 * `slots_filled` is never sent: it is derived by trigger and absent from the
 * grant lists, so including it would fail with `permission denied for table
 * outreach_roles` (42501).
 *
 * Deleting a role sets `applications.outreach_role_id` to NULL rather than
 * cascading, so an application to a removed role survives as a record. That is
 * why this is safe to offer on a DRAFT outreach and should be used with care
 * once people have applied.
 */
export function useReplaceOutreachRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReplaceOutreachRolesParams): Promise<OutreachRole[]> => {
      const { error: deleteError } = await supabase
        .from('outreach_roles')
        .delete()
        .eq('outreach_id', params.outreachId);

      if (deleteError) {
        throw new Error(deleteError.message || 'Could not update the roles for this outreach.');
      }

      if (params.roles.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from('outreach_roles')
        .insert(
          params.roles.map((role) => ({
            outreach_id: params.outreachId,
            category: role.category,
            role_type: role.roleType,
            min_experience_level: role.minExperienceLevel,
            slots_total: role.slotsTotal,
          }))
        )
        .select();

      if (error) {
        throw new Error(roleWriteMessage(error.message));
      }

      return (data ?? []) as OutreachRole[];
    },
    onSuccess: (_roles, params) => {
      queryClient.invalidateQueries({ queryKey: outreachRoleKeys.byOutreach(params.outreachId) });
      // slots_total and slots_filled on the outreach are re-derived by trigger
      // from these rows, so every outreach list and detail moves with this write.
      queryClient.invalidateQueries({ queryKey: outreachKeys.all });
    },
  });
}

/** Postgres unique violation — here, the (outreach, category, experience) index. */
const UNIQUE_VIOLATION = '23505';

function roleWriteMessage(message: string): string {
  if (message.includes(UNIQUE_VIOLATION) || message.toLowerCase().includes('duplicate key')) {
    return 'You have two roles with the same category and experience level. Combine them into one.';
  }
  return message || 'Could not save these roles. Please try again.';
}
