'use server';

import { revalidatePath } from 'next/cache';

/**
 * Cache invalidation after a review decision.
 *
 * <h2>Why the decision itself is not a Server Action</h2>
 *
 * The same reason a property save is not: the mutation needs the browser's CSRF
 * cookie and the `X-XSRF-TOKEN` header that `lib/api` pairs with it. A Server
 * Action posts from the Next server, which holds neither.
 *
 * <h2>Four paths, because a decision moves more than one screen</h2>
 *
 * Approving publishes the property, so the Partner's own pages are stale too —
 * the lifecycle badge on its overview and the portfolio row both change. The
 * queue must drop the row it just decided; the review page must show the new
 * status and the new history entry.
 */
export async function revalidateReview(propertyId: string): Promise<void> {
  revalidatePath('/admin/review');
  revalidatePath('/admin');
  revalidatePath(`/partner/properties/${propertyId}`);
  revalidatePath('/partner/properties');
}
