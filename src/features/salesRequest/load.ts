import {
  salesRequestsApi,
  type SalesQueueCounts,
  type SalesQueueFilters,
  type SalesRequestNote,
} from '@/lib/api/endpoints';
import type { EmailDeliveryStatus } from '@/lib/api/endpoints/salesRequests';
import { ApiError } from '@/lib/api/errors';
import type { SalesRequestDetail, SalesRequestSummary } from '@/lib/domain/salesRequest';

/**
 * Turns the two sales reads into states a page can render.
 *
 * Pure and transport-only, so every branch is testable without a running server.
 * Nothing here decides what a partner may see — the backend's scope filter does,
 * inside the SQL.
 */

export type SalesQueueResult =
  | { readonly status: 'ok'; readonly requests: readonly SalesRequestSummary[] }
  | { readonly status: 'error'; readonly error: ApiError };

/** Tab counts. A failure leaves the tabs without numbers rather than breaking the queue. */
export async function loadSalesQueueCounts(
  cookieHeader: string | undefined,
  property: string | undefined,
  q?: string,
): Promise<SalesQueueCounts | null> {
  try {
    return await salesRequestsApi.counts(property, cookieHeader, q);
  } catch {
    return null;
  }
}

export type SalesNotesResult =
  | { readonly status: 'ok'; readonly notes: readonly SalesRequestNote[] }
  | { readonly status: 'error'; readonly error: ApiError };

export type SalesEmailDeliveriesResult =
  | { readonly status: 'ok'; readonly deliveries: readonly EmailDeliveryStatus[] }
  | { readonly status: 'error'; readonly error: ApiError };

export type SalesRequestResult =
  | { readonly status: 'ok'; readonly request: SalesRequestDetail }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly error: ApiError };

/**
 * The queue.
 *
 * An **empty array is a success**: a partner with no outstanding requests is the
 * ordinary state, not an error and not a broken screen.
 */
export async function loadSalesQueue(
  cookieHeader?: string,
  locale = 'en',
  filters: SalesQueueFilters = {},
): Promise<SalesQueueResult> {
  try {
    return {
      status: 'ok',
      requests: await salesRequestsApi.queue(locale, filters, cookieHeader),
    };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/**
 * One request.
 *
 * **404 is the ownership boundary.** A reference belonging to another partner, an
 * OTA reservation and a reference that never existed are one answer, because the
 * predicate lives in the backend's SQL. Nothing here may re-describe it as "not
 * permitted" — that would leak the fact the 404 exists to hide.
 */
export async function loadSalesRequest(
  reference: string,
  cookieHeader?: string,
  locale = 'en',
): Promise<SalesRequestResult> {
  try {
    return { status: 'ok', request: await salesRequestsApi.detail(reference, locale, cookieHeader) };
  } catch (error) {
    const failure = asApiError(error);
    return failure.isNotFound ? { status: 'notFound' } : { status: 'error', error: failure };
  }
}

/**
 * The internal notes for one request.
 *
 * A failure is its own state rather than an empty list: "nobody has written
 * anything" and "the notes could not be loaded" are different facts, and showing
 * the first when the second is true would hide a problem.
 */
export async function loadSalesNotes(
  reference: string,
  cookieHeader?: string,
): Promise<SalesNotesResult> {
  try {
    return { status: 'ok', notes: await salesRequestsApi.notes(reference, cookieHeader) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
  }
}

/** Delivery state is separate from the booking decision. */
export async function loadSalesEmailDeliveries(
  reference: string,
  cookieHeader?: string,
): Promise<SalesEmailDeliveriesResult> {
  try {
    return { status: 'ok', deliveries: await salesRequestsApi.emailDeliveries(reference, cookieHeader) };
  } catch (error) {
    return { status: 'error', error: asApiError(error) };
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
