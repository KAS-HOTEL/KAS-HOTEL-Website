import { cookies } from 'next/headers';
import { cache } from 'react';
import { loadLandmarks } from './load';
import type { LandmarkListResult } from './load';

/**
 * The Next-bound wrapper around `load.ts`, matching the property, room-type,
 * policy, media and facility servers: cookie forwarding, because a Server
 * Component has no browser to attach the `HttpOnly` session cookies, and
 * `cache()` so one render pass makes one call.
 */
export const propertyLandmarks = cache(
  async (propertyId: string): Promise<LandmarkListResult> => {
    return loadLandmarks(propertyId, (await cookies()).toString());
  },
);
