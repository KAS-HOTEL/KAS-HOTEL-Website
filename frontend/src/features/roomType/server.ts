import { cookies } from 'next/headers';
import { cache } from 'react';
import { loadAmenityCatalog, loadRoomTypeDetail, loadRoomTypes } from './load';
import type { AmenityCatalogResult, RoomTypeDetailResult, RoomTypeListResult } from './load';

/**
 * The Next-bound wrappers around `load.ts`, matching `features/property/server.ts`.
 *
 * Cookie forwarding, because a Server Component has no browser to attach the
 * `HttpOnly` session cookies; and `cache()`, so a page that needs both the room
 * list and the property context makes one call each per render pass rather than
 * one per component that asks.
 */

export const roomTypeList = cache(async (propertyId: string): Promise<RoomTypeListResult> => {
  return loadRoomTypes(propertyId, (await cookies()).toString());
});

export const roomTypeDetail = cache(
  async (propertyId: string, roomTypeId: string): Promise<RoomTypeDetailResult> => {
    return loadRoomTypeDetail(propertyId, roomTypeId, (await cookies()).toString());
  },
);

export const amenityCatalog = cache(async (): Promise<AmenityCatalogResult> => {
  return loadAmenityCatalog((await cookies()).toString());
});
