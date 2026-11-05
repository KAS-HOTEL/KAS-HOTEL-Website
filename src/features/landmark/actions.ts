'use server';

import { revalidatePath } from 'next/cache';

/**
 * Cache invalidation after a landmark change.
 *
 * The mutation itself is not a Server Action, for the same reason the property,
 * room-type, policy, media and facility forms are not: it needs the browser's
 * CSRF cookie and the `X-XSRF-TOKEN` header `lib/api` pairs with it.
 */
export async function revalidateLandmarks(propertyId: string): Promise<void> {
  revalidatePath(`/partner/properties/${propertyId}/information`, 'page');
}
