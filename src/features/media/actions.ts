'use server';

import { revalidatePath } from 'next/cache';

/**
 * Cache invalidation after a media change.
 *
 * The mutation itself is not a Server Action, for the same reason the property,
 * room-type and policy forms are not: it needs the browser's CSRF cookie and the
 * `X-XSRF-TOKEN` header `lib/api` pairs with it.
 *
 * The overview is revalidated too: the publish checklist lives there, and
 * choosing a cover is precisely what can clear its "hero image" blocker.
 */
export async function revalidateGallery(propertyId: string): Promise<void> {
  revalidatePath(`/partner/properties/${propertyId}/media`, 'page');
  revalidatePath(`/partner/properties/${propertyId}`, 'page');
}

/** After a room gallery change: the room's media tab and its overview. */
export async function revalidateRoomGallery(
  propertyId: string,
  roomTypeId: string,
): Promise<void> {
  const room = `/partner/properties/${propertyId}/rooms/${roomTypeId}`;
  revalidatePath(`${room}/media`, 'page');
  revalidatePath(room, 'page');
}
