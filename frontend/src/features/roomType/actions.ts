'use server';

import { revalidatePath } from 'next/cache';

/**
 * Cache invalidation after a room-type create or edit.
 *
 * The save itself is not a Server Action, for the same reason sign-in and the
 * property form are not: it needs the browser's CSRF cookie and the
 * `X-XSRF-TOKEN` header `lib/api` pairs with it. A Server Action posts from the
 * Next server, which holds neither.
 *
 * Without this the list and the detail keep serving the pre-edit copy from the
 * router cache — and the `version` they carry would be stale, so the *next* save
 * would fail with a conflict the Partner could not explain.
 */
export async function revalidateRoomTypes(propertyId: string): Promise<void> {
  revalidatePath(`/partner/properties/${propertyId}/rooms`, 'page');
  revalidatePath(`/partner/properties/${propertyId}/rooms/[roomTypeId]`, 'page');
}
