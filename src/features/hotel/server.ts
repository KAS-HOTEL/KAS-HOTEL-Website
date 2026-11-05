import { publicHotelsApi } from '@/lib/api/endpoints';
import type { PublicMediaView } from '@/lib/domain/media';
import { cache } from 'react';
import {
  loadAvailability,
  loadProperty,
  loadPublishedProperties,
  loadAmenityTaxonomy,
  loadFacilities,
  loadPolicies,
  loadReceipt,
  loadRoomTypes,
  loadTripIntents,
} from './load';
import type {
  AvailabilityResult,
  PropertyResult,
  PublishedPropertiesResult,
  AmenityTaxonomyResult,
  FacilitiesResult,
  PoliciesResult,
  ReceiptResult,
  RoomTypesResult,
  TripIntentsResult,
} from './load';

/**
 * The Next-bound wrappers around `load.ts`.
 *
 * `cache()` so one render pass makes one call — `generateMetadata` and the page
 * body both need the property, and a guest page should not fetch it twice.
 *
 * **No cookies are forwarded.** Unlike every console loader, these routes are
 * `@PublicEndpoint` and take no session: omitting the cookie guarantees the
 * response cannot vary by who is signed in.
 */
export const publishedProperties = cache(
  async (
    locale: string,
    district?: string,
    amenity?: string,
  ): Promise<PublishedPropertiesResult> =>
    loadPublishedProperties(locale, {
      ...(district === undefined ? {} : { district }),
      ...(amenity === undefined ? {} : { amenity }),
    }),
);

export const publicTripIntents = cache(
  async (locale: string): Promise<TripIntentsResult> => loadTripIntents(locale),
);

export const publicProperty = cache(
  async (slug: string, locale: string): Promise<PropertyResult> => loadProperty(slug, locale),
);

export const publicRoomTypes = cache(
  async (slug: string, locale: string): Promise<RoomTypesResult> => loadRoomTypes(slug, locale),
);

/** The guest's own receipt, reopened by reference. No cookie: the route is public. */
export const publicReceipt = cache(
  async (reference: string): Promise<ReceiptResult> => loadReceipt(reference),
);

export const publicPolicies = cache(
  async (slug: string, locale: string): Promise<PoliciesResult> => loadPolicies(slug, locale),
);

export const publicAmenityTaxonomy = cache(
  async (locale: string): Promise<AmenityTaxonomyResult> => loadAmenityTaxonomy(locale),
);

export const publicFacilities = cache(
  async (slug: string, locale: string): Promise<FacilitiesResult> => loadFacilities(slug, locale),
);

export const publicAvailability = cache(
  async (
    slug: string,
    checkIn: string,
    checkOut: string,
    locale: string,
  ): Promise<AvailabilityResult> => loadAvailability(slug, checkIn, checkOut, locale),
);

/**
 * Every published room type's photographs, keyed by room-type slug.
 *
 * <h2>One call per room type, in parallel</h2>
 *
 * The public contract is per room type — `.../room-types/{slug}/gallery` — so a
 * hotel with four room types is four requests. They are independent, so they run
 * together rather than in sequence.
 *
 * <h2>A gallery that fails is an absent gallery, never a failed page</h2>
 *
 * A room with no photographs and a room whose photographs could not be fetched
 * both render without a gallery. The hotel page is about the hotel; losing the
 * pictures must not lose the description, the policies and the booking form
 * with them.
 */
export const publicRoomGalleries = cache(
  async (
    slug: string,
    roomTypeSlugs: readonly string[],
    locale: string,
  ): Promise<Readonly<Record<string, readonly PublicMediaView[]>>> => {
    const galleries = await Promise.all(
      roomTypeSlugs.map((roomTypeSlug) =>
        publicHotelsApi
          .roomGallery(slug, roomTypeSlug, locale)
          .catch((): readonly PublicMediaView[] => []),
      ),
    );

    const byRoomType: Record<string, readonly PublicMediaView[]> = {};
    roomTypeSlugs.forEach((roomTypeSlug, index) => {
      byRoomType[roomTypeSlug] = galleries[index] ?? [];
    });
    return byRoomType;
  },
);

/**
 * The hotel's own photographs — exterior, lobby, facilities.
 *
 * <h2>An empty gallery is not a failed page</h2>
 *
 * A hotel with no published media and a hotel whose media could not be fetched
 * both render without a gallery. Losing the pictures must not lose the
 * description, the rooms and the booking form with them.
 */
export const publicPropertyGallery = cache(
  async (slug: string, locale: string): Promise<readonly PublicMediaView[]> =>
    publicHotelsApi.gallery(slug, locale).catch((): readonly PublicMediaView[] => []),
);

/**
 * Each hotel's cover photograph, keyed by slug — for the listing cards.
 *
 * <h2>Why the gallery endpoint rather than a new field</h2>
 *
 * The list response (`PublishedProperty`) carries no media, and adding a
 * `coverImageUrl` to it would have been a backend change for something the
 * public gallery already answers. The portfolio is one response with no
 * pagination, so this is a handful of parallel reads, not an unbounded fan-out —
 * and it reuses a contract that already exists.
 *
 * <p>Cover first is the endpoint's own ordering, so `[0]` is the cover when one
 * is set and the first arranged photograph otherwise.
 */
export const publicPropertyCovers = cache(
  async (
    slugs: readonly string[],
    locale: string,
  ): Promise<Readonly<Record<string, PublicMediaView>>> => {
    const galleries = await Promise.all(
      slugs.map((slug) =>
        publicHotelsApi.gallery(slug, locale).catch((): readonly PublicMediaView[] => []),
      ),
    );

    const covers: Record<string, PublicMediaView> = {};
    slugs.forEach((slug, index) => {
      const first = galleries[index]?.[0];
      if (first) {
        covers[slug] = first;
      }
    });
    return covers;
  },
);
