'use server';

import { revalidatePath } from 'next/cache';

/**
 * Cache invalidation after a policy change.
 *
 * The mutation itself is not a Server Action, for the same reason the property
 * and room-type forms are not: it needs the browser's CSRF cookie and the
 * `X-XSRF-TOKEN` header `lib/api` pairs with it.
 */
export async function revalidatePolicies(propertyId: string, shared = false): Promise<void> {
  if (shared) { revalidatePath('/partner/policies'); return; }
  revalidatePath(`/partner/properties/${propertyId}/policies`, 'page');
}
