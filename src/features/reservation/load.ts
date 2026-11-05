import { opsReservationsApi, type ReservationSearchFilters } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import type { ReservationDetail, ReservationPage } from '@/lib/domain/reservation';

/**
 * Turns the two reservation reads into states a page can render.
 *
 * Pure and transport-only, so every branch is testable without a running server.
 * Nothing here decides what a partner may see — the backend's scope filter does,
 * inside the SQL, including the count behind the page total.
 */

export type ReservationSearchResult =
  | { readonly status: 'ok'; readonly page: ReservationPage }
  | { readonly status: 'error'; readonly error: ApiError };

export type ReservationDetailResult =
  | { readonly status: 'ok'; readonly reservation: ReservationDetail }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * One page of reservations.
 *
 * **An empty page is a success.** "No reservation matches this search" and "the
 * search failed" are different facts, and rendering the first when the second is
 * true hides a broken screen behind a plausible-looking answer. The two states
 * stay separate all the way to the page.
 */
export async function loadReservations(
  filters: ReservationSearchFilters = {},
  cookieHeader?: string,
  locale = 'en',
): Promise<ReservationSearchResult> {
  try {
    return { status: 'ok', page: await opsReservationsApi.search(locale, filters, cookieHeader) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/**
 * One reservation.
 *
 * **404 is the ownership boundary.** A reference belonging to another partner
 * and one that never existed are the same answer, because the predicate lives in
 * the backend's SQL. Nothing here may re-describe it as "not permitted" — that
 * would leak the fact the 404 exists to hide.
 *
 * Unlike the sales detail, an OTA reservation is *not* a 404 here: doc 58 §6
 * defines this route for every channel.
 */
export async function loadReservation(
  reference: string,
  cookieHeader?: string,
  locale = 'en',
): Promise<ReservationDetailResult> {
  try {
    return {
      status: 'ok',
      reservation: await opsReservationsApi.detail(reference, locale, cookieHeader),
    };
  } catch (error) {
    const failure = asApiError(error);
    return failure.isNotFound ? { status: 'notFound' } : { status: 'error', error: failure };
  }
}

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError(0, {
        code: 'AVAILABILITY_UNAVAILABLE',
        message: 'Không thể kết nối tới hệ thống. Vui lòng thử lại.',
        details: [],
        correlationId: null,
      });
}
