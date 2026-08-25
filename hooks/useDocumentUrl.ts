import { useQuery } from '@tanstack/react-query';
import { getDocumentUrl, type SignedDocument } from '@/lib/api-client';

export const documentUrlKeys = {
  all: ['document-url'] as const,
  credential: (ownerId: string) => [...documentUrlKeys.all, 'credential', ownerId] as const,
};

/**
 * A short-lived link to one credential document.
 *
 * There is no stored URL to render any more. A credential is a private
 * Cloudinary asset: the database holds only its name, and a fetchable address
 * exists for fifteen minutes at a time, minted by the server for a requester it
 * has just authorised.
 *
 * `staleTime` is set well inside that window so a link is never handed to an
 * <Image> or a browser after it has died — React Query refetches quietly
 * instead. `gcTime` matches: a signed URL is not worth caching past its own
 * lifetime, and keeping one around is the same mistake as storing one.
 *
 * `enabled` on `hasDocument` matters: without it, every visit by a volunteer
 * who has uploaded nothing would fire a request that can only come back 404.
 */
export function useDocumentUrl(ownerId: string | null | undefined, hasDocument: boolean) {
  return useQuery({
    queryKey: documentUrlKeys.credential(ownerId ?? 'me'),
    enabled: hasDocument,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<SignedDocument> => getDocumentUrl(ownerId ?? undefined),
  });
}
