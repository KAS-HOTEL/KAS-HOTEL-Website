'use server';

import { revalidatePath } from 'next/cache';

/**
 * Cache invalidation after an experience change.
 *
 * The mutation itself is not a Server Action, for the same reason the property,
 * room-type, policy, media, facility and landmark forms are not: it needs the
 * browser's CSRF cookie and the `X-XSRF-TOKEN` header `lib/api` pairs with it.
 *
 * The completeness panel on the same page reads the publish checklist, and this
 * is the one child resource that can flip a checklist item, so a stale render
 * here would show a Partner a gate they have already cleared.
 */
export async function revalidateExperiences(propertyId: string): Promise<void> {
  revalidatePath(`/partner/properties/${propertyId}/information`, 'page');
}
