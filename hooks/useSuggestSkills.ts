import { useMutation } from '@tanstack/react-query';
import { suggestSkills } from '@/lib/api-client';

export interface SkillSuggestion {
  skills: string[];
  /** See SkillSuggestionResponse: 'matched' read the text, 'general' did not. */
  basis: 'matched' | 'general';
}

/**
 * Asks the API which of the existing skills fit a piece of free text.
 *
 * A MUTATION, NOT A QUERY, and that is the whole point. A query would refetch
 * on focus, on reconnect and on remount, and each of those is a Gemini call
 * against a ~1,500-a-day allowance shared by every user. This fires when
 * somebody presses a button and at no other time: one call per outreach
 * created, one per volunteer onboarding.
 *
 * IT CANNOT FAIL IN A WAY A SCREEN HAS TO HANDLE. The endpoint answers
 * `{ skills: [] }` for every unavailable case -- no key, timeout, quota gone,
 * nothing relevant -- so the caller's only states are "some suggestions" and
 * "none", and "none" means show the ordinary picker. A network failure still
 * rejects, which is why callers read `isError` only to offer a retry, never to
 * block the form.
 */
export function useSuggestSkills() {
  return useMutation({
    mutationFn: async (description: string): Promise<SkillSuggestion> => {
      const result = await suggestSkills(description);
      return {
        skills: Array.isArray(result.skills) ? result.skills : [],
        // An older deployment answers without `basis`. Treating that as
        // 'general' is the safe direction: it under-claims rather than telling
        // somebody their words produced a shortlist when they may not have.
        basis: result.basis === 'matched' ? 'matched' : 'general',
      };
    },
  });
}
