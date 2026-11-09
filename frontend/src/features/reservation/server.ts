import { cookies } from 'next/headers';
import { cache } from 'react';
import type { ReservationSearchFilters } from '@/lib/api/endpoints';
import { loadReservation, loadReservations } from './load';
import type { ReservationDetailResult, ReservationSearchResult } from './load';

/**
 * Server-side reads for the reservation workspace.
 *
 * A Server Component has no browser to attach cookies, so the incoming `Cookie`
 * header is forwarded explicitly — the same seam every other authenticated read
 * in this application uses. `cache` deduplicates within one render pass.
 */

/**
 * One page of reservations, filtered by whatever the URL says.
 *
 * The filters arrive from the search parameters, so the server renders exactly
 * what the address bar claims — a refresh, a bookmark and a shared link all
 * reproduce the same page, and there is no client state to drift out of sync
 * with it. `cache` keys on the argument, so two different filter sets in one
 * render are two reads rather than one wrong one.
 */
export const reservationSearch = cache(
  async (filters: ReservationSearchFilters = {}): Promise<ReservationSearchResult> => {
    return loadReservations(filters, (await cookies()).toString());
  },
);

export const reservation = cache(async (reference: string): Promise<ReservationDetailResult> => {
  return loadReservation(reference, (await cookies()).toString());
});
