import { cookies } from 'next/headers';
import { cache } from 'react';
import { loadPropertyDetail, loadPropertyList } from './load';
import type { PropertyDetailResult, PropertyListResult } from './load';
import { loadPublishingBoard } from './publishing';
import type { PublishingBoardResult } from './publishing';

/**
 * The Next-bound wrappers around `load.ts`.
 *
 * Two jobs, both of which are the reason this file is separate from the pure
 * loaders:
 *
 * <ol>
 *   <li><strong>Cookie forwarding.</strong> A Server Component has no browser to
 *       attach the `HttpOnly` session cookies, so the incoming `Cookie` header is
 *       read once and passed explicitly to the client.</li>
 *   <li><strong>Request-scoped memoisation.</strong> The protected layout renders
 *       the property switcher and the page renders the list, and both need the
 *       same scoped list. `cache()` collapses that into one backend call per
 *       render pass instead of two identical ones.</li>
 * </ol>
 */

export const propertyList = cache(async (): Promise<PropertyListResult> => {
  return loadPropertyList((await cookies()).toString());
});

export const propertyDetail = cache(async (propertyId: string): Promise<PropertyDetailResult> => {
  return loadPropertyDetail(propertyId, (await cookies()).toString());
});

/** The Admin publishing board — properties, covers, open submissions, checklists. */
export const publishingBoard = cache(async (): Promise<PublishingBoardResult> => {
  return loadPublishingBoard((await cookies()).toString());
});
