import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { OutreachImage } from '@/types/database';

export const outreachImageKeys = {
  all: ['outreach-images'] as const,
  byOutreach: (outreachId: string) => [...outreachImageKeys.all, 'outreach', outreachId] as const,
  byOrganisation: (organisationId: string) =>
    [...outreachImageKeys.all, 'organisation', organisationId] as const,
};

/** The most an outreach may hold. Enforced for real by `trg_outreach_images_cap`. */
export const MAX_GALLERY_IMAGES = 8;

/**
 * One outreach's gallery, in display order.
 *
 * Ordered by `position` then `created_at` — `position` is not unique, so the
 * tiebreak is what makes the order total. Without it two images sharing a
 * position could swap places between renders.
 */
export function useOutreachImages(outreachId: string | undefined) {
  return useQuery({
    queryKey: outreachImageKeys.byOutreach(outreachId ?? 'unknown'),
    enabled: !!outreachId,
    queryFn: async (): Promise<OutreachImage[]> => {
      const { data, error } = await supabase
        .from('outreach_images')
        .select('*')
        .eq('outreach_id', outreachId!)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(error.message || 'Could not load this outreach’s gallery.');
      }

      return (data ?? []) as OutreachImage[];
    },
  });
}

export interface AddOutreachImagesParams {
  outreachId: string;
  /** Cloudinary URLs, already uploaded. Appended after whatever is there. */
  urls: string[];
  /** How many rows already exist, so the new ones sort after them. */
  startPosition: number;
}

/**
 * Appends images to an outreach's gallery.
 *
 * WRITTEN IMMEDIATELY, NOT ON SAVE. Unlike the roles — where the outreach's own
 * `role_type` and `slots_total` are DERIVED from the child rows, so the two
 * must move together or the event describes one thing and is staffed as
 * another — nothing on `outreaches` depends on these rows. A gallery that is
 * missing an image is not an inconsistent outreach, it is an outreach with
 * fewer images, which is visible on screen and fixed by pressing add again.
 *
 * That is why these do not go through `save_outreach()`. Adding an image is
 * also a discrete act rather than an edit to a field: an organisation who picks
 * a photo expects it to be there, not to be pending until they find a Save
 * button at the bottom of a different section.
 */
export function useAddOutreachImages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddOutreachImagesParams): Promise<OutreachImage[]> => {
      if (params.urls.length === 0) return [];

      const { data, error } = await supabase
        .from('outreach_images')
        .insert(
          params.urls.map((url, index) => ({
            outreach_id: params.outreachId,
            url,
            position: params.startPosition + index,
          }))
        )
        .select();

      if (error) {
        throw new Error(galleryWriteMessage(error.message));
      }

      return (data ?? []) as OutreachImage[];
    },
    onSuccess: (_images, params) => {
      queryClient.invalidateQueries({ queryKey: outreachImageKeys.byOutreach(params.outreachId) });
      queryClient.invalidateQueries({ queryKey: outreachImageKeys.all });
    },
  });
}

export interface DeleteOutreachImageParams {
  imageId: string;
  outreachId: string;
}

/**
 * Removes one image from the gallery.
 *
 * The Cloudinary asset is deliberately left in place. Deleting it needs the
 * API secret and therefore a server round-trip, and an orphaned image on the
 * free tier is cheap; a delete that fails halfway and leaves the row pointing
 * at a destroyed asset is not. The same trade-off the abandoned-wizard flyer
 * already makes.
 */
export function useDeleteOutreachImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeleteOutreachImageParams): Promise<void> => {
      const { error } = await supabase.from('outreach_images').delete().eq('id', params.imageId);

      if (error) {
        throw new Error(error.message || 'Could not remove that image. Please try again.');
      }
    },
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({ queryKey: outreachImageKeys.byOutreach(params.outreachId) });
      queryClient.invalidateQueries({ queryKey: outreachImageKeys.all });
    },
  });
}

export interface ReorderOutreachImagesParams {
  outreachId: string;
  /** Image ids in their new display order. */
  orderedIds: string[];
}

/**
 * Rewrites the display order.
 *
 * One UPDATE per row rather than an upsert: an upsert would compile to
 * `ON CONFLICT (id) DO UPDATE`, which puts every payload column — `id` and
 * `outreach_id` included — into the SET clause, and `outreach_id` is
 * deliberately absent from the UPDATE grant list so an image can never be
 * moved to another event. The upsert would fail with `permission denied`
 * (42501) and the honest fix is not to widen the grant.
 *
 * Galleries are capped at eight, so this is at most eight small writes.
 */
export function useReorderOutreachImages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReorderOutreachImagesParams): Promise<void> => {
      for (const [index, id] of params.orderedIds.entries()) {
        const { error } = await supabase
          .from('outreach_images')
          .update({ position: index })
          .eq('id', id);

        if (error) {
          throw new Error(error.message || 'Could not reorder the gallery. Please try again.');
        }
      }
    },
    onSuccess: (_result, params) => {
      queryClient.invalidateQueries({ queryKey: outreachImageKeys.byOutreach(params.outreachId) });
      queryClient.invalidateQueries({ queryKey: outreachImageKeys.all });
    },
  });
}

/** One gallery image plus the event it came from, for the organisation profile. */
export interface OrganisationGalleryImage extends OutreachImage {
  outreach: { id: string; title: string; date: string } | null;
}

/**
 * The organisation's profile gallery: recent images from its PAST events.
 *
 * AUTOMATIC, NOT CURATED. A curated set needs another screen to build and
 * another thing organisations will not maintain, so the section would sit empty
 * for everyone who never found it. Pulling from what they have already uploaded
 * means it fills itself as they run events, which is the behaviour that makes
 * it worth having at all.
 *
 * PAST events only, so the profile shows work that actually happened rather
 * than advertising the same drives the feed is already promoting. Ordered
 * newest event first and capped, because a profile is a sample, not an archive.
 */
export function useOrganisationGallery(
  organisationId: string | undefined,
  options?: { enabled?: boolean; limit?: number }
) {
  const limit = options?.limit ?? 12;

  return useQuery({
    queryKey: [...outreachImageKeys.byOrganisation(organisationId ?? 'unknown'), limit] as const,
    enabled: !!organisationId && (options?.enabled ?? true),
    queryFn: async (): Promise<OrganisationGalleryImage[]> => {
      const today = new Date().toISOString().slice(0, 10);

      // Filtered through the embedded outreach with an inner join, so an image
      // whose event is still ahead is excluded by the query rather than
      // fetched and dropped here.
      const { data, error } = await supabase
        .from('outreach_images')
        .select('*, outreach:outreaches!inner (id, title, date, organisation_id, status)')
        .eq('outreach.organisation_id', organisationId!)
        .lt('outreach.date', today)
        .neq('outreach.status', 'draft')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message || 'Could not load this organisation’s gallery.');
      }

      return (data ?? []) as unknown as OrganisationGalleryImage[];
    },
  });
}

/** Postgres check violation — here, the eight-image cap trigger. */
function galleryWriteMessage(message: string): string {
  if (message.includes('at most 8')) {
    return `A gallery holds up to ${MAX_GALLERY_IMAGES} images. Remove one before adding another.`;
  }
  return message || 'Could not add that image. Please try again.';
}
