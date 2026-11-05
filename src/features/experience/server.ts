import { cookies } from 'next/headers';
import { cache } from 'react';
import { loadExperiences } from './load';
import type { ExperienceListResult } from './load';

/**
 * The Next-bound wrapper around `load.ts`, matching the property, room-type,
 * policy, media, facility and landmark servers: cookie forwarding, because a
 * Server Component has no browser to attach the `HttpOnly` session cookies, and
 * `cache()` so one render pass makes one call.
 */
export const propertyExperiences = cache(
  async (propertyId: string): Promise<ExperienceListResult> => {
    return loadExperiences(propertyId, (await cookies()).toString());
  },
);
