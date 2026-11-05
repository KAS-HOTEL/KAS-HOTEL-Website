import { cookies } from 'next/headers';
import { cache } from 'react';
import type { SalesQueueFilters } from '@/lib/api/endpoints';
import { loadSalesEmailDeliveries, loadSalesNotes, loadSalesQueue, loadSalesQueueCounts, loadSalesRequest } from './load';
import type { SalesEmailDeliveriesResult, SalesNotesResult, SalesQueueResult, SalesRequestResult } from './load';

/**
 * Server-side reads for the direct sales queue.
 *
 * A Server Component has no browser to attach cookies, so the incoming `Cookie`
 * header is forwarded explicitly — the same seam every other authenticated read
 * in this application uses. `cache` deduplicates within one render pass.
 */

/**
 * The queue, optionally filtered.
 *
 * The filters arrive from the URL's search parameters, so the server renders
 * exactly what the address bar says — a refresh, a bookmark and a shared link
 * all reproduce the same list. `cache` keys on the argument, so two different
 * filter sets in one render are two reads rather than one wrong one.
 */
export const salesQueue = cache(
  async (filters: SalesQueueFilters = {}): Promise<SalesQueueResult> => {
    return loadSalesQueue((await cookies()).toString(), 'en', filters);
  },
);

export const salesQueueCounts = cache(async (property: string | undefined, q?: string) => {
  return loadSalesQueueCounts((await cookies()).toString(), property, q);
});

export const salesRequest = cache(async (reference: string): Promise<SalesRequestResult> => {
  return loadSalesRequest(reference, (await cookies()).toString());
});

/**
 * The server's clock, read on the server.
 *
 * A function rather than an inline `Date.now()` in the page: calling it during
 * render is an impure call the compiler rejects, and a module-level constant
 * would freeze at build time and silently stop ageing. Reading it here also
 * keeps the SLA banding on the same clock as the data it bands — a request and
 * its deadline are compared against one instant, not two.
 */
/** The internal notes for one request, read with the caller's own session. */
export const salesNotes = cache(async (reference: string): Promise<SalesNotesResult> => {
  return loadSalesNotes(reference, (await cookies()).toString());
});

export const salesEmailDeliveries = cache(async (reference: string): Promise<SalesEmailDeliveriesResult> => {
  return loadSalesEmailDeliveries(reference, (await cookies()).toString());
});

export async function serverNow(): Promise<number> {
  return Date.now();
}
