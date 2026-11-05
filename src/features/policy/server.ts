import { cookies } from 'next/headers';
import { cache } from 'react';
import { loadPolicies } from './load';
import type { PolicyListResult } from './load';

/**
 * The Next-bound wrapper around `load.ts`, matching the property and room-type
 * servers: cookie forwarding, because a Server Component has no browser to attach
 * the `HttpOnly` session cookies, and `cache()` so one render pass makes one call.
 */
export const policyList = cache(async (propertyId: string): Promise<PolicyListResult> => {
  return loadPolicies(propertyId, (await cookies()).toString());
});
