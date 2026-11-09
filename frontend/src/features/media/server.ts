import { cookies } from 'next/headers';
import { cache } from 'react';
import type { MediaOwnerType } from '@/lib/domain/media';
import { loadCovers, loadPropertyGallery, loadRoomGallery } from './load';
import type { CoverResult, PropertyGalleryResult, RoomGalleryResult } from './load';

/**
 * The Next-bound wrapper around `load.ts`, matching the property, room-type and
 * policy servers: cookie forwarding, because a Server Component has no browser to
 * attach the `HttpOnly` session cookies, and `cache()` so one render pass makes
 * one call.
 */
export const propertyGallery = cache(
  async (propertyId: string): Promise<PropertyGalleryResult> => {
    return loadPropertyGallery(propertyId, (await cookies()).toString());
  },
);

/** One room type's gallery, read with the caller's own session. */
export const roomGallery = cache(async (roomTypeId: string): Promise<RoomGalleryResult> => {
  return loadRoomGallery(roomTypeId, (await cookies()).toString());
});

/**
 * Every cover the session reaches, keyed by owner.
 *
 * `cache()` matters here for the same reason it does on `propertyList`: the
 * overview renders the cards and could render a second surface from the same
 * answer, and one render pass should make one call.
 */
export const mediaCovers = cache(async (ownerType: MediaOwnerType): Promise<CoverResult> => {
  return loadCovers(ownerType, (await cookies()).toString());
});
