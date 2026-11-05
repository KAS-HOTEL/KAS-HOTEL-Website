'use server';

import { revalidatePath } from 'next/cache';

/**
 * Cache invalidation after a rate change.
 *
 * The mutation itself is not a Server Action, for the same reason no other form
 * here is: it needs the browser's CSRF cookie and the `X-XSRF-TOKEN` header
 * `lib/api` pairs with it.
 *
 * Without this the calendar keeps serving pre-edit prices from the router cache.
 * The backend is authoritative — a bulk apply re-derives its effect under lock
 * and may write something the preview did not predict — so the grid is refetched
 * rather than patched in place from the response.
 */
export async function revalidateRates(propertyId: string): Promise<void> {
  revalidatePath(`/partner/properties/${propertyId}/rates`, 'page');
  revalidatePath(`/partner/properties/${propertyId}/calendar`, 'page');
}
