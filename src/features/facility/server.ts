import { cookies } from 'next/headers';
import { cache } from 'react';
import { loadFacilities } from './load';
import type { FacilityListResult } from './load';

/**
 * The Next-bound wrapper around `load.ts`, matching the property, room-type,
 * policy and media servers: cookie forwarding, because a Server Component has no
 * browser to attach the `HttpOnly` session cookies, and `cache()` so one render
 * pass makes one call.
 */
export const propertyFacilities = cache(
  async (propertyId: string): Promise<FacilityListResult> => {
    return loadFacilities(propertyId, (await cookies()).toString());
  },
);
