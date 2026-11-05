import { cookies } from 'next/headers';
import { cache } from 'react';
import { loadQueue, loadReview, type QueueResult, type ReviewResult } from './load';

/**
 * Server-side reads for the review workflow.
 *
 * The session is `HttpOnly`, so every call forwards the request's own cookie
 * header — the browser never holds a token and no client component can read one.
 * `cache` dedupes within a render, so a page and its metadata reading the same
 * submission make one request.
 */
export const reviewQueue = cache(async (): Promise<QueueResult> => {
  return loadQueue((await cookies()).toString());
});

export const reviewDetail = cache(async (submissionId: string): Promise<ReviewResult> => {
  return loadReview(submissionId, (await cookies()).toString());
});

/**
 * The wall clock, read on the server.
 *
 * A function rather than an inline `Date.now()` because the lint rule that
 * forbids impure calls during render is right: a component that reads the clock
 * as it renders produces a different tree on every re-render. Reading it here,
 * once, and passing the number down keeps the components pure — and keeps the
 * "waited for" figures anchored to the server's clock rather than the reader's.
 */
export async function serverNow(): Promise<number> {
  return Date.now();
}
