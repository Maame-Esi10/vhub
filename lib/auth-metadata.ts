import type { OrgType } from '@/constants/org-types';
import type { ProfileRole } from '@/types/database';

/**
 * Shape stored in Supabase auth.users.user_metadata (via signUp's
 * options.data) at registration time. This is the only place role/name/org
 * fields survive when email confirmation is required — signUp returns no
 * session in that case, so the profiles/volunteer_profiles/
 * organisation_profiles rows can't be created yet. useAuthGuard reads this
 * metadata to bootstrap those rows on the user's first authenticated
 * session after they confirm their email and log in.
 */
export interface AuthUserMetadata {
  role: ProfileRole;
  full_name: string;
  org_type?: OrgType | null;
  description?: string | null;
  website?: string | null;
}

export function isAuthUserMetadata(value: unknown): value is AuthUserMetadata {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AuthUserMetadata>;
  return (
    (candidate.role === 'volunteer' || candidate.role === 'organisation') &&
    typeof candidate.full_name === 'string' &&
    candidate.full_name.trim().length > 0
  );
}
