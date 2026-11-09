import { mediaApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  galleryOrder,
  type GalleryItem,
  type MediaAssetView,
  type MediaCoverView,
  type MediaOwnerType,
} from '@/lib/domain/media';
import { isPropertyId } from '@/features/property/load';

/**
 * Turns a media request into a state a page can render.
 *
 * Pure and transport-only, like the property, room-type and policy loaders: it
 * takes a cookie header, calls `lib/api`, and returns a discriminated union, so
 * every branch is testable without a running server.
 */

export type RoomGalleryResult =
  | {
      readonly status: 'ok';
      /** The assets placed on this room type, cover first. */
      readonly items: readonly GalleryItem[];
      /** The partner's whole library, so an existing asset can be attached. */
      readonly library: readonly MediaAssetView[];
    }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * One room type's gallery.
 *
 * <h2>The same media architecture, a different owner</h2>
 *
 * `media_link.owner_type` has always had `ROOM_TYPE` beside `PROPERTY`, with
 * its own `display_order` and its own one-cover index. So a room gallery is not
 * a second storage system — it is the same assets, linked to a different owner,
 * which is exactly why a hotel photo cannot accidentally appear as a room photo:
 * the link says which it is.
 */
export async function loadRoomGallery(
  roomTypeId: string,
  cookieHeader?: string,
): Promise<RoomGalleryResult> {
  if (!isUuid(roomTypeId)) {
    // A malformed id cannot name a room type, so it cannot own media.
    return { status: 'ok', items: [], library: [] };
  }
  try {
    const library = await mediaApi.library(cookieHeader);
    const usages = await Promise.all(
      library.map((asset) => mediaApi.usages(asset.id, 'ROOM_TYPE', roomTypeId, cookieHeader)),
    );

    const items: GalleryItem[] = [];
    library.forEach((asset, index) => {
      for (const link of usages[index] ?? []) {
        if (link.ownerType === 'ROOM_TYPE' && link.ownerId === roomTypeId) {
          items.push({ asset, link });
        }
      }
    });

    return { status: 'ok', items: galleryOrder(items), library };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/** The same shape `isPropertyId` checks, for a room type's id. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export type PropertyGalleryResult =
  | {
      readonly status: 'ok';
      /** The assets placed on this property, cover first. */
      readonly items: readonly GalleryItem[];
      /** The partner's whole library, so an existing asset can be attached. */
      readonly library: readonly MediaAssetView[];
    }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * One property's gallery.
 *
 * <h2>Why this is assembled rather than fetched</h2>
 *
 * `/{assetId}/usages` answers "where is this asset used on this owner", so there
 * is no "gallery of property X" request to make. The library plus each asset's
 * usages is the frozen surface's own way of answering the question, and it
 * invents no endpoint. It costs one call per asset, which is fine while a
 * partner's library is small and worth revisiting when it is not.
 *
 * Both calls are scope-filtered by the backend, so this never sees another
 * partner's assets and a link it is shown was necessarily reachable. The owner
 * check below is therefore redundant with the backend and kept deliberately: it
 * is what makes this function's promise — *this property's* gallery — true of
 * the code rather than only of the endpoint it happens to call.
 */
export async function loadPropertyGallery(
  propertyId: string,
  cookieHeader?: string,
): Promise<PropertyGalleryResult> {
  if (!isPropertyId(propertyId)) {
    // A malformed id cannot name a property, so it cannot own media.
    return { status: 'ok', items: [], library: [] };
  }
  try {
    const library = await mediaApi.library(cookieHeader);
    const usages = await Promise.all(
      library.map((asset) => mediaApi.usages(asset.id, 'PROPERTY', propertyId, cookieHeader)),
    );

    const items: GalleryItem[] = [];
    library.forEach((asset, index) => {
      for (const link of usages[index] ?? []) {
        if (link.ownerType === 'PROPERTY' && link.ownerId === propertyId) {
          items.push({ asset, link });
        }
      }
    });

    return { status: 'ok', items: galleryOrder(items), library };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

export type CoverResult =
  | {
      readonly status: 'ok';
      /** Cover per owner id. An owner with none is simply absent. */
      readonly covers: ReadonlyMap<string, MediaCoverView>;
    }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * Every cover the session can reach, for one kind of owner.
 *
 * <h2>One request, not one per row</h2>
 *
 * `loadPropertyGallery` assembles a gallery from the library plus each asset's
 * usages, which is the frozen surface's own answer for the single owner a media
 * screen edits. A portfolio asks a different question — the cover of each hotel —
 * and the same technique would cost the library once per property. `GET
 * /admin/media/covers` answers the list's question directly.
 *
 * <h2>Failure degrades, it does not hide</h2>
 *
 * A card whose cover could not be fetched shows the placeholder it always had.
 * The error is returned rather than swallowed, so the page can say that covers
 * are unavailable instead of quietly implying every hotel lacks one — a silent
 * empty map would make a backend fault indistinguishable from an operator who
 * has not chosen a picture yet.
 */
export async function loadCovers(
  ownerType: MediaOwnerType,
  cookieHeader?: string,
): Promise<CoverResult> {
  try {
    const covers = await mediaApi.covers(ownerType, cookieHeader);
    return {
      status: 'ok',
      covers: new Map(covers.map((cover) => [cover.ownerId, cover])),
    };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/**
 * Anything that is not already an `ApiError` becomes one. Status `0` because
 * there was no response — it is not a 500, and pretending it was would send the
 * user looking for a correlation id that never existed.
 */
function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError(0, {
    code: 'INTERNAL_ERROR',
    message: 'The service could not be reached.',
    details: [],
    correlationId: null,
  });
}
